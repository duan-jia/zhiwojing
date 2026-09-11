interface AgentChatResponse {
  conversation_id: string
  avatar_id: number
  response: string
}

interface ChatMessage {
  role: 'user' | 'avatar' | 'error'
  text: string
}

interface AvatarProfile {
  id: number
  name: string
  tagline: string
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const avatars = new Map<number, AvatarProfile>([
  [2, { id: 2, name: '苏晚', tagline: '生活方式作者' }],
  [3, { id: 3, name: '周博', tagline: '科普研究员' }],
])

const messagesByAvatar = new Map<number, ChatMessage[]>()
const conversationByAvatar = new Map<number, string>()
let activeAvatarId: number | null = null
let pending = false

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character)
}

function chatRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#chat-root')
}

function renderMessages(): void {
  const list = chatRoot()?.querySelector<HTMLElement>('.chat-messages')
  if (!list || activeAvatarId === null) return

  const profile = avatars.get(activeAvatarId)
  const messages = messagesByAvatar.get(activeAvatarId) ?? []
  list.innerHTML = messages.map(message => `
    <article class="chat-message chat-message--${message.role}">
      <span>${message.role === 'user' ? '你' : message.role === 'error' ? '提示' : escapeHtml(profile?.name ?? '分身')}</span>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join('')
  list.scrollTop = list.scrollHeight
}

function setPending(value: boolean): void {
  pending = value
  const root = chatRoot()
  const input = root?.querySelector<HTMLInputElement>('.chat-input')
  const submit = root?.querySelector<HTMLButtonElement>('.chat-submit')
  if (input) input.disabled = value
  if (submit) {
    submit.disabled = value
    submit.textContent = value ? '思考中…' : '发送'
  }
}

function closeChat(): void {
  const root = chatRoot()
  if (!root || pending) return
  root.hidden = true
  activeAvatarId = null
}

async function sendMessage(message: string): Promise<void> {
  if (activeAvatarId === null || pending) return
  const avatarId = activeAvatarId
  const history = messagesByAvatar.get(avatarId) ?? []
  history.push({ role: 'user', text: message })
  messagesByAvatar.set(avatarId, history)
  renderMessages()
  setPending(true)

  try {
    const response = await fetch(`${API}/api/agent/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 1,
        avatar_id: avatarId,
        conversation_id: conversationByAvatar.get(avatarId) ?? null,
        message,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`服务返回 ${response.status}`)
    }
    const result = await response.json() as AgentChatResponse
    if (result.avatar_id !== avatarId || !result.conversation_id || typeof result.response !== 'string') {
      throw new Error('回复格式不正确')
    }
    conversationByAvatar.set(avatarId, result.conversation_id)
    history.push({ role: 'avatar', text: result.response })
  } catch (error) {
    const detail = error instanceof Error && error.name !== 'TimeoutError'
      ? error.message
      : '请求超时'
    history.push({
      role: 'error',
      text: `暂时无法联系分身（${detail}），请确认后端服务已启动后重试。`,
    })
  } finally {
    if (activeAvatarId === avatarId) {
      setPending(false)
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
      <p class="chat-footnote">与 AI 分身对话 · 回车发送</p>
    </section>
  `

  root.querySelector<HTMLButtonElement>('.chat-close')?.addEventListener('click', closeChat)
  root.addEventListener('click', event => {
    if (event.target === root) closeChat()
  })
  root.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Escape') closeChat()
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

export function openAvatarChat(avatarId: number): void {
  const profile = avatars.get(avatarId)
  const root = ensureChatShell()
  if (!profile || !root) return

  activeAvatarId = avatarId
  root.querySelector<HTMLElement>('#chat-title')!.textContent = `与 ${profile.name} 对话`
  root.querySelector<HTMLElement>('.chat-tagline')!.textContent = profile.tagline
  if (!messagesByAvatar.has(avatarId)) {
    messagesByAvatar.set(avatarId, [{
      role: 'avatar',
      text: `你好，我是${profile.name}。点击地图上的我，就可以随时继续这段对话。`,
    }])
  }
  root.hidden = false
  renderMessages()
  root.querySelector<HTMLInputElement>('.chat-input')?.focus()
}

export function avatarIdForSprite(sprite: unknown): number | null {
  if (!sprite || typeof sprite !== 'object') return null
  const target = sprite as Record<string, unknown>
  const read = (value: unknown): unknown => typeof value === 'function'
    ? (value as () => unknown)()
    : value
  const candidates = [read(target.id), read(target.name), read(target._name)].map(String)
  if (candidates.some(value => value === 'avatar-su-wan' || value === '苏晚')) return 2
  if (candidates.some(value => value === 'avatar-zhou-bo' || value === '周博')) return 3
  return null
}
