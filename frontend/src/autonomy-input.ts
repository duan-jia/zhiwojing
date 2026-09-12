import { keyboardEventMatchesBind } from '@rpgjs/client'
import { processAutonomyKey } from './autonomy-input-logic'

type ClientEngine = {
  globalConfig?: { keyboardControls?: Record<string, unknown> }
  sceneMap?: { getCurrentPlayer?: () => any }
  processAction(action: { action: string }): void
}

export function setupAutonomyInput(engine: ClientEngine) {
  const onKeyDown = (event: KeyboardEvent) => {
    processAutonomyKey(engine, event, keyboardEventMatchesBind)
  }
  window.addEventListener('keydown', onKeyDown, true)
  return { destroy: () => window.removeEventListener('keydown', onKeyDown, true) }
}
