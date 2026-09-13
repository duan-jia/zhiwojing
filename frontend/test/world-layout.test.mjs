import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

test('five facades have approved footprints, signs, collision, and clear approaches', async () => {
  const xml = await readFile(mapPath, 'utf8')
  const buildings = decode(xml,'Buildings'), terrain = decode(xml,'Terrain')
  const plans = [
    ['知我居',12,10,16,14,14,15], ['创作坊',24,8,28,12,26,13],
    ['邮局',36,10,40,14,38,15], ['茶馆',10,29,14,33,12,28],
    ['集市',38,29,43,33,40,28],
  ]
  for (const [name,x1,y1,x2,y2,dx,dy] of plans) {
    assert.match(xml, new RegExp(`name="${name}"[^>]*x="${dx*TILE}" y="${dy*TILE}"`))
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) assert.notEqual(cell(buildings,x,y),0,`${name} wall ${x},${y}`)
    assert.equal(cell(buildings,dx,dy),0,`${name} approach`)
    assert.equal(cell(terrain,dx,dy),4279,`${name} approach path`)
  }
})

test('water boundary collides visually and roads, spawn, landmarks remain aligned', async () => {
  const xml = await readFile(mapPath, 'utf8'), terrain = decode(xml,'Terrain'), nature = decode(xml,'Nature')
  for (let x=0;x<W;x++) { assert.equal(cell(terrain,x,0),1455); assert.equal(cell(terrain,x,H-1),1455) }
  for (let y=0;y<H;y++) { assert.equal(cell(terrain,0,y),1455); assert.equal(cell(terrain,W-1,y),1455) }
  assert.equal(cell(terrain,29,26),4279)
  assert.equal(cell(terrain,29,22),4279)
  assert(nature.filter(Boolean).length >= 30)
  const landmarks = await readFile(join(root,'src','landmarks.ts'),'utf8')
  assert.match(landmarks,/x: 928, y: 704/); assert.match(landmarks,/x: 448, y: 480/)
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
