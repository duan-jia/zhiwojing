import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const API = 'http://localhost:8000';
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 560;
const MOVE_STEP = 24;

interface Profile { interests: string[]; style: string }
interface User { id: number; name: string; profile: Profile }
interface Draft { draft: string; rationale: string[]; profile: { name: string; interests: string[]; style: string } }
interface HotListItem { title: string; url: string; thumbnailUrl: string; summary: string }
interface HotListResponse { total: number; items: HotListItem[] }
interface SearchItem {
  title: string;
  contentType: string;
  contentText: string;
  url: string;
  voteUpCount: number;
  commentCount: number;
  authorName: string;
}
interface SearchResponse { hasMore: boolean; items: SearchItem[]; emptyReason?: string | null }
interface AnswerResponse { answer: string; model: string }
interface QuestionRecommendation { title: string; url: string }
interface QuestionRecommendationsResponse {
  mode: 'topic' | 'service_account_profile';
  items: QuestionRecommendation[];
}
interface Position { x: number; y: number }
type Place = 'studio' | 'hot' | 'explore';
type ExploreMode = 'discover' | 'zhihu' | 'global' | 'answer';

const placeCenters: Record<Place, Position> = {
  studio: {x: 184, y: 174},
  hot: {x: 795, y: 174},
  explore: {x: 780, y: 430},
};

const placeNames: Record<Place, string> = {
  studio: '创作屋',
  hot: '热榜广场',
  explore: '探索馆',
};

function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null;
  const detail = body.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }
  return null;
}

async function request<T>(path: string, options?: RequestInit, timeoutMs = 15000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, {
      ...options,
      credentials: options?.credentials ?? 'include',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('连接失败或请求超时，请检查服务后重试。');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(errorMessage(body) || '请求失败，请稍后重试。');
  }
  return response.json();
}

function isNear(position: Position, target: Position): boolean {
  return Math.hypot(position.x - target.x, position.y - target.y) < 118;
}

function App() {
  const [me, setMe] = useState<User | null>(null);
  const [profileError, setProfileError] = useState('');
  const [position, setPosition] = useState<Position>({x: 500, y: 455});
  const [activePlace, setActivePlace] = useState<Place | null>(null);
  const [hotList, setHotList] = useState<HotListResponse | null>(null);
  const [hotLoading, setHotLoading] = useState(false);
  const [hotError, setHotError] = useState('');
  const [exploreMode, setExploreMode] = useState<ExploreMode>('discover');
  const [exploreQuery, setExploreQuery] = useState('');
  const [searchDb, setSearchDb] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [answerModel, setAnswerModel] = useState('zhida-fast-1p5');
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResponse | null>(null);
  const [questionResult, setQuestionResult] = useState<QuestionRecommendationsResponse | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState('');
  const [idea, setIdea] = useState('');
  const [goal, setGoal] = useState('知乎回答');
  const [tone, setTone] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const tooShort = Array.from(idea.trim()).length < 3;
  const nearbyPlace: Place | null = (Object.keys(placeCenters) as Place[])
    .find(place => isNear(position, placeCenters[place])) ?? null;

  async function loadProfile() {
    setProfileError('');
    try {
      setMe(await request<User>('/api/me'));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '用户资料加载失败。');
    }
  }

  async function loadHotList(force = false) {
    if (hotLoading || (hotList && !force)) return;
    setHotLoading(true);
    setHotError('');
    try {
      setHotList(await request<HotListResponse>('/api/zhihu/hot?limit=10'));
    } catch (error) {
      setHotError(error instanceof Error ? error.message : '热榜加载失败。');
    } finally {
      setHotLoading(false);
    }
  }

  function openPlace(place: Place) {
    setActivePlace(place);
    if (place === 'hot') void loadHotList();
  }

  async function explore() {
    const query = exploreQuery.trim();
    if (exploreLoading || Array.from(query).length < 2) return;
    setExploreLoading(true);
    setExploreError('');
    setSearchResult(null);
    setAnswerResult(null);
    setQuestionResult(null);
    try {
      if (exploreMode === 'discover') {
        const params = new URLSearchParams({query, count: '5'});
        setQuestionResult(await request<QuestionRecommendationsResponse>(`/api/zhihu/question-recommendations?${params.toString()}`));
      } else if (exploreMode === 'answer') {
        setAnswerResult(await request<AnswerResponse>('/api/zhihu/answer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({query, model: answerModel}),
        }, 65000));
      } else {
        const params = new URLSearchParams({query, count: '10'});
        if (exploreMode === 'global') {
          params.set('search_db', searchDb);
          if (searchFilter.trim()) params.set('filter', searchFilter.trim());
        }
        const path = exploreMode === 'global' ? '/api/zhihu/global-search' : '/api/zhihu/search';
        setSearchResult(await request<SearchResponse>(`${path}?${params.toString()}`));
      }
    } catch (error) {
      setExploreError(error instanceof Error ? error.message : '探索失败，请重试。');
    } finally {
      setExploreLoading(false);
    }
  }

  function useQuestionForDraft(question: QuestionRecommendation) {
    setIdea(question.title);
    setGoal('知乎回答');
    setDraftError('');
    setActivePlace('studio');
  }

  function selectExploreMode(mode: ExploreMode) {
    setExploreMode(mode);
    setExploreError('');
    setQuestionResult(null);
    setSearchResult(null);
    setAnswerResult(null);
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
      if (event.key === 'Escape' && activePlace) {
        setActivePlace(null);
        return;
      }
      if (editing || activePlace) return;

      const key = event.key.toLowerCase();
      if (key === 'e' && nearbyPlace) {
        event.preventDefault();
        openPlace(nearbyPlace);
        return;
      }

      const movement: Record<string, Position> = {
        arrowup: {x: 0, y: -MOVE_STEP},
        w: {x: 0, y: -MOVE_STEP},
        arrowdown: {x: 0, y: MOVE_STEP},
        s: {x: 0, y: MOVE_STEP},
        arrowleft: {x: -MOVE_STEP, y: 0},
        a: {x: -MOVE_STEP, y: 0},
        arrowright: {x: MOVE_STEP, y: 0},
        d: {x: MOVE_STEP, y: 0},
      };
      const delta = movement[key];
      if (!delta) return;
      event.preventDefault();
      setPosition(current => ({
        x: Math.min(WORLD_WIDTH - 30, Math.max(30, current.x + delta.x)),
        y: Math.min(WORLD_HEIGHT - 30, Math.max(30, current.y + delta.y)),
      }));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePlace, nearbyPlace, hotList, hotLoading]);

  async function generate() {
    if (draftLoading || tooShort) return;
    setDraftLoading(true);
    setDraftError('');
    try {
      setDraft(await request<Draft>('/api/avatar/draft', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idea: idea.trim(), goal, tone: tone || null}),
      }));
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '生成失败，请重试。');
    } finally {
      setDraftLoading(false);
    }
  }

  return <main>
    <nav>
      <div><span className="logo-mark">分</span><span className="logo">分身小镇</span></div>
      <div className="player-status"><span className="online-dot"/> {me?.name || (profileError ? '离线旅人' : '载入中')}</div>
    </nav>

    <header className="game-header">
      <div><p className="eyebrow">AVATAR TOWN · DAY 01</p><h1>去镇上走走，<br/><em>遇见新的灵感。</em></h1></div>
      <div className="controls-card" aria-label="游戏操作说明">
        <span><kbd>WASD</kbd> / <kbd>方向键</kbd></span><strong>移动</strong>
        <span><kbd>E</kbd></span><strong>互动</strong>
      </div>
    </header>

    {profileError && <div className="notice error-notice" role="alert">{profileError} <button onClick={() => void loadProfile()}>重新连接</button></div>}

    <section className="world-shell" aria-label="分身小镇地图">
      <div className="world-grid"/><div className="river" aria-hidden="true"/>
      <div className="bridge" aria-hidden="true"><i/><i/><i/><i/></div>
      <div className="tree tree-one" aria-hidden="true">♣</div><div className="tree tree-two" aria-hidden="true">♣</div>
      <div className="tree tree-three" aria-hidden="true">♣</div><div className="tree tree-four" aria-hidden="true">♣</div>
      <div className="bench" aria-hidden="true">═</div>

      <div className={`place studio-place ${nearbyPlace === 'studio' ? 'is-near' : ''}`}>
        <span className="building studio-building"><i>✎</i></span><strong>创作屋</strong><small>整理你的想法</small>
      </div>
      <div className={`place hot-place ${nearbyPlace === 'hot' ? 'is-near' : ''}`}>
        <span className="building hot-building"><i>热</i></span><strong>热榜广场</strong><small>看看大家在聊什么</small>
      </div>
      <div className={`place explore-place ${nearbyPlace === 'explore' ? 'is-near' : ''}`}>
        <span className="building explore-building"><i>寻</i></span><strong>探索馆</strong><small>搜索与直答</small>
      </div>

      <div className="avatar" style={{left: `${position.x / WORLD_WIDTH * 100}%`, top: `${position.y / WORLD_HEIGHT * 100}%`}} aria-label="你的角色">
        <span className="avatar-shadow"/><span className="avatar-body">人</span><span className="name-tag">{me?.name || '旅人'}</span>
      </div>
      {nearbyPlace && !activePlace && <button className="interaction-prompt" onClick={() => openPlace(nearbyPlace)}><kbd>E</kbd> 进入{placeNames[nearbyPlace]}</button>}
    </section>

    <footer>
      <span>兴趣 · {me?.profile.interests.join(' / ') || '加载中'}</span>
      <span>表达风格 · {me?.profile.style || '加载中'}</span>
      <span className="map-tip">地图将随着新能力继续生长</span>
    </footer>

    {activePlace && <div className="modal-backdrop" role="presentation" onMouseDown={() => setActivePlace(null)}>
      <section className={`place-panel ${activePlace === 'studio' ? 'studio-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="place-title" onMouseDown={event => event.stopPropagation()}>
        <button className="close-button" onClick={() => setActivePlace(null)} aria-label="关闭">×</button>
        {activePlace === 'hot' ? <>
          <div className="panel-heading">
            <div><p className="eyebrow">ZHIHU · LIVE</p><h2 id="place-title">热榜广场</h2></div>
            <button className="secondary-button" disabled={hotLoading} onClick={() => void loadHotList(true)}>{hotLoading ? '刷新中…' : '刷新热榜'}</button>
          </div>
          <p className="panel-intro">此刻正在发生的讨论。热度不等于事实，打开原文看看完整语境。</p>
          {hotLoading && !hotList && <div className="panel-state"><span className="loader"/>正在连接知乎广场…</div>}
          {hotError && <div className="panel-state error-state" role="alert"><strong>暂时没有听见广场的声音</strong><span>{hotError}</span><button onClick={() => void loadHotList(true)}>重试</button></div>}
          {hotList && <div className="hot-list">
            {hotList.items.length === 0 && <div className="panel-state">当前热榜为空。</div>}
            {hotList.items.map((item, index) => <article className="hot-item" key={`${item.url}-${index}`}>
              <span className="hot-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="hot-copy"><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>{item.summary && <p>{item.summary}</p>}</div>
              {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy"/>}
            </article>)}
          </div>}
        </> : activePlace === 'explore' ? <>
          <div className="panel-heading"><div><p className="eyebrow">SEARCH · DISCOVER</p><h2 id="place-title">探索馆</h2></div></div>
          <p className="panel-intro">发现适合回答的问题，或从知乎经验、全网资料和知乎直答中寻找线索。结果请打开原文核对。</p>
          <div className="explore-tabs" role="tablist" aria-label="探索方式">
            <button className={exploreMode === 'discover' ? 'active' : ''} onClick={() => selectExploreMode('discover')}>问题发现</button>
            <button className={exploreMode === 'zhihu' ? 'active' : ''} onClick={() => selectExploreMode('zhihu')}>知乎搜索</button>
            <button className={exploreMode === 'global' ? 'active' : ''} onClick={() => selectExploreMode('global')}>全网搜索</button>
            <button className={exploreMode === 'answer' ? 'active' : ''} onClick={() => selectExploreMode('answer')}>知乎直答</button>
          </div>
          <div className="explore-form">
            <input value={exploreQuery} onChange={event => {setExploreQuery(event.target.value); setExploreError('');}} onKeyDown={event => {if (event.key === 'Enter') void explore();}} placeholder={exploreMode === 'discover' ? '输入想创作的主题，如 AI Agent' : exploreMode === 'answer' ? '输入你想了解的问题' : '输入至少 2 个字的关键词'}/>
            <button className="primary-button" disabled={exploreLoading || Array.from(exploreQuery.trim()).length < 2} onClick={() => void explore()}>{exploreLoading ? '探索中…' : '开始探索'}</button>
          </div>
          {exploreMode === 'global' && <div className="explore-options">
            <label>索引库<select value={searchDb} onChange={event => setSearchDb(event.target.value)}><option value="all">全部</option><option value="realtime">实时</option><option value="static">静态</option></select></label>
            <label>高级筛选（可选）<input value={searchFilter} onChange={event => setSearchFilter(event.target.value)} placeholder={'例如 host=="example.com"'}/></label>
          </div>}
          {exploreMode === 'answer' && <div className="explore-options"><label>回答模式<select value={answerModel} onChange={event => setAnswerModel(event.target.value)}><option value="zhida-fast-1p5">快速回答</option><option value="zhida-thinking-1p5">深度思考</option><option value="zhida-agent">智能检索</option></select></label></div>}
          {exploreError && <div className="explore-message error-state" role="alert">{exploreError}</div>}
          {questionResult && <div className="question-results">
            {questionResult.items.length === 0 && <div className="explore-message">暂时没有推荐问题，换个主题试试。</div>}
            {questionResult.items.map((item, index) => <article className="question-item" key={`${item.url}-${index}`}>
              <div><span className="question-number">{String(index + 1).padStart(2, '0')}</span><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></div>
              <button className="secondary-button" onClick={() => useQuestionForDraft(item)}>用它写草稿</button>
            </article>)}
          </div>}
          {searchResult && <div className="search-results">
            {searchResult.items.length === 0 && <div className="explore-message">{searchResult.emptyReason || '没有找到相关内容，换个关键词试试。'}</div>}
            {searchResult.items.map((item, index) => <article className="search-item" key={`${item.url}-${index}`}>
              <div><span>{item.contentType || '内容'}</span><span>{item.authorName || '知乎用户'}</span><span>赞同 {item.voteUpCount}</span><span>评论 {item.commentCount}</span></div>
              <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <p>{item.contentText}</p>
            </article>)}
          </div>}
          {answerResult && <article className="answer-result"><small>{answerResult.model}</small><div>{answerResult.answer}</div></article>}
          {!exploreLoading && !questionResult && !searchResult && !answerResult && !exploreError && <div className="explore-empty">选择一种方式，开始寻找资料。</div>}
        </> : <>
          <div className="panel-heading"><div><p className="eyebrow">YOUR DIGITAL VOICE</p><h2 id="place-title">创作屋</h2></div></div>
          <p className="panel-intro">把零散的念头放在桌上，分身会帮你整理成想说的样子。</p>
          <div className="studio-workspace">
            <div className="writing-form">
              <label htmlFor="idea">我现在想说</label>
              <textarea id="idea" value={idea} onChange={event => {setIdea(event.target.value); setDraftError('');}} placeholder="比如：我觉得 AI 时代最重要的能力不是记忆，而是提问……"/>
              <p className="hint">{tooShort && idea.length > 0 ? '请至少输入 3 个字的想法' : '草稿仅供参考，发布前请检查内容。'}</p>
              <div className="options">
                <label>发布形式<select value={goal} onChange={event => setGoal(event.target.value)}><option>知乎回答</option><option>知乎文章</option></select></label>
                <label>表达语气<select value={tone} onChange={event => setTone(event.target.value)}><option value="">清晰、真诚、有条理</option><option>幽默</option><option>严肃</option></select></label>
              </div>
              {draftError && <p className="form-error" role="alert">{draftError}</p>}
              <button className="primary-button" disabled={draftLoading || tooShort} onClick={() => void generate()}>{draftLoading ? '正在理解…' : '生成我的表达 →'}</button>
            </div>
            <div className="draft-result" aria-busy={draftLoading}>
              <label>分身草稿</label>
              {draft ? <><div className="draft">{draft.draft}</div><div className="why"><strong>为什么这样写</strong>{draft.rationale.map(item => <span key={item}>✦ {item}</span>)}</div></> : <div className="empty">写下一个想法，看看你的分身会怎样表达。</div>}
            </div>
          </div>
        </>}
      </section>
    </div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
