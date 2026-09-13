import { Presets } from '@rpgjs/client'
import { TOWN_BUILDINGS } from './town-layout.mjs'
import images from './town-building-images.json'

export const townBuildingSprites = TOWN_BUILDINGS.map(building => {
  const source = images[building.image as keyof typeof images]
  const [left, top, right, bottom] = source.bounds
  return {
    id: `town-building-${building.id}`,
    image: `spritesheets/${building.image}`,
    ...Presets.RMSpritesheet(1, 1),
    // Align the visible base, not the padded source canvas, with the event.
    displayScale: building.height / (bottom - top),
    anchor: [(left + right) / 2 / source.width, bottom / source.height],
  }
})
