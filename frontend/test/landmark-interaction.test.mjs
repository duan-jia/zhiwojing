import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformWithOxc } from 'vite'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function loadTypeScriptModule(relativePath) {
  const path = join(projectRoot, relativePath)
  const source = await readFile(path, 'utf8')
  const result = await transformWithOxc(source, path)
  const url = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`
  return import(url)
}

test('landmark registry exposes all six town buildings', async () => {
  const { LANDMARKS, landmarkForId } = await loadTypeScriptModule('src/landmarks.ts')
  assert.deepEqual(LANDMARKS[0], {
    id: 'landmark-hot-square', name: '知乎热榜', x: 928, y: 608, kind: 'hot-square', buildingId: 'hot', icon: '榜'
  })
  assert.equal(landmarkForId('landmark-hot-square').kind, 'hot-square')
  assert.equal(landmarkForId('missing'), null)
  assert.deepEqual(LANDMARKS[1], {
    id: 'landmark-user-home', name: '知我居', x: 448, y: 544, kind: 'user-home', buildingId: 'home', icon: '居'
  })
  assert.deepEqual(LANDMARKS.map(item => item.buildingId), ['hot', 'home', 'book', 'wendao', 'write', 'tiangong'])
})

test('landmark interaction and panel use the shared two-tile range', async () => {
  const [target, interaction, panel, catalog, html, server] = await Promise.all([
    readFile(join(projectRoot, 'src', 'landmark-target.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'dialogue-interactions.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'landmark-panel.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'building-catalog.ts'), 'utf8'),
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'modules', 'main', 'server.ts'), 'utf8'),
  ])
  assert.match(target, /LANDMARK_RANGE = 64/)
  assert.match(interaction, /findNearestLandmark/)
  assert.match(interaction, /openLandmarkPanel/)
  assert.match(catalog, /\/api\/world\/buildings/)
  assert.match(panel, /\/api\/zhihu\/hot/)
  assert.match(panel, /target="_blank"/)
  assert.match(panel, /正在搬运知乎热榜/)
  assert.match(panel, /热榜加载失败/)
  for (const label of ['user_contents', 'user_followees', 'user_collections', 'creator_account_stats']) assert.match(panel, new RegExp(label))
  assert.match(panel, /\/api\/zhihu\/user\/collections/)
  assert.match(panel, /\/api\/zhihu\/user\/favlists/)
  assert.match(html, /id="landmark-root"/)
  assert.match(server, /id: building\.landmarkId/)
  assert.match(server, /building\.doorX \* 32/)
  assert.doesNotMatch(server, /setGraphic\('landmark-(?:hot|home)'\)/)
  assert.equal((server.match(/this\.setHitbox\(1, 1\)/g) ?? []).length >= 2, true)
})
