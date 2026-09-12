import type { RpgClientEngine } from '@rpgjs/client'

import {
  closeAvatarChat,
  configureChatLifecycle,
  isChatOpen,
  openAvatarChat,
  toggleSelfAvatarChat,
} from './chat'
import {
  DIALOGUE_RANGE,
  avatarIdForSprite,
  dialogueTargetForSprite,
  findNearestDialogueTarget,
  type DialogueTarget,
} from './dialogue-target'

interface DialogueController {
  step: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
}

function roomObjects(engine: RpgClientEngine): unknown[] {
  const room = engine.getCurrentRoom() as {
    players?: () => Record<string, unknown>
    events?: () => Record<string, unknown>
  }
  return [
    ...Object.values(room.players?.() ?? {}),
    ...Object.values(room.events?.() ?? {}),
  ]
}

function nearestTarget(engine: RpgClientEngine): DialogueTarget | null {
  return findNearestDialogueTarget(
    engine.getCurrentPlayer(),
    roomObjects(engine),
    DIALOGUE_RANGE,
  )
}

function targetIsNearby(engine: RpgClientEngine, sprite: unknown): DialogueTarget | null {
  const target = dialogueTargetForSprite(sprite)
  if (!target) return null
  return findNearestDialogueTarget(
    engine.getCurrentPlayer(),
    [target.sprite],
    DIALOGUE_RANGE,
  )
}

export function setupDialogueInteractions(engine: RpgClientEngine): DialogueController {
  const hud = document.querySelector<HTMLElement>('#interaction-hud')
  let currentTarget: DialogueTarget | null = null
  let lastScanAt = 0
  let toastTimer: ReturnType<typeof window.setTimeout> | null = null

  const clearToast = () => {
    if (toastTimer !== null) window.clearTimeout(toastTimer)
    toastTimer = null
  }

  const showHud = (message: string, temporary = false) => {
    if (!hud) return
    hud.textContent = message
    hud.hidden = false
    hud.classList.toggle('interaction-hud--status', temporary)
    clearToast()
    toastTimer = temporary ? window.setTimeout(() => {
      toastTimer = null
      updateHud()
    }, 2000) : null
  }

  const updateHud = () => {
    if (!hud) return
    if (toastTimer !== null) return
    hud.classList.remove('interaction-hud--status')
    if (isChatOpen() || !currentTarget) {
      hud.hidden = true
      return
    }
    showHud(`按 E 与 ${currentTarget.displayName} 的分身对话`)
  }

  const scan = () => {
    currentTarget = nearestTarget(engine)
    updateHud()
  }

  const openTarget = (target: DialogueTarget | null, missingMessage: string) => {
    if (!target) {
      showHud(missingMessage, true)
      return
    }
    openAvatarChat(target.avatarId)
  }

  configureChatLifecycle({
    onOpen: () => {
      clearToast()
      engine.interruptCurrentPlayerMovement()
      engine.stopProcessingInput = true
      updateHud()
    },
    onClose: () => {
      engine.stopProcessingInput = false
      scan()
    },
  })

  engine.interactions.use(
    ({ sprite }: { sprite: unknown }) => {
      const currentId = String(engine.getCurrentPlayer()?.id ?? '')
      const target = dialogueTargetForSprite(sprite)
      return target !== null && target.objectId !== currentId
    },
    {
      cursor: ({ sprite }: { sprite: unknown }) => targetIsNearby(engine, sprite) ? 'pointer' : undefined,
      click: ({ sprite }: { sprite: unknown }) => {
        openTarget(targetIsNearby(engine, sprite), '请靠近到两格内再对话')
      },
    },
  )

  document.addEventListener('keydown', event => {
    if (isEditableTarget(event.target)) return
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      toggleSelfAvatarChat()
      return
    }
    if (key === 'e') {
      event.preventDefault()
      currentTarget = nearestTarget(engine)
      openTarget(currentTarget, '附近没有可对话的人')
      return
    }
    if (event.key === 'Escape' && isChatOpen()) {
      event.preventDefault()
      closeAvatarChat()
    }
  })

  scan()
  return {
    step: () => {
      const now = performance.now()
      if (now - lastScanAt < 100) return
      lastScanAt = now
      scan()
    },
  }
}

export { avatarIdForSprite }
