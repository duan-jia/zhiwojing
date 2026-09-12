export type LandmarkKind = 'hot-square' | 'user-home'

export interface LandmarkDefinition {
  id: string
  name: string
  x: number
  y: number
  kind: LandmarkKind
}

/** World landmarks are data-driven so future places can share interaction/UI code. */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  { id: 'landmark-hot-square', name: '热榜广场', x: 800, y: 736, kind: 'hot-square' },
  { id: 'landmark-user-home', name: '知我居', x: 672, y: 736, kind: 'user-home' },
]

export function landmarkForId(id: string): LandmarkDefinition | null {
  return LANDMARKS.find(landmark => landmark.id === id) ?? null
}
