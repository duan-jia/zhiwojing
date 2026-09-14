const PLAYER_MAX_HP = 100

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
