import type { LandmarkDefinition } from './landmarks'
import { personaError, personaView } from './persona-logic.mjs'

interface HotItem {
  title: string
  url: string
  thumbnailUrl: string
  summary: string
}

interface HotResult { items: HotItem[] }
interface PanelLifecycle { onOpen: () => void; onClose: () => void }
type HomeTab = 'contents' | 'followees' | 'collections' | 'creator-stats' | 'persona'
interface UserItem { title?: string; fullname?: string; description?: string; excerpt?: string; contentType?: string; url?: string; avatarUrl?: string; isPublic?: boolean }

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
let activeLandmark: LandmarkDefinition | null = null
let lifecycle: PanelLifecycle = { onOpen: () => undefined, onClose: () => undefined }
let requestVersion = 0

function root(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#landmark-root')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function safeZhihuUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'zhihu.com' || url.hostname.endsWith('.zhihu.com'))
      ? url.href : null
  } catch { return null }
}

function renderStatus(message: string, failed = false): void {
  const content = root()?.querySelector<HTMLElement>('.landmark-content')
  if (content) content.innerHTML = `<p class="landmark-status${failed ? ' landmark-status--error' : ''}" role="status">${escapeHtml(message)}</p>`
}

function renderHotItems(items: HotItem[]): void {
  const content = root()?.querySelector<HTMLElement>('.landmark-content')
  if (!content) return
  if (!items.length) {
    renderStatus('热榜暂时空空如也，稍后再来看看吧。')
    return
  }
  content.innerHTML = `<div class="hot-list">${items.map((item, index) => {
    const href = safeZhihuUrl(item.url)
    const image = item.thumbnailUrl ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy">` : '<span class="hot-placeholder" aria-hidden="true">知</span>'
    const body = `<span class="hot-rank">${index + 1}</span>${image}<span class="hot-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary || '点击查看知乎讨论')}</small></span>`
    return href ? `<a class="hot-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<article class="hot-item hot-item--disabled">${body}</article>`
  }).join('')}</div>`
}

async function loadHotList(version: number): Promise<void> {
  renderStatus('正在搬运知乎热榜…')
  try {
    const response = await fetch(`${API}/api/zhihu/hot`, { credentials: 'include', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`服务返回 ${response.status}`)
    const result = await response.json() as HotResult
    if (!Array.isArray(result.items)) throw new Error('热榜格式不正确')
    if (version === requestVersion && isLandmarkPanelOpen()) renderHotItems(result.items)
  } catch (error) {
    if (version !== requestVersion || !isLandmarkPanelOpen()) return
    const detail = error instanceof Error && error.name !== 'TimeoutError' ? error.message : '请求超时'
    renderStatus(`热榜加载失败（${detail}），请稍后重试。`, true)
  }
}

const HOME_TABS: readonly { id: HomeTab; label: string }[] = [
  { id: 'contents', label: '我的内容' }, { id: 'followees', label: '我的关注' },
  { id: 'collections', label: '我的收藏' }, { id: 'creator-stats', label: '我的创作数据' },
  { id: 'persona', label: '人设' },
]

async function responseJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', signal: AbortSignal.timeout(10000) })
  const body = await response.json().catch(() => ({})) as { detail?: { message?: string } }
  if (!response.ok) throw new Error(body.detail?.message || `服务返回 ${response.status}`)
  return body
}

function renderUserItems(items: UserItem[], empty: string): string {
  if (!items.length) return `<p class="landmark-status">${escapeHtml(empty)}</p>`
  return `<div class="home-list">${items.map(item => {
    const label = item.title || item.fullname || '知乎条目'
    const detail = item.description || item.excerpt || item.contentType || (item.isPublic === false ? '私密收藏夹' : '')
    const href = item.url ? safeZhihuUrl(item.url) : null
    const body = `${item.avatarUrl && safeZhihuUrl(item.avatarUrl) ? `<img src="${escapeHtml(item.avatarUrl)}" alt="">` : ''}<span><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</span>`
    return href ? `<a class="home-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<article class="home-item home-item--disabled">${body}</article>`
  }).join('')}</div>`
}

function flattenStats(stats: Record<string, unknown>): string {
  const entries = Object.entries(stats).flatMap(([group, values]) => values && typeof values === 'object'
    ? Object.entries(values as Record<string, unknown>).map(([key, value]) => [key, value] as const)
    : [[group, values] as const])
  if (!entries.length) return '<p class="landmark-status">暂时没有创作数据。</p>'
  return `<dl class="stats-grid">${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value ?? '—'))}</dd></div>`).join('')}</dl>`
}

async function loadHomeTab(tab: HomeTab, version: number): Promise<void> {
  renderStatus('正在整理你的知乎空间…')
  try {
    let html: string
    if (tab === 'persona') {
      const response = await fetch(`${API}/api/persona?user_id=1`, { credentials: 'include' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(personaError(result, response.status))
      const card = personaView(result)
      html = `<section class="persona-card"><h3>我的人设卡</h3><p>${escapeHtml(card.summary || '暂无摘要')}</p><div><strong>领域</strong>${card.domains.map((x: string) => `<span>${escapeHtml(x)}</span>`).join('') || '<small>待发现</small>'}</div><div><strong>兴趣</strong>${card.tags.map((x: string) => `<span>${escapeHtml(x)}</span>`).join('') || '<small>待发现</small>'}</div><button type="button" class="persona-refresh">刷新人设</button></section>`
    } else if (tab === 'collections') {
      const [collections, favlists] = await Promise.all([responseJson('/api/zhihu/user/collections'), responseJson('/api/zhihu/user/favlists')])
      html = `<h3>最近收藏</h3>${renderUserItems((collections.items as UserItem[]) || [], '暂时没有收藏内容。')}<h3>收藏夹</h3>${renderUserItems((favlists.items as UserItem[]) || [], '暂时没有收藏夹。')}`
    } else {
      const result = await responseJson(`/api/zhihu/user/${tab}`)
      html = tab === 'creator-stats' ? flattenStats(result) : renderUserItems((result.items as UserItem[]) || [], tab === 'contents' ? '暂时没有发布内容。' : '暂时没有关注用户。')
    }
    if (version === requestVersion && activeLandmark?.kind === 'user-home') {
      root()!.querySelector<HTMLElement>('.landmark-content')!.innerHTML = html
      root()!.querySelector<HTMLButtonElement>('.persona-refresh')?.addEventListener('click', () => void generatePersona())
    }
  } catch (error) {
    if (version !== requestVersion || activeLandmark?.kind !== 'user-home') return
    if (tab === 'persona') {
      const content = root()?.querySelector<HTMLElement>('.landmark-content')
      if (content) {
        content.innerHTML = `<p class="landmark-status landmark-status--error" role="status">${escapeHtml(error instanceof Error ? error.message : '加载失败，请稍后重试。')}</p><button type="button" class="persona-refresh">生成/刷新人设</button>`
        content.querySelector<HTMLButtonElement>('.persona-refresh')?.addEventListener('click', () => void generatePersona())
      }
    } else renderStatus(error instanceof Error ? error.message : '加载失败，请稍后重试。', true)
  }
}

async function generatePersona(): Promise<void> {
  renderStatus('正在阅读你的知乎足迹并生成人设…')
  try {
    const response = await fetch(`${API}/api/memory/coldstart`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: 1 }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(personaError(body, response.status))
    void loadHomeTab('persona', ++requestVersion)
  } catch (error) { renderStatus(error instanceof Error ? error.message : '人设生成失败，请稍后重试。', true) }
}

function selectHomeTab(tab: HomeTab): void {
  root()?.querySelectorAll<HTMLButtonElement>('.home-tab').forEach(button => {
    const selected = button.dataset.tab === tab
    button.classList.toggle('home-tab--active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  void loadHomeTab(tab, ++requestVersion)
}

function renderHomeNavigation(): void {
  const panel = root()?.querySelector<HTMLElement>('.landmark-panel')
  if (!panel) return
  panel.querySelector('.home-tabs')?.remove()
  const nav = document.createElement('nav')
  nav.className = 'home-tabs'
  nav.setAttribute('role', 'tablist')
  nav.innerHTML = HOME_TABS.map(tab => `<button type="button" class="home-tab" role="tab" data-tab="${tab.id}">${tab.label}</button>`).join('')
  panel.querySelector('.landmark-content')?.before(nav)
  nav.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.home-tab')
    if (button?.dataset.tab) selectHomeTab(button.dataset.tab as HomeTab)
  })
  selectHomeTab('contents')
}

function ensureShell(): HTMLElement | null {
  const panelRoot = root()
  if (!panelRoot || panelRoot.dataset.ready === 'true') return panelRoot
  panelRoot.dataset.ready = 'true'
  panelRoot.innerHTML = `<section class="landmark-panel" role="dialog" aria-modal="true" aria-labelledby="landmark-title">
    <header class="chat-header landmark-header"><span class="landmark-icon" aria-hidden="true">榜</span><div><h2 id="landmark-title"></h2><p>发现此刻值得关注的知乎讨论</p></div><button type="button" class="chat-close landmark-close" aria-label="关闭地标面板">×</button></header>
    <div class="landmark-content" aria-live="polite"></div><p class="chat-footnote">点击条目将在新标签页打开 · Esc 关闭</p></section>`
  panelRoot.querySelector('.landmark-close')?.addEventListener('click', closeLandmarkPanel)
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
  requestVersion += 1
  lifecycle.onClose()
}

export function openLandmarkPanel(landmark: LandmarkDefinition): void {
  const panelRoot = ensureShell()
  if (!panelRoot) return
  const wasOpen = isLandmarkPanelOpen()
  activeLandmark = landmark
  panelRoot.querySelector<HTMLElement>('#landmark-title')!.textContent = landmark.name
  panelRoot.querySelector<HTMLElement>('.landmark-icon')!.textContent = landmark.kind === 'user-home' ? '居' : '榜'
  panelRoot.querySelector<HTMLElement>('.landmark-header p')!.textContent = landmark.kind === 'user-home' ? '看见你的内容、关注、收藏与创作成长' : '发现此刻值得关注的知乎讨论'
  panelRoot.querySelector('.home-tabs')?.remove()
  panelRoot.hidden = false
  if (!wasOpen) lifecycle.onOpen()
  const version = ++requestVersion
  if (landmark.kind === 'hot-square') void loadHotList(version)
  if (landmark.kind === 'user-home') renderHomeNavigation()
  panelRoot.querySelector<HTMLButtonElement>('.landmark-close')?.focus()
}
