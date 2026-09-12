import type { LandmarkDefinition } from './landmarks'

interface HotItem {
  title: string
  url: string
  thumbnailUrl: string
  summary: string
}

interface HotResult { items: HotItem[] }
interface PanelLifecycle { onOpen: () => void; onClose: () => void }

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
  panelRoot.hidden = false
  if (!wasOpen) lifecycle.onOpen()
  const version = ++requestVersion
  if (landmark.kind === 'hot-square') void loadHotList(version)
  panelRoot.querySelector<HTMLButtonElement>('.landmark-close')?.focus()
}
