import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformWithOxc } from 'vite'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function loadTypeScriptModule(relativePath) {
  const path = join(projectRoot, relativePath)
  let source = await readFile(path, 'utf8')
  if (relativePath.endsWith('player.ts')) source = source.replace(/import \{ enableAgent, takeControl, toggleAgent \} from '.\/autonomy'/, 'const enableAgent=()=>{}; const takeControl=()=>{}; const toggleAgent=()=>{}')
  const result = await transformWithOxc(source, path)
  const url = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`
  return import(url)
}

test('mock identity selection validates and persists the chosen avatar', async () => {
  const identity = await loadTypeScriptModule('src/identity.ts')
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }

  assert.equal(identity.readStoredIdentity(storage).id, 1)
  identity.persistIdentity(identity.identityForId(2), storage)
  assert.equal(identity.readStoredIdentity(storage).name, '苏晚')
  assert.equal(identity.getActiveIdentity().id, 2)
  values.set(identity.IDENTITY_STORAGE_KEY, '999')
  assert.equal(identity.readStoredIdentity(storage).id, 1)
})

test('RPGJS connection query becomes synchronized mock identity metadata', async () => {
  const { player } = await loadTypeScriptModule('src/modules/main/player.ts')
  const graphics = []
  const mockPlayer = {
    id: 'connection-a3f2',
    name: '',
    avatarId: Object.assign(() => mockPlayer.avatarIdValue, {
      set: value => { mockPlayer.avatarIdValue = value }
    }),
    avatarIdValue: 0,
    setGraphic: graphic => graphics.push(graphic),
    changeMap: async () => undefined
  }

  player.onAccepted(mockPlayer, { query: { avatar_id: '2' } })
  assert.equal(mockPlayer.avatarId(), 2)
  assert.equal(mockPlayer.name, '苏晚 · A3F2')
  assert.equal(graphics.at(-1), 'female')

  player.onAccepted(mockPlayer, { query: { avatar_id: 'not-valid' } })
  assert.equal(mockPlayer.avatarId(), 1)
  assert.match(mockPlayer.name, /^体验用户 · /)
})

test('nearby dialogue targets include players and residents and exclude self', async () => {
  const dialogue = await loadTypeScriptModule('src/dialogue-target.ts')
  const sprite = (id, avatarId, x, y, name, type = 'player') => ({
    id: () => id,
    avatarId: () => avatarId,
    x: () => x,
    y: () => y,
    name: () => name,
    _type: type
  })
  const self = sprite('self', 1, 0, 0, '体验用户 · SELF')
  const selfWithoutIdentity = { id: 'anonymous-self', x: 0, y: 0, name: '载入中的玩家' }
  const sameAgent = sprite('same-agent', 1, 50, 0, '体验用户 · A001')
  const player = sprite('player-b', 2, 40, 0, '苏晚 · B001')
  const resident = { id: 'avatar-zhou-bo', name: '周博', x: 20, y: 0 }
  const far = sprite('far', 3, 65, 0, '周博 · F001')

  assert.equal(dialogue.avatarIdForSprite(resident), 3)
  assert.equal(
    dialogue.findNearestDialogueTarget(self, [self, sameAgent, player, resident, far]).objectId,
    'avatar-zhou-bo'
  )
  assert.equal(dialogue.findNearestDialogueTarget(self, [self, far]), null)
  assert.equal(dialogue.findNearestDialogueTarget(self, [sameAgent]).avatarId, 1)
  assert.equal(
    dialogue.findNearestDialogueTarget(selfWithoutIdentity, [resident]).objectId,
    'avatar-zhou-bo'
  )
})

test('equal-distance targets use object id as a stable tie breaker', async () => {
  const dialogue = await loadTypeScriptModule('src/dialogue-target.ts')
  const self = { id: 'self', avatarId: 1, name: '自己', x: 0, y: 0, _type: 'player' }
  const right = { id: 'target-b', avatarId: 2, name: '苏晚', x: 32, y: 0, _type: 'player' }
  const left = { id: 'target-a', avatarId: 3, name: '周博', x: -32, y: 0, _type: 'player' }
  assert.equal(dialogue.findNearestDialogueTarget(self, [right, left]).objectId, 'target-a')
})

test('client integration wires B, E, click, HUD, and movement locking', async () => {
  const [html, interactions, chat] = await Promise.all([
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'dialogue-interactions.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'chat.ts'), 'utf8')
  ])
  assert.match(html, /id="interaction-hud"/)
  assert.match(interactions, /key === 'b'/)
  assert.match(interactions, /key === 'e'/)
  assert.match(interactions, /engine\.interactions\.use/)
  assert.match(interactions, /DIALOGUE_RANGE/)
  assert.match(interactions, /stopProcessingInput = true/)
  assert.match(chat, /user_id: viewer\.id/)
  assert.match(chat, /toggleSelfAvatarChat/)
})
