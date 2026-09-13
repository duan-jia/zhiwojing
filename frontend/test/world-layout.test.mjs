import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOWN_BUILDINGS } from '../src/town-layout.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const mapPath = join(root, 'src', 'tiled', 'nature-open-world.tmx')
const W = 64, H = 48, TILE = 32
const decode = (xml, name) => {
  const match = xml.match(new RegExp(`<layer[^>]*name="${name}"[^>]*>[\\s\\S]*?<data encoding="base64">\\s*([^<]+)`))
  assert(match, `missing ${name}`)
  const b = Buffer.from(match[1].replace(/\s/g, ''), 'base64')
  assert.equal(b.length, W * H * 4)
  return Array.from({ length: W * H }, (_, i) => b.readUInt32LE(i * 4))
}
const cell = (a,x,y) => a[y*W+x]

test('town map has the compact 64x48 four-layer Tiled layout', async () => {
  const xml = await readFile(mapPath, 'utf8')
  assert.match(xml, /width="64" height="48" tilewidth="32" tileheight="32"/)
  for (const name of ['Ground','Terrain','Buildings','Nature']) decode(xml,name)
  assert.match(xml, /<objectgroup[^>]*name="Objects"/)
  assert.match(xml, /name="start"[^>]*x="928" y="832"/)
})

test('six building bases block walls while every entrance connects to spawn', async () => {
  const xml = await readFile(mapPath, 'utf8')
  const buildings = decode(xml,'Buildings'), terrain = decode(xml,'Terrain'), nature = decode(xml,'Nature')
  const passable = (x,y) => x >= 0 && y >= 0 && x < W && y < H
    && cell(terrain,x,y) !== 1455 && !cell(buildings,x,y) && ![17,18].includes(cell(nature,x,y))
  const visited = new Set(['29,26']), queue = [[29,26]]
  for (let i = 0; i < queue.length; i++) {
    const [x,y] = queue[i]
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy, key = `${nx},${ny}`
      if (passable(nx,ny) && !visited.has(key)) { visited.add(key); queue.push([nx,ny]) }
    }
  }
  assert.equal(TOWN_BUILDINGS.length, 6)
  for (const b of TOWN_BUILDINGS) {
    const [x1,y1,x2,y2] = b.walls
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) assert.equal(cell(buildings,x,y),8001,`${b.name} wall`)
    assert(visited.has(`${b.doorX},${b.doorY}`), `${b.name} entrance unreachable`)
    assert.equal(cell(terrain,b.doorX,b.doorY),4279)
    const image = await readFile(join(root,'public','spritesheets',b.image))
    assert.equal(image[25],6,`${b.name} must have an RGBA PNG`)
  }
  // Both sides of the main street, both legs of the loop and all four regions.
  for (const [x,y] of [[7,24],[56,24],[21,41],[38,41],[14,18],[47,19],[14,37],[46,37]]) assert(visited.has(`${x},${y}`))
  const collision = await readFile(join(root,'src','tiled','town-collision.tsx'),'utf8')
  assert.match(collision,/name="collision" type="bool" value="true"/)
})

test('water boundary collides visually and roads, spawn, landmarks remain aligned', async () => {
  const xml = await readFile(mapPath, 'utf8'), terrain = decode(xml,'Terrain'), nature = decode(xml,'Nature')
  for (let x=0;x<W;x++) { assert.equal(cell(terrain,x,0),1455); assert.equal(cell(terrain,x,H-1),1455) }
  for (let y=0;y<H;y++) { assert.equal(cell(terrain,0,y),1455); assert.equal(cell(terrain,W-1,y),1455) }
  assert.equal(cell(terrain,29,26),4279)
  assert.equal(cell(terrain,29,22),4279)
  assert(nature.filter(Boolean).length >= 30)
  const landmarks = await readFile(join(root,'src','landmarks.ts'),'utf8')
  assert.match(landmarks,/x: 928, y: 608/); assert.match(landmarks,/x: 448, y: 544/)
  const server = await readFile(join(root,'src','modules','main','server.ts'),'utf8')
  assert.match(server,/maps:\s*\[\{\s*id: 'nature-open-world'/)
  const player = await readFile(join(root,'src','modules','main','player.ts'),'utf8')
  assert(player.indexOf("setGraphic('liukanshan')") < player.indexOf("changeMap('nature-open-world', 'start')"))
  const autonomy = await readFile(join(root,'src','modules','main','autonomy.ts'),'utf8')
  assert.match(autonomy,/export const TILE_SIZE = 32/)
})

test('camera defaults to configurable 2x zoom', async () => {
  const source = await readFile(join(root,'src','camera.ts'),'utf8')
  assert.match(source,/VITE_CAMERA_ZOOM \?\? 2/)
  assert.match(source,/viewport\.setZoom\(zoom, true\)/)
})

test('trees have complete canopies and trunks without covering roads or buildings', async () => {
  const xml = await readFile(mapPath, 'utf8')
  const nature = decode(xml, 'Nature'), terrain = decode(xml, 'Terrain'), buildings = decode(xml, 'Buildings')
  let trees = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gid = cell(nature, x, y)
    if (!gid) continue
    assert.equal(cell(terrain, x, y), 0, `tree covers terrain at ${x},${y}`)
    assert.equal(cell(buildings, x, y), 0, `tree covers building at ${x},${y}`)
    assert([9, 10, 17, 18].includes(gid), `unexpected tree fragment ${gid}`)
    const left = x - ([10, 18].includes(gid) ? 1 : 0)
    const top = y - ([17, 18].includes(gid) ? 1 : 0)
    assert(left >= 0 && top >= 0 && left + 1 < W && top + 1 < H)
    assert.deepEqual([cell(nature,left,top),cell(nature,left+1,top),cell(nature,left,top+1),cell(nature,left+1,top+1)], [9,10,17,18])
    if (gid === 9) trees++
  }
  assert(trees >= 30)
  const atlas = await readFile(join(root, 'src', 'tiled', '[Base]BaseChip_pipo.tsx'), 'utf8')
  for (const id of [8, 9]) {
    const tile = atlas.match(new RegExp(`<tile id="${id}">([\\s\\S]*?)</tile>`))[1]
    assert.match(tile, /name="collision" type="bool" value="false"/)
    assert.match(tile, /name="z" type="int" value="1"/)
  }
  for (const id of [16, 17]) {
    const tile = atlas.match(new RegExp(`<tile id="${id}">([\\s\\S]*?)</tile>`))[1]
    assert.match(tile, /name="collision" type="bool" value="true"/)
  }
})
