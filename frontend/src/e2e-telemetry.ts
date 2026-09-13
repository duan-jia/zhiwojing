function read(value: any) {
  return typeof value === 'function' ? value() : value
}

let lastPartial: any = null
let lastSyncDiagnostic: any = null

export function recordE2eSync(partial: any) {
  if (import.meta.env.VITE_E2E) lastPartial = partial
}

export function recordSyncDiagnostic(scene: any, partial: any) {
  if (!import.meta.env.VITE_E2E) return
  const read = (value: any) => typeof value === 'function' ? value() : value
  const player = scene?.getCurrentPlayer?.()
  const id = String(read(player?.id) ?? '')
  const patch = id ? partial?.players?.[id] : undefined
  lastSyncDiagnostic = {
    id,
    playerKeys: Object.keys(partial?.players ?? {}),
    patchKeys: patch && typeof patch === 'object' ? Object.keys(patch) : [],
    position: patch && { x: patch.x, y: patch.y },
    frames: Array.isArray(patch?._frames) ? patch._frames.length : 0,
  }
  ;(window as any).__ZHIWOJING_SYNC_DIAGNOSTIC__ = lastSyncDiagnostic
}

export function setupE2eTelemetry(engine: any) {
  if (!import.meta.env.VITE_E2E) return
  const ranges = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>()
  const sample = () => {
    const players = read(engine.sceneMap?.players) ?? {}
    for (const [id, player] of Object.entries(players) as Array<[string, any]>) {
      const x = Number(read(player?.x))
      const y = Number(read(player?.y))
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const range = ranges.get(id) ?? { minX: x, maxX: x, minY: y, maxY: y }
      range.minX = Math.min(range.minX, x)
      range.maxX = Math.max(range.maxX, x)
      range.minY = Math.min(range.minY, y)
      range.maxY = Math.max(range.maxY, y)
      ranges.set(id, range)
    }
  }
  window.setInterval(sample, 50)
  ;(window as any).__ZHIWOJING_E2E__ = {
    snapshot() {
      sample()
      const scene = engine.sceneMap
      const current = scene?.getCurrentPlayer?.()
      const players = read(scene?.players) ?? {}
      return {
        currentId: String(read(current?.id) ?? ''),
        lastPartial,
        lastSyncDiagnostic,
        events: Object.fromEntries(Object.entries(read(scene?.events) ?? {}).map(([id, event]: [string, any]) => [id, {
          name: String(read(event?.name) ?? ''),
          x: Number(read(event?.x)), y: Number(read(event?.y)),
        }])),
        movement: Object.fromEntries([...ranges].map(([id, range]) => [id, {
          ...range,
          distance: Math.hypot(range.maxX - range.minX, range.maxY - range.minY),
        }])),
        players: Object.fromEntries(Object.entries(players).map(([id, player]: [string, any]) => [id, {
          x: Number(read(player?.x)),
          y: Number(read(player?.y)),
          agentMode: Boolean(read(player?.agentMode)),
          agentState: String(read(player?.agentState) ?? ''),
          isConnected: Boolean(read(player?.isConnected)),
          hp: Number(read(player?.hpSignal ?? player?.hp)),
          defeated: Boolean(read(player?.defeated)),
          animationName: String(read(player?.animationName) ?? ''),
        }])),
      }
    },
  }
}
