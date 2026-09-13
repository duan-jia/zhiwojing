export interface Contact { id: number; name: string; status: 'active' | 'removed'; online: boolean; humanControlled: boolean; lastMessage: string | null; unread: number }
export interface ThreadMessage { id: number; senderId: number; senderKind: 'human' | 'agent'; content: string; createdAt: string }
export const totalUnread = (contacts: Contact[]): number => contacts.reduce((sum, item) => sum + item.unread, 0)
export const deliveryNotice = (result: { delivered: string; capped?: boolean }): string => result.capped || result.delivered === 'capped' ? '分身连续回复已达上限，请等待对方本人回复。' : ''

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char)

export function setupContacts(userId: number) {
  const root = document.querySelector<HTMLElement>('#contacts-root')
  if (!root) return { destroy: () => undefined }
  const button = document.createElement('button')
  button.type = 'button'; button.className = 'contacts-hud'; button.innerHTML = '通讯录 <span hidden>0</span>'
  document.body.append(button)
  let contacts: Contact[] = []; let active: Contact | null = null; let timer = 0; let notice = ''
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...init })
    if (!response.ok) throw new Error(`服务返回 ${response.status}`)
    return response.json() as Promise<T>
  }
  const refresh = async () => {
    try {
      const result = await request<{ contacts: Contact[] }> (`/api/contacts?user_id=${userId}`)
      contacts = result.contacts
      if (active) active = contacts.find(item => item.id === active?.id) ?? null
      const badge = button.querySelector('span')!; const unread = totalUnread(contacts)
      badge.textContent = String(unread); badge.hidden = unread === 0
      if (!root.hidden) render()
    } catch { /* polling must not interrupt gameplay */ }
  }
  const render = async () => {
    let messages: ThreadMessage[] = []
    if (active) {
      const result = await request<{ messages: ThreadMessage[] }>(`/api/messages/thread/${active.id}?user_id=${userId}`).catch(() => ({ messages: [] }))
      messages = result.messages
    }
    root.innerHTML = `<section class="contacts-panel" role="dialog" aria-modal="true" aria-labelledby="contacts-title">
      <header><h2 id="contacts-title">通讯录</h2><button class="contacts-close" aria-label="关闭通讯录">×</button></header>
      <div class="contacts-layout"><nav aria-label="联系人">${contacts.length ? contacts.map(item => `<button class="contact-row${active?.id === item.id ? ' active' : ''}" data-id="${item.id}"><i class="${item.online ? 'online' : ''}"></i><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.lastMessage || (item.status === 'removed' ? '已删除 · 可重新添加' : '还没有消息'))}</small></span>${item.unread ? `<b>${item.unread}</b>` : ''}</button>`).join('') : '<p class="contacts-empty">完成一次对话后，对方会出现在这里。</p>'}</nav>
      <main>${active ? `<div class="thread-title"><span><strong>${escapeHtml(active.name)}</strong><small>${active.online ? (active.humanControlled ? '在线 · 本人操控' : '在线 · 分身代理') : '离线 · 分身代理'}</small></span><button class="contact-status">${active.status === 'removed' ? '重新添加' : '删除'}</button></div><div class="thread-messages">${messages.map(item => `<article class="${item.senderId === userId ? 'mine' : ''}"><small>${item.senderKind === 'agent' ? '分身' : item.senderId === userId ? '你' : escapeHtml(active!.name)}</small><p>${escapeHtml(item.content)}</p></article>`).join('') || '<p class="contacts-empty">发一条消息开始远程对话。</p>'}</div>${notice ? `<p class="thread-notice">${escapeHtml(notice)}</p>` : ''}<form class="thread-form"><input maxlength="4000" required placeholder="发送远程消息…" ${active.status === 'removed' ? 'disabled' : ''}><button ${active.status === 'removed' ? 'disabled' : ''}>发送</button></form>` : '<p class="contacts-empty thread-placeholder">选择一位联系人查看会话</p>'}</main></div></section>`
    root.querySelector('.contacts-close')?.addEventListener('click', close)
    root.querySelectorAll<HTMLElement>('.contact-row').forEach(row => row.addEventListener('click', () => { active = contacts.find(item => item.id === Number(row.dataset.id)) ?? null; notice = ''; void render().then(refresh) }))
    root.querySelector('.contact-status')?.addEventListener('click', async () => { if (!active) return; await request(`/api/contacts/${active.id}${active.status === 'removed' ? '/restore' : ''}?user_id=${userId}`, { method: active.status === 'removed' ? 'POST' : 'DELETE' }); await refresh(); active = contacts.find(item => item.id === active?.id) ?? null; void render() })
    root.querySelector<HTMLFormElement>('.thread-form')?.addEventListener('submit', async event => { event.preventDefault(); if (!active) return; const input = root.querySelector<HTMLInputElement>('.thread-form input')!; const content = input.value.trim(); if (!content) return; input.disabled = true; try { const result = await request<{ delivered: string; capped?: boolean }>('/api/messages/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender_id: userId, recipient_id: active.id, content }) }); notice = deliveryNotice(result); input.value = ''; await render(); await refresh() } catch { notice = '消息发送失败，请稍后重试。'; input.disabled = false; await render() } })
  }
  const close = () => { root.hidden = true }
  button.addEventListener('click', () => { root.hidden = !root.hidden; if (!root.hidden) void refresh().then(render) })
  root.addEventListener('click', event => { if (event.target === root) close() })
  void refresh(); timer = window.setInterval(refresh, 5_000)
  return { destroy: () => { window.clearInterval(timer); button.remove(); void fetch(`${API}/api/presence`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, online: false, human_controlled: false }) }) } }
}
