import { provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { provideMain } from "../modules/main";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { setupDialogueInteractions } from '../dialogue-interactions'
import { setupAgentBubbles } from '../agent-bubbles'
import { setupAutonomyInput } from '../autonomy-input'
import { setupAutonomyStatus } from '../autonomy-status'
import { recordE2eSync, recordSyncDiagnostic, setupE2eTelemetry } from '../e2e-telemetry'
import { provideActionBattle } from '@rpgjs/action-battle/client'
import { actionBattleOptions } from '../modules/main/combat'
import { setupCombatInput } from '../combat-input'
import { setupCombatHud } from '../combat-hud'
import { setupMenuInput } from '../menu-input'
import { RemotePlayerHealth } from '../remote-player-health'
import { withCombatAnimationAliases } from '../combat-animation-logic'

let bubbleController: ReturnType<typeof setupAgentBubbles> | null = null
let dialogueController: ReturnType<typeof setupDialogueInteractions> | null = null
let autonomyInputController: ReturnType<typeof setupAutonomyInput> | null = null
let autonomyStatusController: ReturnType<typeof setupAutonomyStatus> | null = null
let combatInputController: ReturnType<typeof setupCombatInput> | null = null
let combatHudController: ReturnType<typeof setupCombatHud> | null = null
let menuInputController: ReturnType<typeof setupMenuInput> | null = null

export default {
  providers: [
    provideTiledMap({
      basePath: "map",
    }),
    provideActionBattle(actionBattleOptions),
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
          onConnected() {
            autonomyStatusController?.setConnected(true)
          },
          onDisconnected() {
            autonomyStatusController?.setConnected(false)
          },
          onConnectError() {
            autonomyStatusController?.setConnected(false)
          },
          onStart(engine) {
            engine.addSpriteComponentInFront(RemotePlayerHealth)
            menuInputController?.destroy()
            menuInputController = setupMenuInput(engine)
            autonomyInputController?.destroy()
            autonomyInputController = setupAutonomyInput(engine)
            combatInputController?.destroy()
            combatInputController = setupCombatInput(engine)
            combatHudController?.destroy()
            combatHudController = setupCombatHud(engine)
            autonomyStatusController = setupAutonomyStatus(engine)
            setupE2eTelemetry(engine)
            dialogueController = setupDialogueInteractions(engine)
            bubbleController = setupAgentBubbles(engine)
          },
          onStep() {
            dialogueController?.step()
            bubbleController?.step()
            autonomyStatusController?.step()
            combatHudController?.step()
          },
        },
        sceneMap: {
          onChanges(scene, { partial }) {
            recordE2eSync(partial)
            recordSyncDiagnostic(scene, partial)
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
            ...withCombatAnimationAliases(Presets.RMSpritesheet(3, 4))
          },
          {
            id: 'female',
            image: 'spritesheets/female.png',
             ...withCombatAnimationAliases(Presets.RMSpritesheet(3, 4))
          }
        ]
      }
    ])
  ],
};
