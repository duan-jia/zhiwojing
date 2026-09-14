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
