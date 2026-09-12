import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test('avatar sprites open a persistent, failure-safe Agent chat overlay', async () => {
  const [html, chat, clientConfig, server, styles] = await Promise.all([
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'chat.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'config', 'config.client.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'modules', 'main', 'server.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'login.css'), 'utf8'),
  ])

  assert.match(html, /id="chat-root" hidden/)
  assert.match(chat, /\/api\/agent\/chat/)
  assert.match(chat, /conversationByAvatar/)
  assert.match(chat, /avatar_id: avatarId/)
  assert.match(chat, /user_id: viewer\.id/)
  assert.match(chat, /暂时无法联系分身/)
  assert.match(chat, /payload\?\.detail\?\.message/)
  assert.match(clientConfig, /setupDialogueInteractions/)
  assert.match(server, /id: 'avatar-su-wan'/)
  assert.match(server, /id: 'avatar-zhou-bo'/)
  assert.match(styles, /\.chat-panel/)
  assert.match(styles, /@media \(max-width: 720px\)/)
})
