import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const tiledRoot = join(projectRoot, 'src', 'tiled')
const sourceSize = 50
const targetSize = sourceSize * 2
const quadrants = [
  { id: 'nature-nw', offsetX: 0, offsetY: 0 },
  { id: 'nature-ne', offsetX: sourceSize, offsetY: 0 },
  { id: 'nature-sw', offsetX: 0, offsetY: sourceSize },
  { id: 'nature-se', offsetX: sourceSize, offsetY: sourceSize },
]

const decodeLayer = (xml, name) => {
  const pattern = new RegExp(`<layer[^>]*name="${name}"[^>]*>[\\s\\S]*?<data encoding="base64">\\s*([^<]+?)\\s*<\\/data>[\\s\\S]*?<\\/layer>`)
  const encoded = xml.match(pattern)?.[1]
  if (!encoded) throw new Error(`Missing ${name} layer`)
  const buffer = Buffer.from(encoded.replace(/\s/g, ''), 'base64')
  return Array.from({ length: sourceSize * sourceSize }, (_, index) => buffer.readUInt32LE(index * 4))
}

const encodeLayer = values => {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4))
  return buffer.toString('base64').match(/.{1,120}/g).map(line => `   ${line}`).join('\n')
}

const sourceMaps = await Promise.all(quadrants.map(async quadrant => ({
  ...quadrant,
  xml: await readFile(join(tiledRoot, `${quadrant.id}.tmx`), 'utf8'),
})))

const layerNames = ['Ground', 'Terrain', 'Objects']
const mergedLayers = Object.fromEntries(layerNames.map(name => [name, new Array(targetSize * targetSize).fill(0)]))

for (const source of sourceMaps) {
  for (const name of layerNames) {
    const cells = decodeLayer(source.xml, name)
    for (let y = 0; y < sourceSize; y += 1) {
      for (let x = 0; x < sourceSize; x += 1) {
        const targetX = source.offsetX + x
        const targetY = source.offsetY + y
        mergedLayers[name][targetY * targetSize + targetX] = cells[y * sourceSize + x]
      }
    }
  }
}

const layers = layerNames.map((name, index) => ` <layer id="${index + 1}" name="${name}" width="${targetSize}" height="${targetSize}">
  <data encoding="base64">
${encodeLayer(mergedLayers[name])}
  </data>
 </layer>`).join('\n')

const output = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.9" tiledversion="1.9.2" orientation="orthogonal" renderorder="right-down" width="${targetSize}" height="${targetSize}" tilewidth="32" tileheight="32" infinite="0" nextlayerid="5" nextobjectid="2">
 <tileset firstgid="1" source="[Base]BaseChip_pipo.tsx"/>
 <tileset firstgid="1001" source="[A]Water_pipo.tsx"/>
 <tileset firstgid="4073" source="[A]Dirt_pipo.tsx"/>
${layers}
 <objectgroup id="4" name="Positions">
  <object id="1" name="start" class="start" x="800" y="800">
   <point/>
  </object>
 </objectgroup>
</map>
`

await writeFile(join(tiledRoot, 'nature-open-world.tmx'), output)
