export const PLAYER_MAX_HP = 100
export const PLAYER_ATTACK_DAMAGE = 25
export const RESPAWN_INVINCIBILITY_MS = 3_000
export const AUTONOMOUS_RESPAWN_MS = 30_000
export const DEATH_GRAPHIC_ID = 'death-grave'

export function readSignal<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function isDefeated(player: any): boolean {
  return Boolean(readSignal(player?.defeated ?? false)) || Number(player?.hp ?? 0) <= 0
}

export function applyFixedDamage(target: any, amount = PLAYER_ATTACK_DAMAGE) {
  const previousHp = Math.max(0, Number(target?.hp ?? 0))
  const damage = Math.min(previousHp, Math.max(0, amount))
  target.hp = Math.max(0, previousHp - damage)
  return { damage, defeated: target.hp <= 0 }
}

/** Apply test combat damage. NPCs can be hit, but are kept at 1 HP. */
export function applyCombatDamage(target: any, amount = PLAYER_ATTACK_DAMAGE) {
  const previousHp = Math.max(0, Number(target?.hp ?? 0))
  const damage = Math.min(previousHp, Math.max(0, Math.round(amount)))
  const immortalNpc = Boolean(target?.combatNpc)
  const nextHp = immortalNpc ? Math.max(1, previousHp - damage) : Math.max(0, previousHp - damage)
  target.hp = nextHp
  return { damage, defeated: !immortalNpc && nextHp <= 0 }
}

export function shouldAutoRespawn(player: any): boolean {
  return Boolean(readSignal(player?.agentMode ?? false))
}

export function showCombatDeath(player: any): void {
  player.animationName?.set?.('stand')
  player.animationFixed = true
  player.setGraphic?.(DEATH_GRAPHIC_ID)
}

export function canTargetCombatPlayer(attacker: any, target: any): boolean {
  const targetIsEvent = typeof target?.isEvent === 'function' && target.isEvent()
  const targetIsNpc = targetIsEvent && Boolean(target?.combatNpc)
  return Boolean(attacker) && Boolean(target) && attacker !== target && (!targetIsEvent || targetIsNpc) && !isDefeated(attacker) && !isDefeated(target)
}

export function restoreCombatPlayer(player: any): void {
  player.hp = PLAYER_MAX_HP
  const defeated = player.defeated
  if (defeated && typeof defeated.set === 'function') defeated.set(false)
  else player.defeated = false
  player.setGraphic?.(player.aliveGraphic || 'liukanshan')
  player.animationName?.set?.('stand')
  player.animationFixed = false
  player.canMove = true
}
