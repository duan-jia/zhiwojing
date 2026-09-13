import { defineModule } from "@rpgjs/common";
import { Move, RpgServer } from "@rpgjs/server";
import { player } from './player.ts'

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
      {
        id: 'landmark-hot-square',
        x: 928,
        y: 704,
        event: {
          onInit() {
            this.name = '◆ 热榜广场'
            this.setGraphic('landmark-hot')
          },
        },
      },
      {
        id: 'landmark-user-home',
        x: 448,
        y: 480,
        event: {
          onInit() {
            this.name = '⌂ 知我居'
            this.setGraphic('landmark-home')
          },
        },
      },
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
