import assert from 'node:assert/strict'
import test from 'node:test'
import { idleWakeDelay, meetingAllowed, moveTimedOut } from '../src/modules/main/autonomy-logic.ts'
import { mappedAutonomyAction, processAutonomyKey } from '../src/autonomy-input-logic.ts'

const controls = { agentToggle: ['g'], up: ['w'], down: ['s'], left: ['a'], right: ['d'] }
const matches = (event, bind) => bind?.includes(event.key.toLowerCase()) ?? false

test('meeting cooldown and movement timeout boundaries are deterministic', () => {
  assert.equal(meetingAllowed(undefined, 70_000), true)
  assert.equal(meetingAllowed(10_001, 70_000), false)
  assert.equal(meetingAllowed(10_000, 70_000), true)
  assert.equal(moveTimedOut(5_000, 19_999), false)
  assert.equal(moveTimedOut(5_000, 20_000), true)
})

test('idle wake remains bounded between four and ten seconds', () => {
  assert.equal(idleWakeDelay(() => 0), 4_000)
  assert.equal(idleWakeDelay(() => 0.999999), 10_000)
})

test('input mapping toggles G and only takes control from active autonomy', () => {
  assert.equal(mappedAutonomyAction({ key: 'g' }, controls, true, matches), 'agentToggle')
  assert.equal(mappedAutonomyAction({ key: 'w' }, controls, true, matches), 'takeControl')
  assert.equal(mappedAutonomyAction({ key: 'w' }, controls, false, matches), null)
  assert.equal(mappedAutonomyAction({ key: 'g', target: { tagName: 'INPUT' } }, controls, true, matches), null)
  const actions = []
  const engine = {
    globalConfig: { keyboardControls: controls },
    sceneMap: { getCurrentPlayer: () => ({ agentMode: () => true }) },
    processAction: action => actions.push(action),
  }
  processAutonomyKey(engine, { key: 'w' }, matches)
  assert.deepEqual(actions, [{ action: 'takeControl' }])
})
