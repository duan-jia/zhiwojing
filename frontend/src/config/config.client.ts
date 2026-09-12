import { provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { provideMain } from "../modules/main";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { setupDialogueInteractions } from '../dialogue-interactions'
import { setupAgentBubbles } from '../agent-bubbles'
import { setupAutonomyInput } from '../autonomy-input'

let bubbleController: ReturnType<typeof setupAgentBubbles> | null = null
let dialogueController: ReturnType<typeof setupDialogueInteractions> | null = null
let autonomyInputController: ReturnType<typeof setupAutonomyInput> | null = null

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
        agentToggle: ['g'],
      },
    }),
    provideMain(),
    provideClientModules([
      {
        engine: {
          onStart(engine) {
            autonomyInputController?.destroy()
            autonomyInputController = setupAutonomyInput(engine)
            dialogueController = setupDialogueInteractions(engine)
            bubbleController = setupAgentBubbles(engine)
          },
          onStep() {
            dialogueController?.step()
            bubbleController?.step()
          },
        },
        spritesheets: [
          {
            id: 'landmark-home',
            image: 'spritesheets/landmark-home.svg',
            ...Presets.RMSpritesheet(3, 4)
          },
          {
            id: 'landmark-hot',
            image: 'spritesheets/landmark-hot.svg',
            ...Presets.RMSpritesheet(3, 4)
          },
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
