import type { RpgClientEngine } from '@rpgjs/client'

import {
  closeAvatarChat,
  configureChatLifecycle,
  getActiveChatAvatarId,
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
import {
  closeLandmarkPanel,
  configureLandmarkLifecycle,
  isLandmarkPanelOpen,
  openLandmarkPanel,
} from './landmark-panel'
import {
  LANDMARK_RANGE,
  findNearestLandmark,
  landmarkTargetForSprite,
  type LandmarkTarget,
} from './landmark-target'

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

function nearestLandmark(engine: RpgClientEngine): LandmarkTarget | null {
  return findNearestLandmark(engine.getCurrentPlayer(), roomObjects(engine), LANDMARK_RANGE)
}

function distanceFromPlayer(engine: RpgClientEngine, target: { x: number; y: number }): number {
  const player = engine.getCurrentPlayer() as { x?: number | (() => number); y?: number | (() => number) }
  const read = (value: number | (() => number) | undefined) => Number(typeof value === 'function' ? value() : value) || 0
  return Math.hypot(read(player?.x) - target.x, read(player?.y) - target.y)
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
  let currentLandmark: LandmarkTarget | null = null
  let chatTargetObjectId: string | null = null
  let pausedAvatarId: number | null = null
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
    if (isChatOpen() || isLandmarkPanelOpen() || (!currentTarget && !currentLandmark)) {
      hud.hidden = true
      return
    }
    if (currentLandmark && (!currentTarget || distanceFromPlayer(engine, currentLandmark) <= distanceFromPlayer(engine, currentTarget))) {
      showHud(`按 E 探索 ${currentLandmark.name}`)
    } else if (currentTarget) {
      showHud(`按 E 与 ${currentTarget.displayName} 的分身对话`)
    }
  }

  const scan = () => {
    currentTarget = nearestTarget(engine)
    currentLandmark = nearestLandmark(engine)
    updateHud()
  }

  const openTarget = (target: DialogueTarget | null, missingMessage: string) => {
    if (!target) {
      showHud(missingMessage, true)
      return
    }
    currentTarget = target
    chatTargetObjectId = target.objectId
    openAvatarChat(target.avatarId)
  }

  configureChatLifecycle({
    onOpen: () => {
      clearToast()
      if (isLandmarkPanelOpen()) closeLandmarkPanel()
      engine.interruptCurrentPlayerMovement()
      const target = currentTarget
      if (target?.kind === 'player' && target.objectId === chatTargetObjectId && target.avatarId === getActiveChatAvatarId()) {
        pausedAvatarId = target.avatarId
        engine.processAction({ action: 'dialogueOpen', avatar_id: target.avatarId } as any)
      }
      engine.stopProcessingInput = true
      updateHud()
    },
    onClose: () => {
      engine.stopProcessingInput = false
      if (pausedAvatarId !== null) {
        engine.processAction({ action: 'dialogueClose', avatar_id: pausedAvatarId } as any)
        pausedAvatarId = null
      }
      chatTargetObjectId = null
      scan()
    },
  })

  configureLandmarkLifecycle({
    onOpen: () => {
      clearToast()
      if (isChatOpen()) closeAvatarChat()
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
    ({ sprite }: { sprite: unknown }) => landmarkTargetForSprite(sprite) !== null,
    {
      cursor: ({ sprite }: { sprite: unknown }) => findNearestLandmark(engine.getCurrentPlayer(), [sprite]) ? 'pointer' : undefined,
      click: ({ sprite }: { sprite: unknown }) => {
        const landmark = findNearestLandmark(engine.getCurrentPlayer(), [sprite])
        if (landmark) openLandmarkPanel(landmark)
        else showHud('请靠近到两格内再探索', true)
      },
    },
  )

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
      chatTargetObjectId = null
      toggleSelfAvatarChat()
      return
    }
    if (key === 'e') {
      event.preventDefault()
      currentTarget = nearestTarget(engine)
      currentLandmark = nearestLandmark(engine)
      if (currentLandmark && (!currentTarget || distanceFromPlayer(engine, currentLandmark) <= distanceFromPlayer(engine, currentTarget))) {
        openLandmarkPanel(currentLandmark)
      } else {
        openTarget(currentTarget, '附近没有可互动的人或地标')
      }
      return
    }
    if (event.key === 'Escape' && (isChatOpen() || isLandmarkPanelOpen())) {
      event.preventDefault()
      if (isChatOpen()) closeAvatarChat()
      if (isLandmarkPanelOpen()) closeLandmarkPanel()
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
