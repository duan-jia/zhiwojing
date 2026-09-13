import type { RpgPlayer } from '@rpgjs/server'
import { setActionBattleInvincibility } from '@rpgjs/action-battle/server'
import { AUTONOMOUS_RESPAWN_MS, PLAYER_ATTACK_DAMAGE, PLAYER_MAX_HP, RESPAWN_INVINCIBILITY_MS, applyFixedDamage, canTargetCombatPlayer, isDefeated, restoreCombatPlayer, shouldAutoRespawn } from '../../combat-state'
import { pauseAgent, resumeAgent } from './autonomy'
import { combatAnimations } from '../../combat-animation-logic'

const respawnTimers = new Map<string, ReturnType<typeof setTimeout>>()

function setProp(player: any, key: string, value: boolean) {
  const prop = player[key]
  if (prop && typeof prop.set === 'function') prop.set(value)
  else player[key] = value
}

export function initializeCombatPlayer(player: RpgPlayer) {
  player.setParameter('maxHp', PLAYER_MAX_HP)
  player.hp = PLAYER_MAX_HP
  ;(player as any).actionBattleTargets = 'players'
  setProp(player, 'defeated', false)
}

export function defeatPlayer(player: RpgPlayer) {
  const runtime = player as any
  if (runtime.defeated && typeof runtime.defeated === 'function' && runtime.defeated()) return
  runtime.hp = 0
  setProp(runtime, 'defeated', true)
  runtime.canMove = false
  runtime.stopMoveTo?.()
  runtime.pendingInputs = []
  pauseAgent(runtime)
  if (shouldAutoRespawn(runtime)) {
    clearRespawnTimer(runtime)
    respawnTimers.set(String(runtime.id), setTimeout(() => revivePlayer(runtime), AUTONOMOUS_RESPAWN_MS))
  }
}

export function revivePlayer(player: RpgPlayer): boolean {
  const runtime = player as any
  if (!isDefeated(runtime)) return false
  clearRespawnTimer(runtime)
  restoreCombatPlayer(runtime)
  setActionBattleInvincibility(runtime, RESPAWN_INVINCIBILITY_MS)
  resumeAgent(runtime)
  return true
}

export function clearRespawnTimer(player: RpgPlayer) {
  const id = String(player.id)
  const timer = respawnTimers.get(id)
  if (timer) clearTimeout(timer)
  respawnTimers.delete(id)
}

export const actionBattleOptions = {
  preset: 'classic' as const,
  animations: combatAnimations,
  combat: {
    player: { combo: false, chargedAttack: false, dodge: false, guard: false, softTargeting: false },
    targets: {
      canTarget: ({ attacker, target }: any) => canTargetCombatPlayer(attacker, target),
    },
    damage: ({ target }: any) => applyFixedDamage(target, PLAYER_ATTACK_DAMAGE),
    hooks: {
      afterHit: (result: any) => { if (result.defeated) defeatPlayer(result.target) },
    },
  },
  attack: {
    profile: { damageMultiplier: 1, reaction: { invincibilityMs: 400, hitstunMs: 150, staggerPower: 1 } },
  },
  ai: { director: false as const },
  skills: { defaultAoeMask: ['#'] },
  targeting: { affects: 'players' as const, allowEmptyTarget: true },
  ui: { hotbar: { enabled: false, autoOpen: false }, actionBar: { enabled: false }, targeting: { enabled: false } },
  feedback: { hitStop: true, flashes: true, screenShake: true, damageNumbers: true },
}
