interface ZoomableViewport {
  children?: unknown[]
  scale?: { set?: (zoom: number) => void }
  setZoom?: (zoom: number, keepCenter?: boolean) => void
}

interface CameraEngine {
  canvasApp?: { stage?: unknown }
  scene?: { viewport?: unknown }
  sceneMap?: { viewport?: unknown }
}

/** Camera zoom is intentionally independent from the 32px player/map grid. */
export const CAMERA_ZOOM = (() => {
  const configured = Number(import.meta.env.VITE_CAMERA_ZOOM ?? 2)
  return Number.isFinite(configured) && configured > 0 ? configured : 2
})()

function findViewport(candidate: unknown): ZoomableViewport | null {
  if (!candidate || typeof candidate !== 'object') return null
  const node = candidate as ZoomableViewport
  if (typeof node.setZoom === 'function') return node
  for (const child of node.children ?? []) {
    const viewport = findViewport(child)
    if (viewport) return viewport
  }
  return null
}

export function applyCameraZoom(engine: CameraEngine, zoom = CAMERA_ZOOM): boolean {
  const viewport = findViewport(engine.sceneMap?.viewport)
    ?? findViewport(engine.scene?.viewport)
    ?? findViewport(engine.canvasApp?.stage)
  if (!viewport) return false
  if (typeof viewport.setZoom === 'function') viewport.setZoom(zoom, true)
  else viewport.scale?.set?.(zoom)
  return true
}

/** The CanvasEngine viewport mounts after the RPGJS onStart hook. */
export function applyCameraZoomWhenReady(engine: CameraEngine, zoom = CAMERA_ZOOM): void {
  let attempts = 0
  const apply = () => {
    if (applyCameraZoom(engine, zoom) || attempts++ >= 60) return
    requestAnimationFrame(apply)
  }
  apply()
}
