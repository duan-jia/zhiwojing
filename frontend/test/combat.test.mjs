import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFixedDamage, canTargetCombatPlayer, isDefeated, restoreCombatPlayer, shouldAutoRespawn } from '../src/combat-state.ts'
import { isAttackKey, processCombatKey } from '../src/combat-input-logic.ts'
import { normalizeHp } from '../src/combat-hud-logic.ts'

test('fixed damage clamps hp and reports defeat', () => {
  const target = { hp: 100 }
  assert.deepEqual(applyFixedDamage(target), { damage: 25, defeated: false })
  target.hp = 10
  assert.deepEqual(applyFixedDamage(target), { damage: 10, defeated: true })
  assert.equal(target.hp, 0)
  assert.equal(isDefeated(target), true)
})

test('autonomous players are eligible for timed respawn', () => {
  assert.equal(shouldAutoRespawn({ agentMode: () => true }), true)
  assert.equal(shouldAutoRespawn({ agentMode: () => false }), false)
})

test('target selection excludes self and defeated players but allows another live player', () => {
  const attacker = { hp: 100, defeated: false }
  const target = { hp: 100, defeated: false }
  assert.equal(canTargetCombatPlayer(attacker, attacker), false)
  assert.equal(canTargetCombatPlayer(attacker, target), true)
  assert.equal(canTargetCombatPlayer(attacker, { hp: 100, isEvent: () => true }), false)
  target.defeated = true
  assert.equal(canTargetCombatPlayer(attacker, target), false)
  attacker.hp = 0
  target.defeated = false
  assert.equal(canTargetCombatPlayer(attacker, target), false)
})

test('respawn restores full health, movement, and synchronized defeated state', () => {
  let defeated = true
  const player = { hp: 0, canMove: false, defeated: Object.assign(() => defeated, { set: value => { defeated = value } }) }
  restoreCombatPlayer(player)
  assert.equal(player.hp, 100)
  assert.equal(player.canMove, true)
  assert.equal(defeated, false)
})

test('J maps to action once and editable fields are ignored', () => {
  const sent = []
  assert.equal(processCombatKey({ processAction: action => sent.push(action) }, { key: 'j' }), true)
  assert.deepEqual(sent, ['action'])
  assert.equal(isAttackKey({ key: 'j', repeat: true }), false)
  assert.equal(isAttackKey({ key: 'j', target: { tagName: 'INPUT' } }), false)
  assert.equal(isAttackKey({ key: ' ', target: {} }), false)
})

test('HUD values clamp to the configured range', () => {
  assert.deepEqual(normalizeHp(75), { current: 75, max: 100, percent: 75 })
  assert.deepEqual(normalizeHp(-5), { current: 0, max: 100, percent: 0 })
})
