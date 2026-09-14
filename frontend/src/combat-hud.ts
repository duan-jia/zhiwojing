import { normalizeHp, requestRevive } from './combat-hud-logic'

function signalValue(value: any) { return typeof value === 'function' ? value() : value }

export function setupCombatHud(engine: any) {
  const root = document.createElement('section')
  root.className = 'combat-hud'
  root.innerHTML = '<div class="combat-hud__track"><i></i></div><button type="button">复活</button>'
  document.body.appendChild(root)
  const fill = root.querySelector('i') as HTMLElement
  const button = root.querySelector('button') as HTMLButtonElement
  button.addEventListener('click', () => requestRevive(engine))

  return {
    step() {
      const player = engine.sceneMap?.getCurrentPlayer?.()
      if (!player) return
      const hp = normalizeHp(signalValue(player.hpSignal ?? player.hp), 100)
      fill.style.width = `${hp.percent}%`
      const defeated = Boolean(signalValue(player.defeated))
      root.classList.toggle('combat-hud--defeated', defeated)
      button.hidden = !defeated || Boolean(signalValue(player.agentMode))
    },
    destroy() { root.remove() },
  }
}
