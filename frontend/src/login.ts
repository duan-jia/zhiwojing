interface OAuthStatus {
  configured: boolean
  integrationReady: boolean
  authorized: boolean
  missingConfiguration?: string[]
  user?: { id: number; name: string; profile?: { interests?: string[]; style?: string } } | null
}

import {
  DEFAULT_IDENTITY,
  type MockIdentity,
  setActiveIdentity,
} from './identity'
import { apiFetch, readAuthToken, saveAuthToken } from './api'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function showLogin(): Promise<MockIdentity> {
  const root = document.querySelector<HTMLElement>('#login-root')
  const game = document.querySelector<HTMLElement>('#rpg')

  if (!root || !game) {
    return Promise.resolve(DEFAULT_IDENTITY)
  }

  // Keep the default avatar for the RPGJS compatibility contract until the
  // OAuth callback supplies the authenticated profile.
  const selectedIdentity = DEFAULT_IDENTITY
  setActiveIdentity(selectedIdentity)

  root.innerHTML = `
    <main class="login-screen">
      <section class="login-scene" aria-labelledby="login-title">
        <div class="login-stars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="login-landscape" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="login-copy">
          <div class="login-brand"><span class="login-logo">知</span><strong>知我境</strong></div>
          <p class="login-eyebrow">ZHIHU PIXEL WORLD · CHAPTER 01</p>
          <h1 id="login-title">未来在我们认识之前，<br><em>我们的 Agent 先认识。</em></h1>
          <p class="login-intro">使用知乎账号认证后进入知我境，让你的 Agent 遇见更多人，连接彼此的想法与灵感。</p>
          <div class="login-actions">
            <button type="button" class="oauth-login-button" disabled>
              <span class="oauth-icon">知</span>
              <span><strong>正在读取登录状态…</strong><small>知乎 OAuth</small></span>
            </button>
            <button type="button" class="enter-game-button">
              <span>▶</span> 游客体验
            </button>
          </div>
          <p class="login-status" role="status">请使用知乎账号完成认证后进入。</p>
        </div>
        <div class="login-character" aria-label="像素旅人">
          <div class="login-speech">准备好了吗？</div>
          <span class="login-character-shadow"></span>
          <span class="login-character-sprite"></span>
        </div>
        <span class="login-version">RPGJS WORLD · MVP</span>
      </section>
    </main>
  `

  const oauthButton = root.querySelector<HTMLButtonElement>('.oauth-login-button')
  const oauthLabel = oauthButton?.querySelector<HTMLElement>('strong')
  const oauthDetail = oauthButton?.querySelector<HTMLElement>('small')
  const guestButton = root.querySelector<HTMLButtonElement>('.enter-game-button')
  const status = root.querySelector<HTMLElement>('.login-status')
  const oauthReturn = new URLSearchParams(window.location.search).get('oauth') === 'success'
  let resolveLogin: ((identity: MockIdentity) => void) | undefined
  let entered = false
  let authorizedOAuthUser: OAuthStatus['user']
  const enterGame = (identity: MockIdentity) => {
    if (entered) return
    entered = true
    setActiveIdentity(identity)
    root.hidden = true
    game.hidden = false
    resolveLogin?.(identity)
  }
  const completeLogin = (
    token: string,
    user: { id?: number; name?: string; profile?: { interests?: string[] } } | null | undefined,
    fallbackTagline: string,
  ) => {
    if (!token || !user?.id) throw new Error('login response incomplete')
    saveAuthToken(token)
    enterGame({
      id: user.id,
      name: user.name || '知我境用户',
      tagline: user.profile?.interests?.join('、') || fallbackTagline,
    })
  }
  const restoreStoredSession = async (): Promise<boolean> => {
    const storedToken = readAuthToken()
    if (!storedToken) return false
    try {
      const response = await apiFetch(`${API}/api/me`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return false
      const user = await response.json() as OAuthStatus['user']
      if (entered) return true
      completeLogin(storedToken, user, user?.name === '游客' ? '知我境体验用户' : '知我境用户')
      return true
    } catch {
      return false
    }
  }
  const completeOAuthSession = async (user: OAuthStatus['user']) => {
    const sessionResponse = await fetch(`${API}/api/auth/session`, {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(5000),
    })
    if (!sessionResponse.ok) throw new Error('OAuth session unavailable')
    const session = await sessionResponse.json() as { token: string; user?: OAuthStatus['user'] }
    if (!session.token) throw new Error('OAuth session missing token')
    if (entered) return
    completeLogin(session.token, session.user || user, '知乎用户')
  }
  const clearOAuthReturnMarker = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('oauth')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  guestButton?.addEventListener('click', async () => {
    if (entered || guestButton.disabled) return
    guestButton.disabled = true
    guestButton.textContent = '正在进入知我境…'
    try {
      if (await restoreStoredSession()) return
      const response = await apiFetch(`${API}/api/auth/guest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error('guest login failed')
      const result = await response.json() as { token?: string; user?: { id?: number; name?: string } }
      completeLogin(result.token || '', result.user, '知我境体验用户')
    } catch {
      guestButton.disabled = false
      guestButton.innerHTML = '<span>▶</span> 游客体验'
      if (status) status.textContent = '游客登录失败，请稍后重试。'
    }
  })
  void fetch(`${API}/api/oauth/status`, {
    credentials: 'include',
    signal: AbortSignal.timeout(5000),
  })
    .then(async response => {
      if (!response.ok) throw new Error('OAuth status unavailable')
      return response.json() as Promise<OAuthStatus>
    })
    .then(async oauth => {
      if (entered) return
      if (!oauthButton || !oauthLabel || !oauthDetail) return
      oauthButton.disabled = !oauth.integrationReady
      oauthLabel.textContent = oauth.integrationReady
        ? '使用知乎账号登录'
        : oauth.configured
          ? '知乎登录开发中'
          : '知乎登录暂未开放'
      oauthDetail.textContent = oauth.integrationReady ? '连接你的知乎账号' : 'OAuth 接口已预留 · 后续开放'
      if (status) {
        if (oauth.integrationReady) {
          status.textContent = '认证后将返回知我境。'
        } else if (oauth.missingConfiguration?.length) {
          const labels: Record<string, string> = {
            app_id: 'App ID',
            redirect_uri: '公网回调地址',
            app_key: 'OAuth App Key',
            access_secret: 'Access Secret',
          }
          const missing = oauth.missingConfiguration.map(item => labels[item] || item).join('、')
          status.textContent = `知乎登录尚未配置：缺少 ${missing}。`
        } else {
          status.textContent = '知乎认证服务尚未启用，请稍后再试。'
        }
      }
      if (oauth.authorized) {
        authorizedOAuthUser = oauth.user
        oauthLabel.textContent = '继续进入知我境'
        oauthDetail.textContent = oauth.user?.name || '已连接知乎账号'
        if (status) status.textContent = '已认证，点击继续进入。'
        if (oauthReturn) {
          await completeOAuthSession(oauth.user)
          clearOAuthReturnMarker()
        }
      }
    })
    .catch(() => {
      if (entered) return
      if (oauthLabel) oauthLabel.textContent = '知乎登录暂不可用'
      if (oauthDetail) oauthDetail.textContent = '认证服务暂时不可用'
      if (status) status.textContent = '暂时无法读取知乎认证状态，请稍后刷新。'
    })

  return new Promise(resolve => {
    resolveLogin = resolve
    oauthButton?.addEventListener('click', async () => {
      if (oauthButton.disabled) return
      if (authorizedOAuthUser) {
        oauthButton.disabled = true
        try {
          await completeOAuthSession(authorizedOAuthUser)
        } catch {
          oauthButton.disabled = false
          if (status) status.textContent = '登录会话暂时不可用，请稍后重试。'
        }
        return
      }
      window.location.assign(`${API}/api/oauth/start`)
    })
    // The OAuth callback reloads the page and will eventually provide the
    // authenticated identity. Keep this promise pending until then.
    void resolve
  })
}
