import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test('login shell gates RPGJS startup and preserves guest and OAuth paths', async () => {
  const [html, client, login, styles] = await Promise.all([
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'client.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'login.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'login.css'), 'utf8'),
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
})
