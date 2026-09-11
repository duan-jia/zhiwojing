const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function initialWorldId() {
  const url = new URL(window.location.href)
  return url.searchParams.get('world') || crypto.randomUUID()
}

export function startWorldConnection() {
  let worldId = initialWorldId()
  let socket: WebSocket | undefined
  let retry = 0
  let timer: number | undefined
  let stopped = false
  let switching = false
  const avatars = new Map<string, { id: string, name: string, x: number, y: number }>()

  const status = document.createElement('aside')
  status.className = 'world-connection'
  status.setAttribute('role', 'status')
  status.innerHTML = '<span>正在连接多人世界…</span><button type="button">换一个多人房间</button>'
  document.body.append(status)
  const label = status.querySelector('span')!

  const connect = () => {
    window.clearTimeout(timer)
    label.textContent = retry ? '正在重新连接多人世界…' : '正在连接多人世界…'
    const endpoint = new URL(API)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    endpoint.pathname = `/ws/world/${encodeURIComponent(worldId)}`
    socket = new WebSocket(endpoint)
    socket.addEventListener('open', () => {
      retry = 0
      label.textContent = '正在加入多人世界…'
      socket?.send(JSON.stringify({ type: 'join', name: '旅行者' }))
    })
    socket.addEventListener('message', (event) => {
      let message: any
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.type === 'welcome') {
        avatars.clear()
        for (const avatar of message.avatars || []) avatars.set(avatar.id, avatar)
        label.textContent = '多人世界已连接'
      } else if ((message.type === 'join' || message.type === 'position') && message.avatar) {
        avatars.set(message.avatar.id, message.avatar)
      } else if (message.type === 'leave') {
        avatars.delete(message.avatarId)
      } else return
      window.dispatchEvent(new CustomEvent('world-state', {
        detail: { worldId, message, avatars: Array.from(avatars.values()) }
      }))
    })
    socket.addEventListener('error', () => { label.textContent = '多人世界加载失败' })
    socket.addEventListener('close', () => {
      if (stopped) return
      if (switching) { switching = false; return }
      const delay = Math.min(1000 * 2 ** retry++, 10000)
      label.textContent = `连接已断开，${Math.ceil(delay / 1000)} 秒后重连`
      timer = window.setTimeout(connect, delay)
    })
  }

  status.querySelector('button')?.addEventListener('click', () => {
    worldId = crypto.randomUUID()
    const url = new URL(window.location.href)
    url.searchParams.set('world', worldId)
    history.replaceState(null, '', url)
    switching = Boolean(socket)
    socket?.close()
    connect()
  })
  connect()
  return () => { stopped = true; window.clearTimeout(timer); socket?.close(); status.remove() }
}
