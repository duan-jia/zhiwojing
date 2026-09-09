import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../style.css';

const API = 'http://localhost:8000';
const WORLD_WIDTH = 2240;
const WORLD_HEIGHT = 1260;
const MOVE_STEP = 34;
const AVATAR_RADIUS = 22;

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
interface OAuthStatus {
  configured: boolean;
  callbackConfigured: boolean;
  integrationReady: boolean;
  authorized: boolean;
  missingConfiguration: string[];
  interfaces: {id: string; name: string}[];
}
interface Position { x: number; y: number }
interface Size { width: number; height: number }
interface Rect { x: number; y: number; width: number; height: number }
type PublicPlace = 'studio' | 'hot' | 'explore';
type ActivePlace = PublicPlace | 'home';
type PlaceKind = 'public' | 'home';
interface WorldPlace {
  id: string;
  kind: PlaceKind;
  publicPlace?: PublicPlace;
  homeSlot?: number;
  name: string;
  description: string;
  position: Position;
  collider: Rect;
}
interface HomeSlot {
  slot: number;
  ownerId: number | null;
  ownerName: string | null;
  online: boolean;
}
interface RealmState {
  id: string;
  name: string;
  capacity: number;
  homes: HomeSlot[];
}
type ExploreMode = 'discover' | 'zhihu' | 'global' | 'answer';
type Facing = 'front' | 'back' | 'left' | 'right';

const publicPlaces: WorldPlace[] = [
  {id: 'studio', kind: 'public', publicPlace: 'studio', name: '创作屋', description: '整理你的想法', position: {x: 745, y: 830}, collider: {x: 505, y: 525, width: 430, height: 270}},
  {id: 'hot', kind: 'public', publicPlace: 'hot', name: '热榜广场', description: '看看大家在聊什么', position: {x: 1115, y: 645}, collider: {x: 885, y: 280, width: 470, height: 330}},
  {id: 'explore', kind: 'public', publicPlace: 'explore', name: '探索馆', description: '搜索与直答', position: {x: 1530, y: 900}, collider: {x: 1335, y: 545, width: 410, height: 320}},
];

const homePlaces: WorldPlace[] = [
  {id: 'home-1', kind: 'home', homeSlot: 1, name: '1号屋', description: '我的家', position: {x: 600, y: 1160}, collider: {x: 415, y: 895, width: 380, height: 230}},
  {id: 'home-2', kind: 'home', homeSlot: 2, name: '2号屋', description: '空置', position: {x: 1125, y: 1190}, collider: {x: 925, y: 900, width: 405, height: 250}},
  {id: 'home-3', kind: 'home', homeSlot: 3, name: '3号屋', description: '空置', position: {x: 1610, y: 1160}, collider: {x: 1400, y: 875, width: 420, height: 250}},
  {id: 'home-4', kind: 'home', homeSlot: 4, name: '4号屋', description: '空置', position: {x: 2010, y: 795}, collider: {x: 1815, y: 545, width: 365, height: 225}},
  {id: 'home-5', kind: 'home', homeSlot: 5, name: '5号屋', description: '空置', position: {x: 2010, y: 455}, collider: {x: 1830, y: 240, width: 350, height: 190}},
  {id: 'home-6', kind: 'home', homeSlot: 6, name: '6号屋', description: '空置', position: {x: 1555, y: 275}, collider: {x: 1375, y: 45, width: 365, height: 200}},
  {id: 'home-7', kind: 'home', homeSlot: 7, name: '7号屋', description: '空置', position: {x: 1115, y: 275}, collider: {x: 930, y: 35, width: 370, height: 210}},
  {id: 'home-8', kind: 'home', homeSlot: 8, name: '8号屋', description: '空置', position: {x: 650, y: 275}, collider: {x: 460, y: 40, width: 380, height: 205}},
  {id: 'home-9', kind: 'home', homeSlot: 9, name: '9号屋', description: '空置', position: {x: 245, y: 450}, collider: {x: 45, y: 245, width: 365, height: 180}},
  {id: 'home-10', kind: 'home', homeSlot: 10, name: '10号屋', description: '空置', position: {x: 235, y: 785}, collider: {x: 35, y: 555, width: 365, height: 205}},
];

const worldPlaces = [...publicPlaces, ...homePlaces];
const colliders = worldPlaces.map(place => place.collider);
const PLAYER_SPAWN = {x: 600, y: 1185};
const realm: RealmState = {
  id: 'inspiration-plains-01',
  name: '灵感平原',
  capacity: 10,
  homes: Array.from({length: 10}, (_, index) => ({
    slot: index + 1,
    ownerId: index === 0 ? 1 : null,
    ownerName: index === 0 ? '体验用户' : null,
    online: index === 0,
  })),
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
  return Math.hypot(position.x - target.x, position.y - target.y) < 125;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collides(position: Position): boolean {
  return colliders.some(rect => (
    position.x + AVATAR_RADIUS > rect.x
    && position.x - AVATAR_RADIUS < rect.x + rect.width
    && position.y + AVATAR_RADIUS > rect.y
    && position.y - AVATAR_RADIUS < rect.y + rect.height
  ));
}

function nearestPlace(position: Position): WorldPlace | null {
  return worldPlaces
    .filter(place => isNear(position, place.position))
    .sort((left, right) => (
      Math.hypot(position.x - left.position.x, position.y - left.position.y)
      - Math.hypot(position.x - right.position.x, position.y - right.position.y)
    ))[0] ?? null;
}

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [profileError, setProfileError] = useState('');
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [oauthStatusError, setOauthStatusError] = useState('');
  const [position, setPosition] = useState<Position>(PLAYER_SPAWN);
  const [viewportSize, setViewportSize] = useState<Size>({width: 0, height: 0});
  const [facing, setFacing] = useState<Facing>('front');
  const [isMoving, setIsMoving] = useState(false);
  const [activePlace, setActivePlace] = useState<ActivePlace | null>(null);
  const [mapMessage, setMapMessage] = useState('');
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
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
  const viewportRef = useRef<HTMLElement | null>(null);
  const movementTimer = useRef<number | null>(null);
  const mapMessageTimer = useRef<number | null>(null);
  const tooShort = Array.from(idea.trim()).length < 3;
  const nearbyPlace = nearestPlace(position);
  const camera = {
    x: clamp(viewportSize.width / 2 - position.x, viewportSize.width - WORLD_WIDTH, 0),
    y: clamp(viewportSize.height / 2 - position.y, viewportSize.height - WORLD_HEIGHT, 0),
  };

  async function loadOauthStatus() {
    setOauthStatusError('');
    try {
      setOauthStatus(await request<OAuthStatus>('/api/oauth/status'));
    } catch (error) {
      setOauthStatusError(error instanceof Error ? error.message : '登录能力状态读取失败。');
    }
  }

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

  function showMapMessage(message: string) {
    setMapMessage(message);
    if (mapMessageTimer.current) window.clearTimeout(mapMessageTimer.current);
    mapMessageTimer.current = window.setTimeout(() => setMapMessage(''), 2400);
  }

  function interactWithPlace(place: WorldPlace) {
    if (!isNear(position, place.position)) {
      showMapMessage(`请先走近${place.name}再互动。`);
      return;
    }
    if (place.kind === 'home') {
      const home = realm.homes.find(item => item.slot === place.homeSlot);
      if (home?.ownerId === me?.id || (place.homeSlot === 1 && !me)) {
        setActivePlace('home');
      } else {
        showMapMessage(home?.ownerName ? `${place.name}是 ${home.ownerName} 的私人住宅。` : `${place.name}还没有主人，暂时无法进入。`);
      }
      return;
    }
    if (!place.publicPlace) return;
    setActivePlace(place.publicPlace);
    if (place.publicPlace === 'hot') void loadHotList();
  }

  function moveAvatar(delta: Position, nextFacing: Facing) {
    if (!gameStarted || activePlace || pauseMenuOpen) return;
    setFacing(nextFacing);
    setIsMoving(true);
    setPosition(current => {
      const target = {
        x: clamp(current.x + delta.x, AVATAR_RADIUS, WORLD_WIDTH - AVATAR_RADIUS),
        y: clamp(current.y + delta.y, AVATAR_RADIUS, WORLD_HEIGHT - AVATAR_RADIUS),
      };
      if (!collides(target)) return target;
      const horizontal = {x: target.x, y: current.y};
      if (!collides(horizontal)) return horizontal;
      const vertical = {x: current.x, y: target.y};
      return collides(vertical) ? current : vertical;
    });
    if (movementTimer.current) window.clearTimeout(movementTimer.current);
    movementTimer.current = window.setTimeout(() => setIsMoving(false), 160);
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

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!gameStarted || !viewport) return;
    const updateSize = () => setViewportSize({width: viewport.clientWidth, height: viewport.clientHeight});
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [gameStarted]);

  useEffect(() => {
    void loadOauthStatus();
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => setViewportSize({width: viewport.clientWidth, height: viewport.clientHeight});
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [gameStarted]);

  useEffect(() => {
    if (gameStarted && !me) void loadProfile();
  }, [gameStarted]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!gameStarted) return;
      const target = event.target as HTMLElement | null;
      const editing = target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (activePlace) {
          setActivePlace(null);
        } else {
          setPauseMenuOpen(open => !open);
        }
        return;
      }
      if (editing || activePlace || pauseMenuOpen) return;

      const key = event.key.toLowerCase();
      if (key === 'e' && nearbyPlace) {
        event.preventDefault();
        interactWithPlace(nearbyPlace);
        return;
      }

      const movement: Record<string, {delta: Position; facing: Facing}> = {
        arrowup: {delta: {x: 0, y: -MOVE_STEP}, facing: 'back'},
        w: {delta: {x: 0, y: -MOVE_STEP}, facing: 'back'},
        arrowdown: {delta: {x: 0, y: MOVE_STEP}, facing: 'front'},
        s: {delta: {x: 0, y: MOVE_STEP}, facing: 'front'},
        arrowleft: {delta: {x: -MOVE_STEP, y: 0}, facing: 'left'},
        a: {delta: {x: -MOVE_STEP, y: 0}, facing: 'left'},
        arrowright: {delta: {x: MOVE_STEP, y: 0}, facing: 'right'},
        d: {delta: {x: MOVE_STEP, y: 0}, facing: 'right'},
      };
      const nextMove = movement[key];
      if (!nextMove) return;
      event.preventDefault();
      moveAvatar(nextMove.delta, nextMove.facing);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePlace, gameStarted, me, nearbyPlace, pauseMenuOpen]);

  useEffect(() => () => {
    if (movementTimer.current) window.clearTimeout(movementTimer.current);
    if (mapMessageTimer.current) window.clearTimeout(mapMessageTimer.current);
  }, []);

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

  function startOauth() {
    if (!oauthStatus?.integrationReady) return;
    window.location.assign(`${API}/api/oauth/start`);
  }

  function renderStudioWorkspace() {
    return <div className="studio-workspace">
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
    </div>;
  }

  if (!gameStarted) {
    const oauthLabel = oauthStatus?.integrationReady
      ? '使用知乎账号登录'
      : oauthStatus?.configured
        ? '知乎登录开发中'
        : '知乎登录暂未开放';

    return <main className="login-screen">
      <section className="login-scene" aria-labelledby="login-title">
        <div className="login-stars" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="login-landscape" aria-hidden="true"><span/><span/><span/></div>
        <div className="login-copy">
          <div className="login-brand"><span className="logo-mark">知</span><strong>知我境</strong></div>
          <p className="eyebrow">ZHIHU INK WORLD · CHAPTER 01</p>
          <h1 id="login-title">去镇上走走，<br/><em>挖掘新的灵感。</em></h1>
          <p className="login-intro">和刘看山一起查看热榜、寻找资料，把零散的想法整理成属于你的表达。</p>
          <div className="login-actions">
            <button type="button" className="enter-game-button" onClick={() => setGameStarted(true)}><span>▶</span> 游客身份进入</button>
            <button type="button" className="oauth-login-button" disabled={!oauthStatus?.integrationReady} onClick={startOauth}>
              <span className="oauth-icon">知</span><span><strong>{oauthLabel}</strong><small>OAuth 接口已预留 · 后续开放</small></span>
            </button>
          </div>
          {oauthStatusError && <p className="login-status" role="status">暂时无法读取登录状态，仍可使用游客模式进入。</p>}
          {!oauthStatusError && <p className="login-status">当前使用本地模拟角色，不会发起真实授权或自动发布内容。</p>}
        </div>
        <div className="login-character" aria-label="手绘刘看山">
          <div className="login-speech">准备好了吗？</div>
          <span className="login-character-shadow"/><span className="login-character-sprite"/>
        </div>
        <div className="login-version">AVATAR TOWN · INK PROTOTYPE</div>
      </section>
    </main>;
  }

  return <main className="game-screen">
    {profileError && <div className="notice error-notice" role="alert">{profileError} <button onClick={() => void loadProfile()}>重新连接</button></div>}

    <section ref={viewportRef} className="world-shell game-world" aria-label="知我境地图">
      <div className="world-stage" style={{width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate3d(${camera.x}px, ${camera.y}px, 0)`}}>
        {worldPlaces.map(place => {
          const home = place.kind === 'home' ? realm.homes.find(item => item.slot === place.homeSlot) : null;
          const isMine = home?.ownerId === me?.id || (place.homeSlot === 1 && !me);
          const ownerName = isMine ? (me?.name || home?.ownerName) : home?.ownerName;
          return <button
            type="button"
            key={place.id}
            className={`map-place ${place.kind === 'home' ? 'home-place' : 'public-place'} ${isMine ? 'is-mine' : ''} ${nearbyPlace?.id === place.id ? 'is-near' : ''}`}
            style={{left: place.position.x, top: place.position.y}}
            onClick={() => interactWithPlace(place)}
            aria-label={`${place.name}，${ownerName || place.description}`}
          >
            <strong>{place.name}</strong>
            <small>{ownerName || place.description}</small>
          </button>;
        })}

        <div className={`avatar facing-${facing} ${isMoving ? 'is-moving' : ''}`} style={{left: position.x, top: position.y}} aria-label="刘看山，你的手绘角色">
          <span className="avatar-shadow"/><span className="avatar-sprite"/><span className="name-tag">{me?.name || '旅人'}</span>
        </div>
      </div>

      <div className="world-badge"><span>当前知我境</span><strong>{realm.name}</strong><small>1 / {realm.capacity} 人</small></div>
      <div className="mini-map" aria-label="区域小地图">
        <span className="mini-map-title">知我境地图</span>
        <div className="mini-map-field">
          {worldPlaces.map(place => <i
            key={place.id}
            className={`${place.kind === 'home' ? 'mini-home' : 'mini-public'} ${place.homeSlot === 1 ? 'is-mine' : ''}`}
            style={{left: `${place.position.x / WORLD_WIDTH * 100}%`, top: `${place.position.y / WORLD_HEIGHT * 100}%`}}
          />)}
          <b style={{left: `${position.x / WORLD_WIDTH * 100}%`, top: `${position.y / WORLD_HEIGHT * 100}%`}}/>
        </div>
      </div>
      {mapMessage && <div className="map-message" role="status">{mapMessage}</div>}
      {nearbyPlace && !activePlace && <button className="interaction-prompt" onClick={() => interactWithPlace(nearbyPlace)}><kbd>E</kbd> {nearbyPlace.kind === 'home' ? '查看' : '进入'}{nearbyPlace.name}</button>}

      <div className="mobile-controls" role="group" aria-label="触屏地图控制">
        <div className="d-pad" role="group" aria-label="移动刘看山">
          <button type="button" className="move-up" aria-label="向上移动" onClick={() => moveAvatar({x: 0, y: -MOVE_STEP}, 'back')}>▲</button>
          <button type="button" className="move-left" aria-label="向左移动" onClick={() => moveAvatar({x: -MOVE_STEP, y: 0}, 'left')}>◀</button>
          <span aria-hidden="true"/>
          <button type="button" className="move-right" aria-label="向右移动" onClick={() => moveAvatar({x: MOVE_STEP, y: 0}, 'right')}>▶</button>
          <button type="button" className="move-down" aria-label="向下移动" onClick={() => moveAvatar({x: 0, y: MOVE_STEP}, 'front')}>▼</button>
        </div>
        <button type="button" className="touch-interact" disabled={!nearbyPlace} onClick={() => nearbyPlace && interactWithPlace(nearbyPlace)}><b>E</b><span>{nearbyPlace ? `${nearbyPlace.kind === 'home' ? '查看' : '进入'}${nearbyPlace.name}` : '靠近建筑'}</span></button>
      </div>
    </section>

    <div className="game-overlay" aria-label="玩家状态">
      <div className="game-brand"><span className="logo-mark">知</span><span className="logo">知我境</span></div>
      <div className="game-player"><span className="online-dot"/><span>{me?.name || (profileError ? '离线旅人' : '载入中')}</span></div>
      <button type="button" className="menu-button" onClick={() => setPauseMenuOpen(true)} aria-haspopup="dialog"><kbd>ESC</kbd><span>菜单</span></button>
    </div>

    {pauseMenuOpen && <div className="pause-backdrop" role="presentation" onMouseDown={() => setPauseMenuOpen(false)}>
      <section className="pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-title" onMouseDown={event => event.stopPropagation()}>
        <p className="eyebrow">GAME PAUSED</p>
        <h2 id="pause-title">游戏菜单</h2>
        <div className="pause-player">
          <span className="logo-mark">知</span>
          <div><strong>{me?.name || '旅人'}</strong><small>{me?.profile.interests.join(' / ') || '正在读取角色资料'}</small></div>
        </div>
        <div className="control-guide" aria-label="游戏操作说明">
          <div><span><kbd>WASD</kbd> / <kbd>方向键</kbd></span><strong>移动角色</strong></div>
          <div><span><kbd>E</kbd></span><strong>进入附近建筑</strong></div>
          <div><span><kbd>ESC</kbd></span><strong>打开或关闭菜单</strong></div>
        </div>
        <div className="pause-actions">
          <button type="button" className="resume-game" autoFocus onClick={() => setPauseMenuOpen(false)}>继续游戏</button>
          <button type="button" className="exit-game" onClick={() => {setPauseMenuOpen(false); setActivePlace(null); setGameStarted(false);}}>退出到登录页</button>
        </div>
      </section>
    </div>}

    {activePlace && <div className="modal-backdrop" role="presentation" onMouseDown={() => setActivePlace(null)}>
      <section className={`place-panel ${activePlace === 'studio' || activePlace === 'home' ? 'studio-panel' : ''} ${activePlace === 'home' ? 'home-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="place-title" onMouseDown={event => event.stopPropagation()}>
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
        </> : activePlace === 'home' ? <>
          <div className="panel-heading"><div><p className="eyebrow">YOUR PRIVATE SPACE · HOME 01</p><h2 id="place-title">1号屋 · {me?.name || '体验用户'}</h2></div></div>
          <p className="panel-intro">这里是你的私人空间。连接知乎账号的能力已经预留；创作仍由你提供想法，分身只负责协助整理表达。</p>
          <section className="account-card" aria-labelledby="account-card-title">
            <div className="account-card-copy">
              <span className={`account-status-dot ${oauthStatus?.authorized ? 'is-authorized' : ''}`}/>
              <div>
                <strong id="account-card-title">知乎账号</strong>
                <small>{oauthStatusError ? '暂时无法读取连接状态' : oauthStatus?.authorized ? '账号已连接' : oauthStatus?.configured ? '服务端已配置，真实授权仍在开发中' : 'OAuth 尚未开放，不会发起真实授权'}</small>
              </div>
            </div>
            <button type="button" className="secondary-button" disabled={!oauthStatus?.integrationReady} onClick={startOauth}>{oauthStatus?.authorized ? '已连接' : '连接知乎账号'}</button>
            <div className="account-capabilities" aria-label="未来账号能力">
              {(oauthStatus?.interfaces || []).map(item => <span key={item.id}>{item.name}</span>)}
            </div>
            {oauthStatusError && <button type="button" className="account-retry" onClick={() => void loadOauthStatus()}>重新读取状态</button>}
          </section>
          <div className="home-writing-heading"><span>私人创作桌</span><small>与公共创作屋共用同一份草稿</small></div>
          {renderStudioWorkspace()}
        </> : <>
          <div className="panel-heading"><div><p className="eyebrow">YOUR DIGITAL VOICE</p><h2 id="place-title">创作屋</h2></div></div>
          <p className="panel-intro">把零散的念头放在桌上，分身会帮你整理成想说的样子。</p>
          {renderStudioWorkspace()}
        </>}
      </section>
    </div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
