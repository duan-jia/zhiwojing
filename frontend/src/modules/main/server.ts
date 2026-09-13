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
        x: 800,
        y: 736,
        event: {
          onInit() {
            this.name = '◆ 热榜广场'
            this.setGraphic('landmark-hot')
          },
        },
      },
      {
        id: 'landmark-user-home',
        x: 672,
        y: 736,
        event: {
          onInit() {
            this.name = '⌂ 知我居'
            this.setGraphic('landmark-home')
          },
        },
      },
      {
        id: 'avatar-su-wan',
        x: 736,
        y: 800,
        event: {
          onInit() {
            this.name = '苏晚'
            this.setGraphic('female')
            this.infiniteMoveRoute([Move.tileLeft(2), Move.tileRight(2)])
          },
        },
      },
      {
        id: 'avatar-zhou-bo',
        x: 864,
        y: 800,
        event: {
          onInit() {
            this.name = '周博'
            this.setGraphic('hero')
          },
        },
      },
    ],
  }],
});
