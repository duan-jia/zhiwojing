import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { player } from './player'

export default defineModule<RpgServer>({
  player,
  maps: [{ id: 'nature-open-world' }],
});
