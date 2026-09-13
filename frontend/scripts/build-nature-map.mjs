import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'tiled')
const width = 64
const height = 48
const TILE = 32
const GROUND = 1
const WATER = 1455
const PATH = 4279
const PLAZA = 4255
const MUD = 4319
const TREE = 17
const WALL = 353
const FLOWER = 4409

const layer = fill => new Array(width * height).fill(fill)
const ground = layer(GROUND)
const terrain = layer(0)
const buildings = layer(0)
const facade = layer(0)
const nature = layer(0)
const at = (cells, x, y, value) => { cells[y * width + x] = value }
const rect = (cells, x1, y1, x2, y2, value) => {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) at(cells, x, y, value)
}

// A two-tile water border makes the finite map boundary visible and impassable.
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) at(terrain, x, y, WATER)
}

// Main street, north/south avenue and the paved central square. The plaza uses
// a separate stone paving tile so it reads as a civic space, not a wide road.
rect(terrain, 5, 23, 58, 25, PATH)
rect(terrain, 28, 5, 30, 42, PATH)
rect(terrain, 23, 19, 34, 28, PLAZA)
rect(terrain, 28, 19, 30, 28, PATH)
rect(terrain, 23, 23, 34, 25, PATH)
for (const [x1, y1, x2, y2] of [[14,15,15,23],[26,13,27,19],[38,15,39,23],[12,25,13,28],[40,25,41,28]]) rect(terrain, x1, y1, x2, y2, PATH)

// Buildings is a hidden collision mask. Facade is the visual-only layer: each
// matrix has two roof rows, walls and a two-tile-high door. This prevents visual
// components from changing collision while keeping the entire roof footprint
// blocked (including entry from the north).
const styleA = width => [
  Array.from({ length: width }, (_, i) => i === 0 ? 352 : i === width - 1 ? 354 : 353),
  Array.from({ length: width }, () => 360),
  Array.from({ length: width }, (_, i) => [371, 372, 373, 374, 375, 371][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [371, 372, 373, 374, 375, 371][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [371, 372, 373, 374, 375, 371][i]),
]
const styleB = width => [
  Array.from({ length: width }, (_, i) => i === 0 ? 352 : i === width - 1 ? 354 : 353),
  Array.from({ length: width }, () => 370),
  Array.from({ length: width }, (_, i) => [377, 378, 378, 378, 379, 377][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [377, 378, 378, 378, 379, 377][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [377, 378, 378, 378, 379, 377][i]),
]
const styleC = width => [
  Array.from({ length: width }, (_, i) => i === 0 ? 352 : i === width - 1 ? 354 : 353),
  Array.from({ length: width }, () => 360),
  Array.from({ length: width }, (_, i) => i === 1 ? 337 : i === width - 2 ? 338 : [371, 372, 373, 374, 375][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [371, 372, 373, 374, 375][i]),
  Array.from({ length: width }, (_, i) => i === Math.floor(width / 2) ? 383 : [371, 372, 373, 374, 375][i]),
]
const houses = [
  { x1: 12, y1: 10, x2: 16, y2: 14, matrix: styleA(5) },
  { x1: 24, y1: 8, x2: 28, y2: 12, matrix: styleB(5) },
  { x1: 36, y1: 10, x2: 40, y2: 14, matrix: styleC(5) },
  { x1: 10, y1: 29, x2: 14, y2: 33, matrix: styleB(5) },
  { x1: 38, y1: 29, x2: 43, y2: 33, matrix: styleA(6) },
]
for (const h of houses) {
  rect(buildings, h.x1, h.y1, h.x2, h.y2, WALL)
  h.matrix.forEach((row, dy) => row.forEach((tile, dx) => at(facade, h.x1 + dx, h.y1 + dy, tile)))
}

// Trees and stones close the land edge, but never narrow a road or doorway.
for (let x = 3; x < width - 3; x += 3) { at(nature, x, 3, TREE); at(nature, x, height - 4, TREE + 1) }
for (let y = 6; y < height - 5; y += 3) { at(nature, 3, y, TREE + 2); at(nature, width - 4, y, TREE + 3) }
for (const [x,y] of [[7,8],[9,16],[18,7],[20,34],[47,9],[52,17],[49,35],[55,30],[18,40],[34,39]]) at(nature,x,y,TREE + ((x+y)%4))
// Deterministic grass, flower and bare-earth variation avoids flat fields while
// preserving every road, facade and landmark approach.
for (const [x,y] of [[6,12],[8,20],[18,17],[21,10],[33,8],[45,13],[51,21],[7,35],[25,36],[34,33],[47,38],[56,12]]) at(ground,x,y,2 + ((x+y)%3))
for (const [x,y] of [[7,13],[19,18],[21,39],[33,16],[46,19],[52,33],[57,27],[31,37]]) at(nature,x,y,FLOWER + ((x+y)%4))
for (const [x,y] of [[5,18],[17,31],[22,15],[33,31],[45,8],[54,36]]) at(terrain,x,y,MUD + ((x+y)%3))

const encode = values => {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, i) => buffer.writeUInt32LE(value, i * 4))
  return buffer.toString('base64').match(/.{1,120}/g).map(line => `   ${line}`).join('\n')
}
const tileLayer = (id, name, cells, attrs = '') => ` <layer id="${id}" name="${name}" width="${width}" height="${height}"${attrs}>\n  <data encoding="base64">\n${encode(cells)}\n  </data>\n </layer>`
const signs = [
  ['知我居', 14, 15], ['创作坊', 26, 13], ['邮局', 38, 15], ['茶馆', 12, 28], ['集市', 40, 28],
].map(([name,x,y], i) => `  <object id="${i + 2}" name="${name}" class="sign" x="${x * TILE}" y="${y * TILE}"><point/></object>`).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.9" tiledversion="1.9.2" orientation="orthogonal" renderorder="right-down" width="${width}" height="${height}" tilewidth="${TILE}" tileheight="${TILE}" infinite="0" nextlayerid="7" nextobjectid="8">
 <tileset firstgid="1" source="[Base]BaseChip_pipo.tsx"/>
 <tileset firstgid="1001" source="[A]Water_pipo.tsx"/>
 <tileset firstgid="4073" source="[A]Dirt_pipo.tsx"/>
 <tileset firstgid="4409" source="[A]Flower_pipo.tsx"/>
${tileLayer(1, 'Ground', ground)}
${tileLayer(2, 'Terrain', terrain)}
${tileLayer(3, 'Buildings', buildings, ' visible="0"')}
${tileLayer(4, 'Facade', facade)}
${tileLayer(5, 'Nature', nature)}
 <objectgroup id="6" name="Objects">
  <object id="1" name="start" class="start" x="832" y="448"><point/></object>
${signs}
 </objectgroup>
</map>
`
await writeFile(join(root, 'nature-open-world.tmx'), xml)
