import { provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { provideMain } from "../modules/main";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { setupDialogueInteractions } from '../dialogue-interactions'

let dialogueController: ReturnType<typeof setupDialogueInteractions> | null = null

export default {
  providers: [
    provideTiledMap({
      basePath: "map",
    }),
    provideClientGlobalConfig({
      keyboardControls: {
        up: ['up', 'w'],
        down: ['down', 's'],
        left: ['left', 'a'],
        right: ['right', 'd'],
        action: ['space', 'enter'],
      },
    }),
    provideMain(),
    provideClientModules([
      {
        engine: {
          onStart(engine) {
            dialogueController = setupDialogueInteractions(engine)
          },
          onStep() {
            dialogueController?.step()
          },
        },
        spritesheets: [
          {
            id: 'hero',
            image: 'spritesheets/hero.png',
            ...Presets.RMSpritesheet(3, 4)
          },
          {
            id: 'female',
            image: 'spritesheets/female.png',
             ...Presets.RMSpritesheet(3, 4)
          }
        ]
      }
    ])
  ],
};
