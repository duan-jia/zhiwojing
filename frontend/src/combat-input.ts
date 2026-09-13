import { processCombatKey } from './combat-input-logic'

type ClientEngine = { processAction(action: string, data?: unknown): void }

export function setupCombatInput(engine: ClientEngine) {
  const onKeyDown = (event: KeyboardEvent) => processCombatKey(engine, event)
  window.addEventListener('keydown', onKeyDown, true)
  return { destroy: () => window.removeEventListener('keydown', onKeyDown, true) }
}
