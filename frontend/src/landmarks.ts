export type LandmarkKind = 'hot-square' | 'user-home' | 'book' | 'wendao' | 'write' | 'tiangong'

export interface LandmarkDefinition {
  id: string
  name: string
  x: number
  y: number
  kind: LandmarkKind
  buildingId: string
  icon: string
}

/** World landmarks are data-driven so future places can share interaction/UI code. */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  { id: 'landmark-hot-square', name: '知乎热榜', x: 928, y: 608, kind: 'hot-square', buildingId: 'hot', icon: '榜' },
  { id: 'landmark-user-home', name: '知我居', x: 448, y: 544, kind: 'user-home', buildingId: 'home', icon: '居' },
  { id: 'landmark-book', name: '藏书阁', x: 1504, y: 576, kind: 'book', buildingId: 'book', icon: '书' },
  { id: 'landmark-wendao', name: '问道馆', x: 448, y: 1152, kind: 'wendao', buildingId: 'wendao', icon: '问' },
  { id: 'landmark-write', name: '创作坊', x: 1472, y: 1152, kind: 'write', buildingId: 'write', icon: '创' },
  { id: 'landmark-tiangong', name: '天工坊', x: 992, y: 1280, kind: 'tiangong', buildingId: 'tiangong', icon: '工' },
]

export function landmarkForId(id: string): LandmarkDefinition | null {
  return LANDMARKS.find(landmark => landmark.id === id) ?? null
}
