import type { RpgPlayer } from '@rpgjs/server'
import { setActionBattleInvincibility } from '@rpgjs/action-battle/server'
import { AUTONOMOUS_RESPAWN_MS, PLAYER_ATTACK_DAMAGE, PLAYER_MAX_HP, RESPAWN_INVINCIBILITY_MS, applyCombatDamage, canTargetCombatPlayer, isDefeated, restoreCombatPlayer, shouldAutoRespawn } from '../../combat-state'
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
  // Include map events in the broad candidate query; canTargetCombatPlayer
  // still restricts actual hits to explicitly marked combat NPCs.
  ;(player as any).actionBattleTargets = 'all'
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
    player: {
      combo: {
        enabled: true,
        bufferMs: 140,
        resetMs: 700,
        steps: [
          { id: 'combo-1', startupMs: 55, activeMs: 90, recoveryMs: 120, damageMultiplier: .85, knockbackMultiplier: .7 },
          { id: 'combo-2', startupMs: 45, activeMs: 95, recoveryMs: 130, damageMultiplier: 1, knockbackMultiplier: .85 },
          { id: 'combo-3', startupMs: 90, activeMs: 120, recoveryMs: 240, damageMultiplier: 1.35, knockbackMultiplier: 1.4 },
        ],
      },
      dodge: { enabled: true, durationMs: 180, invincibilityMs: 220, cooldownMs: 650, additionalSpeed: 8 },
      guard: {
        enabled: true, control: 'f', parryWindowMs: 140, guardArcDegrees: 120,
        guardDamageReduction: .65, guardKnockbackReduction: .6, staggerMs: 650,
        counterWindowMs: 700, counterDamageMultiplier: 1.5, counterStaggerMultiplier: 1.5,
      },
      chargedAttack: {
        enabled: true, control: 'k', minChargeMs: 300, maxChargeMs: 900,
        minDamageMultiplier: 1.5, maxDamageMultiplier: 2.4,
        minKnockbackMultiplier: 1.6, maxKnockbackMultiplier: 2.3,
        profile: { id: 'charged', startupMs: 100, activeMs: 140, recoveryMs: 380 },
      },
      softTargeting: {
        enabled: true, range: 112, coneDegrees: 110, directionWeight: .48,
        distanceWeight: .32, threatWeight: .2, indicatorDurationMs: 220,
      },
    },
    targets: {
      canTarget: ({ attacker, target }: any) => canTargetCombatPlayer(attacker, target),
    },
    damage: ({ target, multiplier }: any) => applyCombatDamage(
      target,
      PLAYER_ATTACK_DAMAGE * (Number.isFinite(multiplier) ? multiplier : 1),
    ),
    hooks: {
      afterHit: (result: any) => { if (result.defeated) defeatPlayer(result.target) },
    },
  },
  attack: {
    lockMovement: true,
    profile: {
      damageMultiplier: 1,
      control: {
        movementLock: 'active' as const,
        directionLock: 'active' as const,
        moveCancelsRecovery: true,
        dodgeCancelsRecovery: true,
        inputBufferMs: 160,
      },
      reaction: { invincibilityMs: 400, hitstunMs: 150, staggerPower: 1 },
    },
  },
  ai: { director: false as const },
  skills: { defaultAoeMask: ['#'] },
  targeting: { affects: 'both' as const, allowEmptyTarget: true },
  ui: { hotbar: { enabled: false, autoOpen: false }, actionBar: { enabled: false }, targeting: { enabled: false } },
  visual: 'impact' as const,
  feedback: {
    hitStop: true, hitStopMs: 32, heavyHitStopMs: 52, parryHitStopMs: 68,
    flashes: true, screenShake: true, damageNumbers: true,
  },
}
