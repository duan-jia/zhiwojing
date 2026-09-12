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

test('landmark registry exposes hot square close to the spawn', async () => {
  const { LANDMARKS, landmarkForId } = await loadTypeScriptModule('src/landmarks.ts')
  assert.deepEqual(LANDMARKS[0], {
    id: 'landmark-hot-square', name: '热榜广场', x: 800, y: 736, kind: 'hot-square'
  })
  assert.equal(landmarkForId('landmark-hot-square').kind, 'hot-square')
  assert.equal(landmarkForId('missing'), null)
})

test('landmark interaction and panel use the shared two-tile range', async () => {
  const [target, interaction, panel, html, server] = await Promise.all([
    readFile(join(projectRoot, 'src', 'landmark-target.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'dialogue-interactions.ts'), 'utf8'),
    readFile(join(projectRoot, 'src', 'landmark-panel.ts'), 'utf8'),
    readFile(join(projectRoot, 'index.html'), 'utf8'),
    readFile(join(projectRoot, 'src', 'modules', 'main', 'server.ts'), 'utf8'),
  ])
  assert.match(target, /LANDMARK_RANGE = 64/)
  assert.match(interaction, /findNearestLandmark/)
  assert.match(interaction, /openLandmarkPanel/)
  assert.match(panel, /\/api\/zhihu\/hot/)
  assert.match(panel, /target="_blank"/)
  assert.match(panel, /正在搬运知乎热榜/)
  assert.match(panel, /热榜加载失败/)
  assert.match(html, /id="landmark-root"/)
  assert.match(server, /id: 'landmark-hot-square'/)
  assert.match(server, /setGraphic\('landmark-hot'\)/)
})
