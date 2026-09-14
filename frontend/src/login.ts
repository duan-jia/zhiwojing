interface OAuthStatus {
  configured: boolean
  integrationReady: boolean
}

import {
  DEFAULT_IDENTITY,
  type MockIdentity,
  setActiveIdentity,
} from './identity'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const AUTH_TOKEN_STORAGE_KEY = 'zhiwojing.auth-token'

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

  const ticket = new URLSearchParams(window.location.search).get('ticket')
  if (ticket) {
    return fetch(`${API}/api/auth/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    }).then(async response => {
      if (!response.ok) throw new Error('OAuth ticket exchange failed')
      const session = await response.json() as { token: string }
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token)
      history.replaceState({}, '', window.location.pathname)
      root.hidden = true
      game.hidden = false
      return selectedIdentity
    })
  }

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
  const status = root.querySelector<HTMLElement>('.login-status')
  void fetch(`${API}/api/oauth/status`, {
    credentials: 'include',
    signal: AbortSignal.timeout(5000),
  })
    .then(async response => {
      if (!response.ok) throw new Error('OAuth status unavailable')
      return response.json() as Promise<OAuthStatus>
    })
    .then(oauth => {
      if (!oauthButton || !oauthLabel || !oauthDetail) return
      oauthButton.disabled = !oauth.integrationReady
      oauthLabel.textContent = oauth.integrationReady
        ? '使用知乎账号登录'
        : oauth.configured
          ? '知乎登录开发中'
          : '知乎登录暂未开放'
      oauthDetail.textContent = oauth.integrationReady ? '连接你的知乎账号' : 'OAuth 接口已预留 · 后续开放'
      if (status) status.textContent = oauth.integrationReady
        ? '认证后将返回知我境。'
        : '知乎认证服务尚未启用，请稍后再试。'
    })
    .catch(() => {
      if (oauthLabel) oauthLabel.textContent = '知乎登录暂不可用'
      if (oauthDetail) oauthDetail.textContent = '认证服务暂时不可用'
      if (status) status.textContent = '暂时无法读取知乎认证状态，请稍后刷新。'
    })

  return new Promise(resolve => {
    oauthButton?.addEventListener('click', () => {
      if (oauthButton.disabled) return
      window.location.assign(`${API}/api/oauth/start`)
    }, { once: true })
    // The OAuth callback reloads the page and will eventually provide the
    // authenticated identity. Keep this promise pending until then.
    void resolve
  })
}
