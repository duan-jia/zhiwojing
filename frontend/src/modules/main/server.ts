import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { player } from './player'

export default defineModule<RpgServer>({
  player,
  maps: [{
    id: 'nature-open-world',
    events: [
      {
        id: 'avatar-su-wan',
        x: 736,
        y: 800,
        event: {
          onInit() {
            this.name = '苏晚'
            this.setGraphic('female')
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
