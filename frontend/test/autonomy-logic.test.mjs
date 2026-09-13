import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseLocation, idleWakeDelay, meetingAllowed, modelRetryDelay, moveTimedOut } from '../src/modules/main/autonomy-logic.ts'
import { mappedAutonomyAction, processAutonomyKey } from '../src/autonomy-input-logic.ts'
import { autonomyModeView } from '../src/autonomy-status.ts'
import { processMenuKey } from '../src/menu-input.ts'
import { readFile } from 'node:fs/promises'

const controls = { agentToggle: ['g'], up: ['w'], down: ['s'], left: ['a'], right: ['d'] }
const matches = (event, bind) => bind?.includes(event.key.toLowerCase()) ?? false

test('client scene change hook routes authoritative updates to autonomy sync', async () => {
  const config = await readFile(new URL('../src/config/config.client.ts', import.meta.url), 'utf8')
  assert.match(config, /sceneMap:\s*\{[\s\S]*onChanges\(scene, \{ partial \}\)[\s\S]*recordSyncDiagnostic\(scene, partial\)/)
  assert.doesNotMatch(config, /applyAutonomyPositionSync\(scene, partial\)/)
  assert.doesNotMatch(config, /movementAuthority:/)
  assert.doesNotMatch(config, /prediction:/)
})

test('meeting cooldown and movement timeout boundaries are deterministic', () => {
  assert.equal(meetingAllowed(undefined, 70_000), true)
  assert.equal(meetingAllowed(10_001, 70_000), false)
  assert.equal(meetingAllowed(10_000, 70_000), true)
  assert.equal(moveTimedOut(5_000, 19_999), false)
  assert.equal(moveTimedOut(5_000, 20_000), true)
})

test('local patrol dwell and model retry remain bounded', () => {
  assert.equal(idleWakeDelay(() => 0), 2_000)
  assert.equal(idleWakeDelay(() => 0.999999), 5_000)
  assert.deepEqual([1, 2, 3, 4].map(modelRetryDelay), [15_000, 30_000, 60_000, 60_000])
})

test('local patrol avoids the current and previous landmark', () => {
  const locations = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(chooseLocation(locations, ['a', 'b'], () => 0)?.id, 'c')
  assert.equal(chooseLocation(locations, ['a'], () => 0)?.id, 'b')
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

test('Escape sends a menu action only while gameplay input is active', () => {
  const actions = []
  const engine = {
    stopProcessingInput: false,
    processAction: action => actions.push(action),
  }
  let prevented = 0
  const event = { key: 'Escape', repeat: false, target: null, preventDefault: () => { prevented += 1 } }

  assert.equal(processMenuKey(engine, event), true)
  assert.deepEqual(actions, [{ action: 'escape' }])
  assert.equal(prevented, 1)

  engine.stopProcessingInput = true
  assert.equal(processMenuKey(engine, event), false)
  assert.equal(actions.length, 1)
})

test('mode status explains human, agent, degraded and disconnected states', () => {
  assert.deepEqual(autonomyModeView(true, 'agent', true), {
    label: '分身托管中', hint: '按 G 真人接管', className: 'autonomy-mode--agent',
  })
  assert.deepEqual(autonomyModeView(false, 'human', true), {
    label: '真人控制中', hint: '按 G 交给分身', className: 'autonomy-mode--human',
  })
  assert.equal(autonomyModeView(true, 'degraded', true).label, '本地巡游中')
  assert.equal(autonomyModeView(true, 'agent', false).label, '世界连接已断开')
})
