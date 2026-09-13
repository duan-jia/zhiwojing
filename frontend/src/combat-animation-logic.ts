export const COMBAT_ANIMATION_KEYS = ['attack', 'hurt', 'stagger', 'die', 'castSkill', 'castSpell', 'guard', 'parry'] as const

export type CombatAnimationKey = typeof COMBAT_ANIMATION_KEYS[number]

/**
 * RMSpritesheet only supplies `stand` and `walk`. Action Battle otherwise
 * defaults attack to the missing `attack` texture, which briefly hides the
 * character. Keep the attacker visible and explicitly disable every other
 * optional animation that this spritesheet cannot render.
 */
export function resolveCombatAnimation(key: CombatAnimationKey): 'stand' | { animationName: string; graphic: string } | null {
  return key === 'attack' ? { animationName: 'walk', graphic: 'liukanshan-sword-slash' } : null
}

export const combatAnimations = Object.fromEntries(
  COMBAT_ANIMATION_KEYS.map(key => [key, resolveCombatAnimation(key)]),
) as Record<CombatAnimationKey, 'stand' | { animationName: string; graphic: string } | null>

/** A rendering-level safety net for animation names synced by older servers. */
export function withCombatAnimationAliases<T extends { textures?: Record<string, unknown> }>(spritesheet: T): T {
  const stand = spritesheet.textures?.stand
  if (!stand) return spritesheet
  return {
    ...spritesheet,
    textures: {
      ...spritesheet.textures,
      attack: stand,
      hurt: stand,
      stagger: stand,
      die: stand,
      skill: stand,
      guard: stand,
      parry: stand,
    },
  }
}
