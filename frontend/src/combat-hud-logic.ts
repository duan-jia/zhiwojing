const PLAYER_MAX_HP = 100

export function normalizeHp(hp: unknown, maxHp = PLAYER_MAX_HP) {
  const normalizedMax = Math.max(1, Number(maxHp) || PLAYER_MAX_HP)
  const current = Math.min(normalizedMax, Math.max(0, Number(hp) || 0))
  return { current, max: normalizedMax, percent: Math.round(current / normalizedMax * 100) }
}

export type HealthTone = 'healthy' | 'low' | 'critical' | 'defeated'

export function healthTone(percent: number, defeated = false): HealthTone {
  if (defeated || percent <= 0) return 'defeated'
  if (percent <= 15) return 'critical'
  if (percent <= 30) return 'low'
  return 'healthy'
}

export function interpolateHealth(previous: number, target: number, factor = .28) {
  if (target >= previous) return target
  const next = previous + (target - previous) * factor
  return Math.abs(next - target) < .5 ? target : next
}

export function remotePlayerHealthView(hp: unknown, defeated: unknown, maxHp = PLAYER_MAX_HP) {
  const normalized = normalizeHp(hp, maxHp)
  const isDown = Boolean(defeated) || normalized.current === 0
  return {
    ...normalized,
    isDown,
    tone: healthTone(normalized.percent, isDown),
    label: isDown ? `倒地 · ${normalized.current}/${normalized.max}` : `${normalized.current}/${normalized.max}`,
  }
}
