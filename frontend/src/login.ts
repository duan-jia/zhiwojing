interface OAuthStatus {
  configured: boolean
  integrationReady: boolean
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function showLogin(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#login-root')
  const game = document.querySelector<HTMLElement>('#rpg')
  const controls = document.querySelector<HTMLElement>('.controls-hint')

  if (!root || !game) {
    return Promise.resolve()
  }

  root.innerHTML = `
    <main class="login-screen">
      <section class="login-scene" aria-labelledby="login-title">
        <div class="login-stars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="login-landscape" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="login-copy">
          <div class="login-brand"><span class="login-logo">知</span><strong>知我境</strong></div>
          <p class="login-eyebrow">ZHIHU PIXEL WORLD · CHAPTER 01</p>
          <h1 id="login-title">去世界走走，<br><em>挖掘新的灵感。</em></h1>
          <p class="login-intro">进入这片开放世界，先从自由行走和探索开始。</p>
          <div class="login-actions">
            <button type="button" class="enter-game-button"><span>▶</span> 游客身份进入</button>
            <button type="button" class="oauth-login-button" disabled>
              <span class="oauth-icon">知</span>
              <span><strong>正在读取登录状态…</strong><small>知乎 OAuth</small></span>
            </button>
          </div>
          <p class="login-status" role="status">当前使用本地模拟角色，不会发起真实授权。</p>
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

  const guestButton = root.querySelector<HTMLButtonElement>('.enter-game-button')
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
      if (oauth.integrationReady && status) {
        status.textContent = '可以连接知乎账号，也可以继续使用游客模式。'
      }
    })
    .catch(() => {
      if (oauthLabel) oauthLabel.textContent = '知乎登录暂不可用'
      if (oauthDetail) oauthDetail.textContent = '仍可使用游客模式进入'
      if (status) status.textContent = '暂时无法读取登录状态，仍可使用游客模式进入。'
    })

  oauthButton?.addEventListener('click', () => {
    window.location.assign(`${API}/api/oauth/start`)
  })

  return new Promise(resolve => {
    guestButton?.addEventListener('click', () => {
      game.hidden = false
      if (controls) controls.hidden = false
      root.remove()
      resolve()
    }, { once: true })
  })
}
