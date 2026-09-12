import {
  MOCK_IDENTITIES,
  type AvatarId,
  getActiveIdentity,
  identityForId,
} from './identity'

interface AgentChatResponse {
  conversation_id: string
  avatar_id: number
  response: string
}

interface AgentErrorResponse {
  detail?: { message?: string }
}

interface ChatMessage {
  role: 'user' | 'avatar' | 'error'
  text: string
}

interface ChatLifecycle {
  onOpen: () => void
  onClose: () => void
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const messagesByAvatar = new Map<AvatarId, ChatMessage[]>()
const conversationByAvatar = new Map<AvatarId, string>()
const pendingAvatars = new Set<AvatarId>()
let activeAvatarId: AvatarId | null = null
let lifecycle: ChatLifecycle = { onOpen: () => undefined, onClose: () => undefined }

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function chatRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#chat-root')
}

function renderMessages(): void {
  const list = chatRoot()?.querySelector<HTMLElement>('.chat-messages')
  if (!list || activeAvatarId === null) return
  const profile = identityForId(activeAvatarId)
  const messages = messagesByAvatar.get(activeAvatarId) ?? []
  list.innerHTML = messages.map(message => `
    <article class="chat-message chat-message--${message.role}">
      <span>${message.role === 'user' ? '你' : message.role === 'error' ? '提示' : escapeHtml(profile?.name ?? '分身')}</span>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join('')
  list.scrollTop = list.scrollHeight
}

function renderPending(): void {
  const root = chatRoot()
  const waiting = activeAvatarId !== null && pendingAvatars.has(activeAvatarId)
  const input = root?.querySelector<HTMLInputElement>('.chat-input')
  const submit = root?.querySelector<HTMLButtonElement>('.chat-submit')
  if (input) input.disabled = waiting
  if (submit) {
    submit.disabled = waiting
    submit.textContent = waiting ? '思考中…' : '发送'
  }
}

export function configureChatLifecycle(next: ChatLifecycle): void {
  lifecycle = next
}

export function isChatOpen(): boolean {
  const root = chatRoot()
  return Boolean(root && !root.hidden && activeAvatarId !== null)
}

export function getActiveChatAvatarId(): AvatarId | null {
  return isChatOpen() ? activeAvatarId : null
}

export function closeAvatarChat(): void {
  const root = chatRoot()
  if (!root || root.hidden) return
  root.hidden = true
  activeAvatarId = null
  lifecycle.onClose()
}

async function sendMessage(message: string): Promise<void> {
  if (activeAvatarId === null || pendingAvatars.has(activeAvatarId)) return
  const viewer = getActiveIdentity()
  const avatarId = activeAvatarId
  const history = messagesByAvatar.get(avatarId) ?? []
  history.push({ role: 'user', text: message })
  messagesByAvatar.set(avatarId, history)
  renderMessages()
  pendingAvatars.add(avatarId)
  renderPending()

  try {
    const response = await fetch(`${API}/api/agent/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: viewer.id,
        avatar_id: avatarId,
        conversation_id: conversationByAvatar.get(avatarId) ?? `${viewer.id}:${avatarId}`,
        message,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as AgentErrorResponse | null
      throw new Error(payload?.detail?.message || `服务返回 ${response.status}`)
    }
    const result = await response.json() as AgentChatResponse
    if (result.avatar_id !== avatarId || !result.conversation_id || typeof result.response !== 'string') {
      throw new Error('回复格式不正确')
    }
    conversationByAvatar.set(avatarId, result.conversation_id)
    history.push({ role: 'avatar', text: result.response })
  } catch (error) {
    const detail = error instanceof Error && error.name !== 'TimeoutError' ? error.message : '请求超时'
    history.push({
      role: 'error',
      text: `暂时无法联系分身（${detail}），请确认后端服务已启动后重试。`,
    })
  } finally {
    pendingAvatars.delete(avatarId)
    if (activeAvatarId === avatarId) {
      renderPending()
      renderMessages()
      chatRoot()?.querySelector<HTMLInputElement>('.chat-input')?.focus()
    }
  }
}

function ensureChatShell(): HTMLElement | null {
  const root = chatRoot()
  if (!root || root.dataset.ready === 'true') return root
  root.dataset.ready = 'true'
  root.innerHTML = `
    <section class="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <header class="chat-header">
        <span class="chat-avatar" aria-hidden="true">知</span>
        <div><h2 id="chat-title"></h2><p class="chat-tagline"></p></div>
        <button type="button" class="chat-close" aria-label="关闭对话">×</button>
      </header>
      <div class="chat-messages" aria-live="polite" aria-relevant="additions"></div>
      <form class="chat-form">
        <label class="sr-only" for="avatar-chat-input">输入消息</label>
        <input id="avatar-chat-input" class="chat-input" maxlength="1000" autocomplete="off" placeholder="和分身聊聊…" required>
        <button class="chat-submit" type="submit">发送</button>
      </form>
      <p class="chat-footnote">与 AI 分身对话 · 回车发送 · Esc 关闭</p>
    </section>
  `
  root.querySelector<HTMLButtonElement>('.chat-close')?.addEventListener('click', closeAvatarChat)
  root.addEventListener('click', event => {
    if (event.target === root) closeAvatarChat()
  })
  root.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Escape') closeAvatarChat()
  })
  root.querySelector<HTMLFormElement>('.chat-form')?.addEventListener('submit', event => {
    event.preventDefault()
    const input = root.querySelector<HTMLInputElement>('.chat-input')
    const message = input?.value.trim() ?? ''
    if (!message) return
    if (input) input.value = ''
    void sendMessage(message)
  })
  return root
}

export function openAvatarChat(avatarId: AvatarId): void {
  const profile = identityForId(avatarId)
  const root = ensureChatShell()
  if (!profile || !root) return
  const wasOpen = isChatOpen()
  activeAvatarId = avatarId
  root.querySelector<HTMLElement>('#chat-title')!.textContent = avatarId === getActiveIdentity().id
    ? `与自己的分身 · ${profile.name}`
    : `与 ${profile.name} 的分身对话`
  root.querySelector<HTMLElement>('.chat-tagline')!.textContent = profile.tagline
  if (!messagesByAvatar.has(avatarId)) {
    messagesByAvatar.set(avatarId, [{
      role: 'avatar',
      text: `你好，我是${profile.name}的数字分身。我们可以从你的想法开始聊起。`,
    }])
  }
  root.hidden = false
  if (!wasOpen) lifecycle.onOpen()
  renderPending()
  renderMessages()
  root.querySelector<HTMLInputElement>('.chat-input')?.focus()
}

export function toggleSelfAvatarChat(): void {
  const selfId = getActiveIdentity().id
  if (getActiveChatAvatarId() === selfId) {
    closeAvatarChat()
    return
  }
  openAvatarChat(selfId)
}

export function knownAvatarIds(): readonly AvatarId[] {
  return MOCK_IDENTITIES.map(identity => identity.id)
}
