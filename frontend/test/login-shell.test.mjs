import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test('login shell gates RPGJS startup behind Zhihu authentication', async () => {
  const [html, client, login, styles, contacts, menuInput, clientConfig, liukanshan] = await Promise.all([
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'client.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'login.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'login.css'), 'utf8'),
    readFile(join(projectRoot, 'src', 'contacts.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'menu-input.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'config', 'config.client.ts'), 'utf8'),
    readFile(join(projectRoot, 'public', 'spritesheets', 'liukanshan.png')),
  ])

  assert.match(html, /id="login-root"/)
  assert.match(html, /id="rpg" hidden/)
  assert(client.indexOf('await showLogin()') < client.indexOf('startGame('))
  assert.match(login, /游客体验/)
  assert.match(login, /\/api\/auth\/guest/)
  assert.match(login, /未来在我们认识之前，<br><em>我们的 Agent 先认识。<\/em>/)
  assert.doesNotMatch(login, /identity-picker|identity-option|选择本地体验身份/)
  assert.doesNotMatch(login, /persistIdentity/)
  assert.match(client, /avatar_id: String\(identity\.id\)/)
  assert.match(login, /\/api\/oauth\/status/)
  assert.match(login, /\/api\/oauth\/start/)
  assert.match(login, /integrationReady/)
  assert.match(styles, /@media \(max-width: 720px\)/)
  assert.match(styles, /spritesheets\/liukanshan\.png/)
  assert.match(clientConfig, /id: 'liukanshan'/)
  assert.match(clientConfig, /image: 'spritesheets\/liukanshan-sword\.png'/)
  assert.equal(liukanshan.readUInt32BE(16), 192)
  assert.equal(liukanshan.readUInt32BE(20), 256)
  assert.doesNotMatch(html, /class="controls-hint"/)
  assert.match(menuInput, /操作按键/)
  assert.match(menuInput, /WASD \/ 方向键/)
  assert.match(html, /id="top-right-hud"/)
  assert.match(styles, /\.top-right-hud \{[^}]*flex-direction: column/)
  assert.match(styles, /\.top-right-hud \{[^}]*gap: 12px/)
  assert.match(contacts, /querySelector<HTMLElement>\('#top-right-hud'\)/)
})

test('lightweight panels explicitly override the RPG UI reset text color', async () => {
  const styles = await readFile(join(projectRoot, 'src', 'login.css'), 'utf8')
  const expectDarkText = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(styles, new RegExp(`${escaped}\\s*\\{[^}]*color:\\s*#(?:172033|17345f)`, 's'))
  }

  [
    '.contacts-panel',
    '.contact-row',
    '.contact-status',
    '.thread-messages p',
    '.thread-form input',
    '.landmark-panel',
    '.landmark-content',
    '.persona-card',
    '.persona-card span',
    '.persona-refresh',
    '.chat-panel',
  ].forEach(expectDarkText)

  assert.match(styles, /\.thread-messages \.mine p\s*\{[^}]*color:\s*#fff[^}]*background:\s*#1772f6/s)
})

// Execute the login controller with a minimal DOM so retries and visibility
// are checked as behavior, independently of the RPG renderer.
async function loginHarness(respond, initialStorage = [], currentUrl = 'http://test/') {
  const { default: ts } = await import('typescript')
  const { runInNewContext } = await import('node:vm')
  class Element {
    hidden = false
    disabled = false
    listeners = new Map()
    querySelector(selector) { return elements[selector] }
    addEventListener(event, callback, options) { this.listeners.set(event, { callback, options }) }
    async click() {
      if (this.disabled) return
      const listener = this.listeners.get('click')
      if (listener?.options?.once) this.listeners.delete('click')
      await listener?.callback()
    }
  }
  const elements = Object.fromEntries(['#login-root', '#rpg', '.oauth-login-button', 'strong', 'small', '.enter-game-button', '.login-status'].map(key => [key, new Element()]))
  elements['#rpg'].hidden = true
  const source = (await readFile(join(projectRoot, 'src/login.ts'), 'utf8')).replace('import.meta.env.VITE_API_URL', '"http://test"')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const storage = new Map(initialStorage)
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }
  const location = new URL(currentUrl)
  location.assign = () => {}
  runInNewContext(code, {
    exports,
    require: specifier => specifier === './api'
      ? {
          readAuthToken: () => localStorage.getItem('zhiwojing.auth-token') || '',
          saveAuthToken: token => localStorage.setItem('zhiwojing.auth-token', token),
          apiFetch: (url, init) => respond(url, init),
        }
      : { DEFAULT_IDENTITY: { id: 1 }, setActiveIdentity() {} },
    document: { querySelector: selector => elements[selector] },
    window: {
      localStorage,
      location,
      history: { state: null, replaceState(_state, _unused, url) { location.href = new URL(url, location.href).href } },
    },
    fetch: respond, AbortSignal, URL, URLSearchParams,
  })
  const result = exports.showLogin()
  return { elements, result, storage, location }
}

test('guest failure can be retried and successful login reveals the game', async () => {
  let attempts = 0
  const harness = await loginHarness(async url => {
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ integrationReady: false }) }
    attempts += 1
    return { ok: attempts > 1, json: async () => ({ token: 'guest-token', user: { id: 4, name: '游客' } }) }
  })
  const button = harness.elements['.enter-game-button']
  await button.click()
  assert.equal(button.disabled, false)
  assert.equal(harness.elements['#rpg'].hidden, true)
  await button.click()
  assert.equal((await harness.result).id, 4)
  assert.equal(harness.elements['#login-root'].hidden, true)
  assert.equal(harness.elements['#rpg'].hidden, false)
  assert.equal(harness.storage.get('zhiwojing.auth-token'), 'guest-token')
})

test('an existing OAuth session waits on the login page until the user continues', async () => {
  const harness = await loginHarness(async url => ({ ok: true, json: async () => url.endsWith('/session') ? { token: 'oauth-session' } : ({ authorized: true, integrationReady: true, user: { id: 5, name: '知乎用户' } }) }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.elements['#login-root'].hidden, false)
  assert.equal(harness.elements['#rpg'].hidden, true)
  await harness.elements['.oauth-login-button'].click()
  assert.equal((await harness.result).id, 5)
  assert.equal(harness.storage.get('zhiwojing.auth-token'), 'oauth-session')
  assert.equal(harness.elements['#login-root'].hidden, true)
  assert.equal(harness.elements['#rpg'].hidden, false)
})

test('a successful OAuth callback enters once and removes its URL marker', async () => {
  const harness = await loginHarness(
    async url => ({ ok: true, json: async () => url.endsWith('/session') ? { token: 'oauth-session', user: { id: 5, name: '知乎用户' } } : ({ authorized: true, integrationReady: true, user: { id: 5, name: '知乎用户' } }) }),
    [],
    'http://test/?oauth=success',
  )
  assert.equal((await harness.result).id, 5)
  assert.equal(harness.elements['#login-root'].hidden, true)
  assert.equal(harness.elements['#rpg'].hidden, false)
  assert.equal(harness.location.search, '')
})

test('stored guest session waits for a click before resuming through the authenticated me endpoint', async () => {
  const requests = []
  const harness = await loginHarness(async (url, init = {}) => {
    requests.push({ url, init })
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ integrationReady: false }) }
    if (url.endsWith('/me')) return { ok: true, json: async () => ({ id: 4, name: '游客' }) }
    throw new Error(`unexpected request: ${url}`)
  }, [['zhiwojing.auth-token', 'stored-guest-token']])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.elements['#login-root'].hidden, false)
  assert.equal(harness.elements['#rpg'].hidden, true)
  assert.equal(requests.some(request => request.url.endsWith('/me')), false)
  await harness.elements['.enter-game-button'].click()
  assert.equal((await harness.result).id, 4)
  assert.equal(harness.elements['#login-root'].hidden, true)
  assert.equal(harness.elements['#rpg'].hidden, false)
  assert.equal(requests.some(request => request.url.endsWith('/me')), true)
})
