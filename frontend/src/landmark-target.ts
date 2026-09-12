import { readSpriteValue } from './dialogue-target'
import { landmarkForId, type LandmarkDefinition } from './landmarks'

export const LANDMARK_RANGE = 64

export interface LandmarkTarget extends LandmarkDefinition {
  sprite: Record<string, unknown>
}

function readString(sprite: Record<string, unknown>, key: string): string {
  const value = readSpriteValue(sprite[key])
  return value === undefined || value === null ? '' : String(value)
}

function readNumber(sprite: Record<string, unknown>, key: string): number {
  const value = Number(readSpriteValue(sprite[key]))
  return Number.isFinite(value) ? value : 0
}

function location(sprite: unknown): { id: string; x: number; y: number } | null {
  if (!sprite || typeof sprite !== 'object') return null
  const value = sprite as Record<string, unknown>
  const id = readString(value, 'id') || readString(value, 'uuid')
  return id ? { id, x: readNumber(value, 'x'), y: readNumber(value, 'y') } : null
}

export function landmarkTargetForSprite(sprite: unknown): LandmarkTarget | null {
  const position = location(sprite)
  if (!position) return null
  const landmark = landmarkForId(position.id)
  return landmark ? { ...landmark, x: position.x, y: position.y, sprite: sprite as Record<string, unknown> } : null
}

export function findNearestLandmark(
  currentSprite: unknown,
  candidates: readonly unknown[],
  maxDistance = LANDMARK_RANGE,
): LandmarkTarget | null {
  const current = location(currentSprite)
  if (!current) return null
  return candidates
    .map(landmarkTargetForSprite)
    .filter((candidate): candidate is LandmarkTarget => candidate !== null
      && Math.hypot(current.x - candidate.x, current.y - candidate.y) <= maxDistance)
    .sort((left, right) => (
      Math.hypot(current.x - left.x, current.y - left.y)
      - Math.hypot(current.x - right.x, current.y - right.y)
      || left.id.localeCompare(right.id)
    ))[0] ?? null
}
