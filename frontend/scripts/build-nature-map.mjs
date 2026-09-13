import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOWN_BUILDINGS } from '../src/town-layout.mjs'

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'tiled')
const width = 64
const height = 48
const TILE = 32
const GROUND = 1
const WATER = 1455
const PATH = 4279
// The round green tree occupies a 2x2 block in the eight-column atlas.
const TREE = 9
const WALL = 8001

const layer = fill => new Array(width * height).fill(fill)
const ground = layer(GROUND)
const terrain = layer(0)
const buildings = layer(0)
const nature = layer(0)
const at = (cells, x, y, value) => { cells[y * width + x] = value }
const rect = (cells, x1, y1, x2, y2, value) => {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) at(cells, x, y, value)
}

// A two-tile water border makes the finite map boundary visible and impassable.
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) at(terrain, x, y, WATER)
}

// A central square and a southern loop keep every south-facing door reachable.
rect(terrain, 5, 23, 58, 25, PATH)
rect(terrain, 23, 19, 35, 27, PATH)
rect(terrain, 7, 40, 56, 42, PATH)
rect(terrain, 20, 24, 22, 41, PATH)
rect(terrain, 37, 24, 39, 41, PATH)
for (const b of TOWN_BUILDINGS) {
  rect(terrain, b.doorX - 1, b.doorY, b.doorX + 1, b.doorY < 23 ? 24 : 41, PATH)
  rect(terrain, b.doorX - 2, b.doorY, b.doorX + 2, b.doorY + 1, PATH)
}

// Only the low building bases collide; the roofs remain walk-behind scenery.
for (const b of TOWN_BUILDINGS) {
  // Invisible physical base; the full building graphic is a depth-sorted event.
  rect(buildings, ...b.walls, WALL)
}

// Stamp complete trees. The atlas supplies canopy z-order and trunk collision.
// Check the whole footprint so future road edits cannot leave half a tree.
const tree = (x, y) => {
  const parts = [[x, y, TREE], [x + 1, y, TREE + 1], [x, y + 1, TREE + 8], [x + 1, y + 1, TREE + 9]]
  if (parts.some(([tx, ty]) => tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2
    || terrain[ty * width + tx] || buildings[ty * width + tx] || nature[ty * width + tx]
    || TOWN_BUILDINGS.some(b => Math.abs(tx - b.centerX) < 6 && ty >= b.bottomY - b.height / TILE - 1 && ty <= b.bottomY + 1))) return
  for (const [tx, ty, gid] of parts) at(nature, tx, ty, gid)
}
for (let x = 3; x < width - 4; x += 4) { tree(x, 3 + (x % 3)); tree(x, height - 4) }
for (let y = 9; y < height - 7; y += 4) { tree(3 + (y % 2), y); tree(width - 5, y) }
for (const [x,y] of [[6,9],[8,6],[18,6],[20,9],[7,18],[9,20],[18,20],[40,6],[54,9],[55,18],[53,20],[6,28],[7,32],[24,30],[40,29],[55,29],[55,35],[24,43],[39,44]]) tree(x,y)

const encode = values => {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, i) => buffer.writeUInt32LE(value, i * 4))
  return buffer.toString('base64').match(/.{1,120}/g).map(line => `   ${line}`).join('\n')
}
const tileLayer = (id, name, cells) => ` <layer id="${id}" name="${name}" width="${width}" height="${height}">\n  <data encoding="base64">\n${encode(cells)}\n  </data>\n </layer>`
const signs = TOWN_BUILDINGS.map(({name,doorX,doorY}, i) => `  <object id="${i + 2}" name="${name}" class="sign" x="${doorX * TILE}" y="${doorY * TILE}"><point/></object>`).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.9" tiledversion="1.9.2" orientation="orthogonal" renderorder="right-down" width="${width}" height="${height}" tilewidth="${TILE}" tileheight="${TILE}" infinite="0" nextlayerid="6" nextobjectid="8">
 <tileset firstgid="1" source="[Base]BaseChip_pipo.tsx"/>
 <tileset firstgid="1001" source="[A]Water_pipo.tsx"/>
 <tileset firstgid="4073" source="[A]Dirt_pipo.tsx"/>
 <tileset firstgid="8001" source="town-collision.tsx"/>
${tileLayer(1, 'Ground', ground)}
${tileLayer(2, 'Terrain', terrain)}
${tileLayer(3, 'Buildings', buildings)}
${tileLayer(4, 'Nature', nature)}
 <objectgroup id="5" name="Objects">
  <object id="1" name="start" class="start" x="928" y="832"><point/></object>
${signs}
 </objectgroup>
</map>
`
await writeFile(join(root, 'nature-open-world.tmx'), xml)
