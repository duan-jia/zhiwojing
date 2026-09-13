import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test('login shell gates RPGJS startup and preserves guest and OAuth paths', async () => {
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
  assert.match(login, /以 \$\{selectedIdentity\.name\} 进入/)
  assert.match(login, /选择本地体验身份/)
  assert.match(login, /persistIdentity/)
  assert.match(client, /avatar_id: String\(identity\.id\)/)
  assert.match(login, /\/api\/oauth\/status/)
  assert.match(login, /\/api\/oauth\/start/)
  assert.match(login, /integrationReady/)
  assert.match(styles, /@media \(max-width: 720px\)/)
  assert.match(styles, /spritesheets\/liukanshan\.png/)
  assert.match(clientConfig, /id: 'liukanshan'/)
  assert.match(clientConfig, /image: 'spritesheets\/liukanshan\.png'/)
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
