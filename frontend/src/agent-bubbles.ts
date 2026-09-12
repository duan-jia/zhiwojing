import type { RpgClientEngine } from '@rpgjs/client'
import { readSpriteValue } from './dialogue-target'

/** Renders synchronized agentSpeech values for every avatar in the room. */
export function setupAgentBubbles(engine: RpgClientEngine) {
  const root = document.createElement('aside')
  root.id = 'agent-speech-bubbles'
  root.setAttribute('aria-live', 'polite')
  Object.assign(root.style, { position: 'fixed', left: '50%', top: '12px', transform: 'translateX(-50%)', zIndex: '50', pointerEvents: 'none' })
  document.body.append(root)
  const shown = new Map<string, string>()
  return {
    step() {
      const room = engine.getCurrentRoom() as { players?: () => Record<string, Record<string, unknown>> }
      for (const sprite of Object.values(room.players?.() ?? {})) {
        const id = String(readSpriteValue(sprite.id) ?? '')
        const text = String(readSpriteValue(sprite.agentSpeech) ?? '')
        if (!id || shown.get(id) === text) continue
        shown.set(id, text)
        root.querySelector(`[data-avatar="${CSS.escape(id)}"]`)?.remove()
        if (!text) continue
        const bubble = document.createElement('p')
        bubble.dataset.avatar = id
        bubble.textContent = `${String(readSpriteValue(sprite.name) ?? '分身')}：${text}`
        Object.assign(bubble.style, { margin: '6px', padding: '8px 14px', borderRadius: '16px', background: '#fff', color: '#31333a', boxShadow: '0 2px 10px #0004' })
        root.append(bubble)
      }
    },
  }
}
