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
const TREE = 17
const WALL = 353

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

// Main street, north/south avenue and the paved central square.
rect(terrain, 5, 23, 58, 25, PATH)
rect(terrain, 28, 5, 30, 42, PATH)
rect(terrain, 23, 19, 34, 28, PATH)
for (const [x1, y1, x2, y2] of [[14,15,15,23],[26,13,27,19],[38,15,39,23],[12,25,13,28],[40,25,41,28]]) rect(terrain, x1, y1, x2, y2, PATH)

// Buildings are deliberately compact (5x5, market 6x5). Roof/wall tiles collide;
// each doorway and the full approach remain empty and walkable.
const houses = [
  { x1: 12, y1: 10, x2: 16, y2: 14, door: 14 },
  { x1: 24, y1: 8, x2: 28, y2: 12, door: 26 },
  { x1: 36, y1: 10, x2: 40, y2: 14, door: 38 },
  { x1: 10, y1: 29, x2: 14, y2: 33, door: 12, doorSide: 'top' },
  { x1: 38, y1: 29, x2: 43, y2: 33, door: 40, doorSide: 'top' },
]
for (const h of houses) {
  rect(buildings, h.x1, h.y1, h.x2, h.y2, WALL)
  // A distinct roof ridge using adjacent tiles gives the facades depth.
  for (let x = h.x1; x <= h.x2; x++) at(buildings, x, h.y1, WALL + 8 + ((x - h.x1) % 3))
}

// Trees and stones close the land edge, but never narrow a road or doorway.
for (let x = 3; x < width - 3; x += 3) { at(nature, x, 3, TREE); at(nature, x, height - 4, TREE + 1) }
for (let y = 6; y < height - 5; y += 3) { at(nature, 3, y, TREE + 2); at(nature, width - 4, y, TREE + 3) }
for (const [x,y] of [[7,8],[9,16],[18,7],[20,34],[47,9],[52,17],[49,35],[55,30],[18,40],[34,39]]) at(nature,x,y,TREE + ((x+y)%4))

const encode = values => {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, i) => buffer.writeUInt32LE(value, i * 4))
  return buffer.toString('base64').match(/.{1,120}/g).map(line => `   ${line}`).join('\n')
}
const tileLayer = (id, name, cells) => ` <layer id="${id}" name="${name}" width="${width}" height="${height}">\n  <data encoding="base64">\n${encode(cells)}\n  </data>\n </layer>`
const signs = [
  ['知我居', 14, 15], ['创作坊', 26, 13], ['邮局', 38, 15], ['茶馆', 12, 28], ['集市', 40, 28],
].map(([name,x,y], i) => `  <object id="${i + 2}" name="${name}" class="sign" x="${x * TILE}" y="${y * TILE}"><point/></object>`).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.9" tiledversion="1.9.2" orientation="orthogonal" renderorder="right-down" width="${width}" height="${height}" tilewidth="${TILE}" tileheight="${TILE}" infinite="0" nextlayerid="6" nextobjectid="8">
 <tileset firstgid="1" source="[Base]BaseChip_pipo.tsx"/>
 <tileset firstgid="1001" source="[A]Water_pipo.tsx"/>
 <tileset firstgid="4073" source="[A]Dirt_pipo.tsx"/>
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
