import { createServer,  provideServerModules, LocalStorageSaveStorageStrategy } from "@rpgjs/server";
import { provideMain } from "./modules/main/index.ts";
import { provideSaveStorage } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { provideActionBattle } from '@rpgjs/action-battle/server'
import { actionBattleOptions } from './modules/main/combat'

export default createServer({
    providers: [
      provideMain(),
      provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "save" })),
      provideServerModules([]),
      provideTiledMap(),
      provideActionBattle(actionBattleOptions)
    ]
  });
