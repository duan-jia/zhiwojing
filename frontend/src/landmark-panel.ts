import { loadBuildingCatalog, type BuildingCapability, type BuildingCatalogItem } from './building-catalog'
import { getActiveIdentity } from './identity'
import type { LandmarkDefinition } from './landmarks'
import { personaError, personaView } from './persona-logic.mjs'

interface HotItem { title: string; url: string; thumbnailUrl: string; summary: string }
interface SearchItem { title: string; url: string; contentText?: string; authorName?: string }
interface UserItem { title?: string; fullname?: string; description?: string; excerpt?: string; contentType?: string; url?: string; avatarUrl?: string; isPublic?: boolean }
interface PanelLifecycle { onOpen: () => void; onClose: () => void }

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
let activeLandmark: LandmarkDefinition | null = null
let activeBuilding: BuildingCatalogItem | null = null
let lifecycle: PanelLifecycle = { onOpen: () => undefined, onClose: () => undefined }
let requestVersion = 0

function root(): HTMLElement | null { return document.querySelector<HTMLElement>('#landmark-root') }
function content(): HTMLElement | null { return root()?.querySelector<HTMLElement>('.landmark-content') ?? null }

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function safeUrl(value: string, zhihuOnly = false): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (zhihuOnly && url.hostname !== 'zhihu.com' && !url.hostname.endsWith('.zhihu.com')) return null
    return url.href
  } catch { return null }
}

function renderStatus(message: string, failed = false): void {
  const target = content()
  if (target) target.innerHTML = `<p class="landmark-status${failed ? ' landmark-status--error' : ''}" role="status">${escapeHtml(message)}</p>`
}

async function responseJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', signal: AbortSignal.timeout(10000), ...init })
  const body = await response.json().catch(() => ({})) as { detail?: { message?: string } }
  if (!response.ok) throw new Error(body.detail?.message || `服务返回 ${response.status}`)
  return body
}

function showBackButton(show: boolean): void {
  const button = root()?.querySelector<HTMLButtonElement>('.building-back')
  if (button) button.hidden = !show
}

const STATUS_LABELS: Record<BuildingCapability['status'], string> = {
  ready: '可使用', unconfigured: '待配置', auth_required: '需授权', coming_soon: '筹备中',
}

function renderCapabilityMenu(building: BuildingCatalogItem): void {
  activeBuilding = building
  showBackButton(false)
  const target = content()
  if (!target) return
  target.innerHTML = `<div class="capability-grid">${building.capabilities.map(capability => {
    const disabled = capability.status !== 'ready'
    return `<button type="button" class="capability-card${disabled ? ' capability-card--disabled' : ''}" data-capability="${escapeHtml(capability.id)}" ${disabled ? 'disabled' : ''}>
      <span><strong>${escapeHtml(capability.label)}</strong><small>${escapeHtml(capability.description)}</small></span>
      <em class="capability-status capability-status--${capability.status}">${STATUS_LABELS[capability.status]}</em>
    </button>`
  }).join('')}</div>`
  target.querySelectorAll<HTMLButtonElement>('[data-capability]').forEach(button => {
    button.addEventListener('click', () => {
      const capability = building.capabilities.find(item => item.id === button.dataset.capability)
      if (capability?.status === 'ready') openCapability(capability)
    })
  })
}

function renderHotItems(items: HotItem[]): void {
  const target = content()
  if (!target) return
  if (!items.length) return renderStatus('热榜暂时空空如也，稍后再来看看吧。')
  target.innerHTML = `<div class="hot-list">${items.map((item, index) => {
    const href = safeUrl(item.url, true)
    const imageUrl = safeUrl(item.thumbnailUrl)
    const image = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy">` : '<span class="hot-placeholder" aria-hidden="true">知</span>'
    const body = `<span class="hot-rank">${index + 1}</span>${image}<span class="hot-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary || '点击查看知乎讨论')}</small></span>`
    return href ? `<a class="hot-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<article class="hot-item hot-item--disabled">${body}</article>`
  }).join('')}</div>`
}

async function loadHotList(version: number): Promise<void> {
  renderStatus('正在搬运知乎热榜…')
  try {
    const result = await responseJson('/api/zhihu/hot')
    if (!Array.isArray(result.items)) throw new Error('热榜格式不正确')
    if (version === requestVersion && isLandmarkPanelOpen()) renderHotItems(result.items as HotItem[])
  } catch (error) { renderRequestError(error, version, '热榜加载失败') }
}

function renderUserItems(items: UserItem[], empty: string): void {
  const target = content()
  if (!target) return
  if (!items.length) return renderStatus(empty)
  target.innerHTML = `<div class="home-list">${items.map(item => {
    const label = item.title || item.fullname || '知乎条目'
    const detail = item.description || item.excerpt || item.contentType || (item.isPublic === false ? '私密收藏夹' : '')
    const href = item.url ? safeUrl(item.url, true) : null
    const avatar = item.avatarUrl ? safeUrl(item.avatarUrl) : null
    const body = `${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : ''}<span><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</span>`
    return href ? `<a class="home-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<article class="home-item home-item--disabled">${body}</article>`
  }).join('')}</div>`
}

function flattenStats(stats: Record<string, unknown>): void {
  const entries = Object.entries(stats).flatMap(([group, values]) => values && typeof values === 'object'
    ? Object.entries(values as Record<string, unknown>).map(([key, value]) => [key, value] as const)
    : [[group, values] as const])
  const target = content()
  if (!target) return
  target.innerHTML = entries.length
    ? `<dl class="stats-grid">${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value ?? '—'))}</dd></div>`).join('')}</dl>`
    : '<p class="landmark-status">暂时没有创作数据。</p>'
}

async function loadUserCapability(capability: BuildingCapability, version: number): Promise<void> {
  renderStatus('正在整理你的知乎空间…')
  const paths: Record<string, string> = {
    user_contents: '/api/zhihu/user/contents', user_followees: '/api/zhihu/user/followees',
    user_collections: '/api/zhihu/user/collections', user_favlists: '/api/zhihu/user/favlists',
    creator_account_stats: '/api/zhihu/user/creator-stats',
  }
  try {
    const result = await responseJson(paths[capability.id])
    if (version !== requestVersion || !isLandmarkPanelOpen()) return
    if (capability.id === 'creator_account_stats') flattenStats(result)
    else renderUserItems((result.items as UserItem[]) || [], `暂时没有${capability.label}。`)
  } catch (error) { renderRequestError(error, version, '加载失败') }
}

async function loadPersona(version: number): Promise<void> {
  renderStatus('正在读取你的人设卡…')
  try {
    const result = await responseJson(`/api/persona?user_id=${getActiveIdentity().id}`)
    if (version !== requestVersion || !isLandmarkPanelOpen()) return
    const card = personaView(result)
    content()!.innerHTML = `<section class="persona-card"><h3>我的人设卡</h3><p>${escapeHtml(card.summary || '暂无摘要')}</p><div><strong>领域</strong>${card.domains.map((item: string) => `<span>${escapeHtml(item)}</span>`).join('') || '<small>待发现</small>'}</div><div><strong>兴趣</strong>${card.tags.map((item: string) => `<span>${escapeHtml(item)}</span>`).join('') || '<small>待发现</small>'}</div><button type="button" class="persona-refresh">刷新人设</button></section>`
    content()!.querySelector<HTMLButtonElement>('.persona-refresh')?.addEventListener('click', () => void generatePersona())
  } catch (error) {
    if (version !== requestVersion) return
    renderStatus(error instanceof Error ? error.message : '人设加载失败，请稍后重试。', true)
    content()?.insertAdjacentHTML('beforeend', '<button type="button" class="persona-refresh persona-refresh--center">生成/刷新人设</button>')
    content()?.querySelector<HTMLButtonElement>('.persona-refresh')?.addEventListener('click', () => void generatePersona())
  }
}

async function generatePersona(): Promise<void> {
  const version = ++requestVersion
  renderStatus('正在阅读你的知乎足迹并生成人设…')
  try {
    const response = await fetch(`${API}/api/memory/coldstart`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: getActiveIdentity().id }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(personaError(body, response.status))
    if (version === requestVersion) void loadPersona(++requestVersion)
  } catch (error) { renderRequestError(error, version, '人设生成失败') }
}

function renderSearchForm(global: boolean): void {
  const target = content()
  if (!target) return
  target.innerHTML = `<form class="building-form"><label>搜索关键词<input name="query" minlength="2" maxlength="100" required placeholder="输入想查找的内容"></label><button type="submit">${global ? '搜索全网' : '搜索知乎'}</button></form><div class="building-results"></div>`
  target.querySelector<HTMLFormElement>('form')?.addEventListener('submit', event => {
    event.preventDefault()
    const query = new FormData(event.currentTarget).get('query')?.toString().trim()
    if (query) void runSearch(query, global, ++requestVersion)
  })
}

async function runSearch(query: string, global: boolean, version: number): Promise<void> {
  const results = content()?.querySelector<HTMLElement>('.building-results')
  if (results) results.innerHTML = '<p class="landmark-status">正在查找资料…</p>'
  try {
    const path = global ? '/api/zhihu/global-search' : '/api/zhihu/search'
    const result = await responseJson(`${path}?query=${encodeURIComponent(query)}`)
    if (version !== requestVersion || !results) return
    const items = (result.items as SearchItem[]) || []
    results.innerHTML = items.length ? `<div class="home-list">${items.map(item => {
      const href = safeUrl(item.url, !global)
      const excerpt = item.contentText?.replace(/<[^>]+>/g, '').slice(0, 140) || ''
      const body = `<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.authorName || '')}${excerpt ? ` · ${escapeHtml(excerpt)}` : ''}</small></span>`
      return href ? `<a class="home-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<article class="home-item home-item--disabled">${body}</article>`
    }).join('')}</div>` : '<p class="landmark-status">没有找到相关资料，换个关键词试试。</p>'
  } catch (error) {
    if (version === requestVersion && results) results.innerHTML = `<p class="landmark-status landmark-status--error">${escapeHtml(error instanceof Error ? error.message : '搜索失败')}</p>`
  }
}

function renderPromptForm(kind: 'answer' | 'recommendations' | 'draft'): void {
  const labels = {
    answer: ['你的问题', '向知乎直答提问', '例如：怎样理解 AI Agent？'],
    recommendations: ['选题方向', '寻找选题', '可留空，按账号画像推荐'],
    draft: ['创作想法', '生成草稿', '描述你想回答的问题或文章主题'],
  } as const
  const [label, action, placeholder] = labels[kind]
  const required = kind === 'recommendations' ? '' : `required minlength="${kind === 'draft' ? 3 : 2}"`
  content()!.innerHTML = `<form class="building-form"><label>${label}<textarea name="query" maxlength="2000" ${required} placeholder="${placeholder}"></textarea></label>${kind === 'draft' ? '<label>内容形式<select name="goal"><option>知乎回答</option><option>知乎文章</option></select></label>' : ''}<button type="submit">${action}</button></form><div class="building-results"></div>`
  content()!.querySelector<HTMLFormElement>('form')?.addEventListener('submit', event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void runPrompt(kind, data.get('query')?.toString().trim() || '', data.get('goal')?.toString(), ++requestVersion)
  })
}

async function runPrompt(kind: 'answer' | 'recommendations' | 'draft', query: string, goal: string | undefined, version: number): Promise<void> {
  const results = content()?.querySelector<HTMLElement>('.building-results')
  if (!results) return
  results.innerHTML = '<p class="landmark-status">正在处理，请稍候…</p>'
  try {
    let result: Record<string, unknown>
    if (kind === 'answer') result = await responseJson('/api/zhihu/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, model: 'zhida-fast-1p5' }) })
    else if (kind === 'recommendations') result = await responseJson(`/api/zhihu/question-recommendations?count=5${query ? `&query=${encodeURIComponent(query)}` : ''}`)
    else result = await responseJson('/api/avatar/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: getActiveIdentity().id, idea: query, goal }) })
    if (version !== requestVersion) return
    if (kind === 'answer') results.innerHTML = `<article class="generated-copy">${escapeHtml(String(result.answer || '暂时没有回答。'))}</article>`
    else if (kind === 'draft') results.innerHTML = `<article class="generated-copy">${escapeHtml(String(result.draft || '暂时没有草稿。'))}</article>`
    else renderRecommendations(results, (result.items as Array<{ title: string; url: string }>) || [])
  } catch (error) {
    if (version === requestVersion) results.innerHTML = `<p class="landmark-status landmark-status--error">${escapeHtml(error instanceof Error ? error.message : '处理失败')}</p>`
  }
}

function renderRecommendations(target: HTMLElement, items: Array<{ title: string; url: string }>): void {
  target.innerHTML = items.length ? `<div class="home-list">${items.map(item => {
    const href = safeUrl(item.url, true)
    return href ? `<a class="home-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span><strong>${escapeHtml(item.title)}</strong><small>在知乎查看问题</small></span></a>` : ''
  }).join('')}</div>` : '<p class="landmark-status">暂时没有合适的推荐问题。</p>'
}

function renderRequestError(error: unknown, version: number, prefix: string): void {
  if (version !== requestVersion || !isLandmarkPanelOpen()) return
  const detail = error instanceof Error && error.name !== 'TimeoutError' ? error.message : '请求超时'
  renderStatus(`${prefix}（${detail}），请稍后重试。`, true)
}

function openCapability(capability: BuildingCapability): void {
  showBackButton(true)
  const version = ++requestVersion
  if (capability.ui === 'hot-list') void loadHotList(version)
  else if (capability.ui.startsWith('user-') || capability.ui === 'creator-stats') void loadUserCapability(capability, version)
  else if (capability.ui === 'persona') void loadPersona(version)
  else if (capability.ui === 'search-zhihu') renderSearchForm(false)
  else if (capability.ui === 'search-global') renderSearchForm(true)
  else if (capability.ui === 'answer') renderPromptForm('answer')
  else if (capability.ui === 'question-recommendations') renderPromptForm('recommendations')
  else if (capability.ui === 'draft') renderPromptForm('draft')
  else renderStatus('这项能力正在筹备中。')
}

function ensureShell(): HTMLElement | null {
  const panelRoot = root()
  if (!panelRoot || panelRoot.dataset.ready === 'true') return panelRoot
  panelRoot.dataset.ready = 'true'
  panelRoot.innerHTML = `<section class="landmark-panel" role="dialog" aria-modal="true" aria-labelledby="landmark-title">
    <header class="chat-header landmark-header"><span class="landmark-icon" aria-hidden="true">知</span><div><h2 id="landmark-title"></h2><p></p></div><button type="button" class="building-back" hidden>功能列表</button><button type="button" class="chat-close landmark-close" aria-label="关闭地标面板">×</button></header>
    <div class="landmark-content" aria-live="polite"></div><p class="chat-footnote">选择一项功能开始探索 · Esc 关闭</p></section>`
  panelRoot.querySelector('.landmark-close')?.addEventListener('click', closeLandmarkPanel)
  panelRoot.querySelector('.building-back')?.addEventListener('click', () => {
    requestVersion += 1
    if (activeBuilding) renderCapabilityMenu(activeBuilding)
  })
  panelRoot.addEventListener('click', event => { if (event.target === panelRoot) closeLandmarkPanel() })
  panelRoot.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') closeLandmarkPanel() })
  return panelRoot
}

export function configureLandmarkLifecycle(next: PanelLifecycle): void { lifecycle = next }
export function isLandmarkPanelOpen(): boolean { return Boolean(root() && !root()!.hidden && activeLandmark) }
export function closeLandmarkPanel(): void {
  const panelRoot = root()
  if (!panelRoot || panelRoot.hidden) return
  panelRoot.hidden = true
  activeLandmark = null
  activeBuilding = null
  requestVersion += 1
  lifecycle.onClose()
}

export function openLandmarkPanel(landmark: LandmarkDefinition): void {
  const panelRoot = ensureShell()
  if (!panelRoot) return
  const wasOpen = isLandmarkPanelOpen()
  activeLandmark = landmark
  activeBuilding = null
  panelRoot.querySelector<HTMLElement>('#landmark-title')!.textContent = landmark.name
  panelRoot.querySelector<HTMLElement>('.landmark-icon')!.textContent = landmark.icon
  panelRoot.querySelector<HTMLElement>('.landmark-header p')!.textContent = '正在读取建筑功能…'
  showBackButton(false)
  panelRoot.hidden = false
  if (!wasOpen) lifecycle.onOpen()
  const version = ++requestVersion
  renderStatus('正在读取功能列表…')
  void loadBuildingCatalog().then(catalog => {
    if (version !== requestVersion || activeLandmark?.id !== landmark.id) return
    const building = catalog.buildings.find(item => item.id === landmark.buildingId)
    if (!building) throw new Error('这栋建筑还没有配置功能。')
    panelRoot.querySelector<HTMLElement>('.landmark-header p')!.textContent = building.description
    renderCapabilityMenu(building)
  }).catch(error => renderRequestError(error, version, '功能列表加载失败'))
  panelRoot.querySelector<HTMLButtonElement>('.landmark-close')?.focus()
}
