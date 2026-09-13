import { defineModule } from "@rpgjs/common";
import { Move, RpgServer } from "@rpgjs/server";
import { player } from './player.ts'
import { TOWN_BUILDINGS } from '../../town-layout.mjs'

export default defineModule<RpgServer>({
  player,
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
      {
        id: 'avatar-su-wan',
        x: 864,
        y: 768,
        event: {
          onInit() {
            this.name = '苏晚'
            this.setGraphic('female')
            ;(this as any).combatNpc = true
            ;(this as any).battleAi = {
              getFaction: () => 'npcs',
              // Action Battle calls this after a successful event hit. The
              // test NPC is passive, so it records no retaliation or AI turn.
              handleDamage: () => undefined,
            }
            ;(this as any).actionBattleFaction = 'npcs'
            ;(this as any).hp = 100
            this.infiniteMoveRoute([Move.tileLeft(1), Move.tileRight(1)])
          },
        },
      },
      {
        id: 'avatar-zhou-bo',
        x: 992,
        y: 768,
        event: {
          onInit() {
            this.name = '周博'
            this.setGraphic('hero')
            ;(this as any).combatNpc = true
            ;(this as any).battleAi = {
              getFaction: () => 'npcs',
              handleDamage: () => undefined,
            }
            ;(this as any).actionBattleFaction = 'npcs'
            ;(this as any).hp = 100
          },
        },
      },
    ],
  }],
});
