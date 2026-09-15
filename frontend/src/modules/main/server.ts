import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { player } from './player.ts'
import { TOWN_BUILDINGS } from '../../town-layout.mjs'
import { pensordWeapon } from './weapons.ts'
import { systemPlayerEvent } from './autonomy.ts'

export default defineModule<RpgServer>({
  player,
  // Session transfers serialize inventory entries by ID. Register starter
  // equipment in every room database so the destination map can hydrate it.
  database: {
    pensord: pensordWeapon,
  },
  map: {
    onLoad(map) {
      // This MVP keeps avatars only while their browser session is online.
      ;(map as any).sessionExpiryTime = 0
    },
  },
  maps: [{
    id: 'nature-open-world',
    events: [
      ...TOWN_BUILDINGS.map(building => ({
        id: `town-building-${building.id}`,
        x: building.centerX * 32,
        y: building.bottomY * 32,
        event: {
          onInit() {
            this.name = building.name
            this.setGraphic(`town-building-${building.id}`)
            // Tiled owns the building base collision, not this visual anchor.
            this.setHitbox(1, 1)
            this.through = true
          },
        },
      })),
      ...TOWN_BUILDINGS.map(building => ({
        id: building.landmarkId,
        x: building.doorX * 32,
        y: building.doorY * 32,
        event: {
          onInit() {
            this.name = `${building.icon} ${building.name}`
            // Invisible interaction anchor at the building door.
            this.setHitbox(1, 1)
            this.through = true
          },
        },
      })),
      // Legacy identity: id: 'avatar-su-wan' and id: 'avatar-zhou-bo'.
      systemPlayerEvent(2, '苏晚', 'female', 864, 768),
      systemPlayerEvent(3, '周博', 'hero', 992, 768),
    ],
  }],
});
