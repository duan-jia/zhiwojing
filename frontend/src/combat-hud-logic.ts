const PLAYER_MAX_HP = 100

/** Send revive even while the dead player's movement lock is active. */
export function requestRevive(engine: any): void {
  const socket = engine?.socket
  if (socket && typeof socket.emit === 'function') {
    socket.emit('action', { action: 'revive' })
    return
  }
  engine?.processAction?.('revive')
}

export function normalizeHp(hp: unknown, maxHp = PLAYER_MAX_HP) {
  const normalizedMax = Math.max(1, Number(maxHp) || PLAYER_MAX_HP)
  const current = Math.min(normalizedMax, Math.max(0, Number(hp) || 0))
  return { current, max: normalizedMax, percent: Math.round(current / normalizedMax * 100) }
}

export function remotePlayerHealthView(hp: unknown, defeated: unknown, maxHp = PLAYER_MAX_HP) {
  const normalized = normalizeHp(hp, maxHp)
  const isDown = Boolean(defeated) || normalized.current === 0
  return {
    ...normalized,
    isDown,
  }
}
