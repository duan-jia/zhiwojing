import type { AvatarId } from './identity'

export const DIALOGUE_RANGE = 64

export interface DialogueTarget {
  objectId: string
  avatarId: AvatarId
  displayName: string
  kind: 'player' | 'resident'
  x: number
  y: number
  sprite: Record<string, unknown>
}

interface SpriteLocation {
  objectId: string
  x: number
  y: number
}

export function readSpriteValue(value: unknown): unknown {
  return typeof value === 'function' ? (value as () => unknown)() : value
}

function readString(sprite: Record<string, unknown>, key: string): string {
  const value = readSpriteValue(sprite[key])
  return value === undefined || value === null ? '' : String(value)
}

function readNumber(sprite: Record<string, unknown>, key: string): number {
  const value = Number(readSpriteValue(sprite[key]))
  return Number.isFinite(value) ? value : 0
}

function spriteLocation(sprite: unknown): SpriteLocation | null {
  if (!sprite || typeof sprite !== 'object') return null
  const target = sprite as Record<string, unknown>
  const objectId = readString(target, 'id') || readString(target, 'uuid')
  if (!objectId) return null
  return {
    objectId,
    x: readNumber(target, 'x'),
    y: readNumber(target, 'y'),
  }
}

export function avatarIdForSprite(sprite: unknown): AvatarId | null {
  if (!sprite || typeof sprite !== 'object') return null
  const target = sprite as Record<string, unknown>
  const synchronizedId = Number(readSpriteValue(target.avatarId))
  if (synchronizedId === 1 || synchronizedId === 2 || synchronizedId === 3) {
    return synchronizedId
  }

  const id = readString(target, 'id')
  const name = readString(target, 'name')
  if (id === 'avatar-su-wan' || name === '苏晚') return 2
  if (id === 'avatar-zhou-bo' || name === '周博') return 3
  return null
}

export function dialogueTargetForSprite(sprite: unknown): DialogueTarget | null {
  if (!sprite || typeof sprite !== 'object') return null
  const target = sprite as Record<string, unknown>
  const avatarId = avatarIdForSprite(target)
  if (avatarId === null) return null

  const location = spriteLocation(target)
  if (!location) return null
  const type = readString(target, '_type') || readString(target, 'type')
  const systemPlayer = Boolean(readSpriteValue(target.systemPlayer))
  return {
    objectId: location.objectId,
    avatarId,
    displayName: readString(target, 'name') || `分身 ${avatarId}`,
    kind: type === 'player' || systemPlayer || avatarId === 2 || avatarId === 3 ? 'player' : 'resident',
    x: location.x,
    y: location.y,
    sprite: target,
  }
}

export function distanceBetween(
  left: Pick<DialogueTarget, 'x' | 'y'>,
  right: Pick<DialogueTarget, 'x' | 'y'>,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

export function findNearestDialogueTarget(
  currentSprite: unknown,
  candidates: readonly unknown[],
  maxDistance = DIALOGUE_RANGE,
): DialogueTarget | null {
  const current = spriteLocation(currentSprite)
  if (!current) return null

  return candidates
    .map(dialogueTargetForSprite)
    .filter((candidate): candidate is DialogueTarget => (
      candidate !== null
      && candidate.objectId !== current.objectId
      && distanceBetween(current, candidate) <= maxDistance
    ))
    .sort((left, right) => (
      distanceBetween(current, left) - distanceBetween(current, right)
      || left.objectId.localeCompare(right.objectId)
    ))[0] ?? null
}
