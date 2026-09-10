import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const mapRoot = join(projectRoot, 'src', 'tiled')
const regionTiles = 50
const tileSize = 32
const regionPixels = regionTiles * tileSize
const dirtGid = 4279
const waterGid = 1455

const readMap = async (id, size = regionTiles) => {
  const xml = await readFile(join(mapRoot, `${id}.tmx`), 'utf8')
  const mapTag = xml.match(/<map\b[^>]*>/)?.[0]
  assert(mapTag, `${id} has no map tag`)

  const attribute = name => Number(mapTag.match(new RegExp(`${name}="(\\d+)"`))?.[1])
  assert.equal(attribute('width'), size, `${id} width`)
  assert.equal(attribute('height'), size, `${id} height`)
  assert.equal(attribute('tilewidth'), tileSize, `${id} tile width`)
  assert.equal(attribute('tileheight'), tileSize, `${id} tile height`)

  const readLayer = name => {
    const pattern = new RegExp(`<layer[^>]*name="${name}"[^>]*>[\\s\\S]*?<data encoding="base64">\\s*([^<]+?)\\s*<\\/data>[\\s\\S]*?<\\/layer>`)
    const encoded = xml.match(pattern)?.[1]
    assert(encoded, `${id} is missing ${name}`)
    const buffer = Buffer.from(encoded.replace(/\s/g, ''), 'base64')
    assert.equal(buffer.length, size * size * 4, `${id} ${name} cell count`)
    return Array.from({ length: size * size }, (_, offset) => buffer.readUInt32LE(offset * 4))
  }

  return {
    terrain: readLayer('Terrain'),
    objects: readLayer('Objects'),
  }
}

const cell = (layer, x, y) => layer[y * regionTiles + x]

test('nature world contains four adjacent 50 by 50 regions', async () => {
  const world = JSON.parse(await readFile(join(mapRoot, 'nature.world'), 'utf8'))
  assert.equal(world.type, 'world')
  assert.deepEqual(world.maps, [
    { fileName: 'nature-nw.tmx', height: regionPixels, width: regionPixels, x: 0, y: 0 },
    { fileName: 'nature-ne.tmx', height: regionPixels, width: regionPixels, x: regionPixels, y: 0 },
    { fileName: 'nature-sw.tmx', height: regionPixels, width: regionPixels, x: 0, y: regionPixels },
    { fileName: 'nature-se.tmx', height: regionPixels, width: regionPixels, x: regionPixels, y: regionPixels },
  ])
})

test('each region has water, paths, and sparse blocking objects', async () => {
  for (const id of ['nature-nw', 'nature-ne', 'nature-sw', 'nature-se']) {
    const map = await readMap(id)
    assert(map.terrain.includes(waterGid), `${id} has no water`)
    assert(map.terrain.includes(dirtGid), `${id} has no path`)
    const objectCount = map.objects.filter(Boolean).length
    assert(objectCount > 0 && objectCount < 40, `${id} object density is not sparse`)
  }
})

test('all internal seams have aligned six-tile clear paths', async () => {
  const maps = Object.fromEntries(await Promise.all(
    ['nature-nw', 'nature-ne', 'nature-sw', 'nature-se'].map(async id => [id, await readMap(id)])
  ))

  const horizontalSeams = [
    [maps['nature-nw'], maps['nature-ne']],
    [maps['nature-sw'], maps['nature-se']],
  ]
  for (const [left, right] of horizontalSeams) {
    for (let y = 22; y <= 27; y += 1) {
      assert.equal(cell(left.terrain, 49, y), dirtGid)
      assert.equal(cell(right.terrain, 0, y), dirtGid)
      assert.equal(cell(left.objects, 49, y), 0)
      assert.equal(cell(right.objects, 0, y), 0)
    }
  }

  const verticalSeams = [
    [maps['nature-nw'], maps['nature-sw']],
    [maps['nature-ne'], maps['nature-se']],
  ]
  for (const [top, bottom] of verticalSeams) {
    for (let x = 22; x <= 27; x += 1) {
      assert.equal(cell(top.terrain, x, 49), dirtGid)
      assert.equal(cell(bottom.terrain, x, 0), dirtGid)
      assert.equal(cell(top.objects, x, 49), 0)
      assert.equal(cell(bottom.objects, x, 0), 0)
    }
  }
})

test('runtime uses one continuous 100 by 100 map with the four source quadrants intact', async () => {
  const runtimeMap = await readMap('nature-open-world', regionTiles * 2)
  const runtimeWidth = regionTiles * 2

  for (const [id, offsetX, offsetY] of [
    ['nature-nw', 0, 0],
    ['nature-ne', regionTiles, 0],
    ['nature-sw', 0, regionTiles],
    ['nature-se', regionTiles, regionTiles],
  ]) {
    const source = await readMap(id)
    for (const layerName of ['terrain', 'objects']) {
      for (let y = 0; y < regionTiles; y += 1) {
        for (let x = 0; x < regionTiles; x += 1) {
          assert.equal(
            runtimeMap[layerName][(offsetY + y) * runtimeWidth + offsetX + x],
            source[layerName][y * regionTiles + x],
            `${id} ${layerName} differs at ${x},${y}`
          )
        }
      }
    }
  }

  const serverSource = await readFile(join(projectRoot, 'src', 'modules', 'main', 'server.ts'), 'utf8')
  assert.match(serverSource, /maps:\s*\[\{ id: 'nature-open-world' \}\]/)
  assert.doesNotMatch(serverSource, /worldMaps\s*:/)

  const playerSource = await readFile(join(projectRoot, 'src', 'modules', 'main', 'player.ts'), 'utf8')
  assert(
    playerSource.indexOf("player.setGraphic('hero')") < playerSource.indexOf("await player.changeMap('nature-open-world', 'start')"),
    'player graphic must be set before the initial map transfer'
  )
})
