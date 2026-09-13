import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { handleAutonomyInput } from '../src/modules/main/player-input.ts'
const autonomy = await readFile(new URL('../src/modules/main/autonomy.ts', import.meta.url), 'utf8')
const playerHooks = await readFile(new URL('../src/modules/main/player.ts', import.meta.url), 'utf8')
test('autonomy is transition-driven and defines nearby locations', () => {
  for (const name of ['广场', '水井', '树林', '河边', '集市']) assert.match(autonomy, new RegExp(name))
  assert.match(autonomy, /startNextLeg/)
  assert.doesNotMatch(autonomy, /setInterval/)
  assert.match(autonomy, /scheduleMeetingCheck/)
  assert.match(autonomy, /moveTimedOut/)
  assert.match(autonomy, /AbortController/)
  assert.match(autonomy, /modelRetryDelay/)
  assert.match(autonomy, /disposeAgent/)
})

test('minimal G delegation starts with the hot-square target', () => {
  assert.match(autonomy, /state\.pendingIntent = AGENT_LOCATIONS\[0\]/)
  assert.match(autonomy, /observeArrival/)
})

function controlledPlayer() {
  let agentMode = true
  let stops = 0
  const signal = () => agentMode
  signal.set = value => { agentMode = value }
  return {
    player: { id: 'test-player', agentMode: signal, stopMoveTo: () => { stops += 1 } },
    mode: () => agentMode,
    stops: () => stops,
  }
}

test('server input handler routes G toggle and take-control actions', () => {
  const handlers = {
    toggleAgent: player => {
      player.agentMode.set(!player.agentMode())
      player.stopMoveTo()
    },
    takeControl: player => {
      player.agentMode.set(false)
      player.stopMoveTo()
    },
  }
  const toggled = controlledPlayer()
  handleAutonomyInput(toggled.player, { action: 'agentToggle' }, handlers)
  assert.equal(toggled.mode(), false)
  assert.equal(toggled.stops(), 1)

  const controlled = controlledPlayer()
  handleAutonomyInput(controlled.player, { action: 'takeControl' }, handlers)
  assert.equal(controlled.mode(), false)
  assert.equal(controlled.stops(), 1)

  handleAutonomyInput(controlled.player, { action: 'right' }, handlers)
  handleAutonomyInput(controlled.player, { direction: 'right' }, handlers)
  assert.equal(controlled.stops(), 1)

  assert.match(playerHooks, /onInput\(player:/)
  assert.match(playerHooks, /handleAutonomyInput\(player/)
  assert.doesNotMatch(playerHooks, /\.on\('agentToggle'/)
  assert.match(autonomy, /stopMoveTo\(\)/)
  assert.match(autonomy, /\/api\/agent\/(chat|step)/)
})

test('agent movement starts only after the player joins a gameplay map', () => {
  const connectedHook = playerHooks.match(/async onConnected\([\s\S]*?\n    },/)?.[0] ?? ''
  const joinMapHook = playerHooks.match(/onJoinMap\([\s\S]*?\n    },/)?.[0] ?? ''

  assert.match(connectedHook, /changeMap\('nature-open-world', 'start'\)/)
  assert.doesNotMatch(connectedHook, /enableAgent/)
  assert.match(joinMapHook, /agentMode\(\)/)
  assert.match(joinMapHook, /enableAgent\(player/)
  assert.match(playerHooks, /onLeaveMap\(player:/)
  assert.match(playerHooks, /onDisconnected\(player:/)
})

test('native arrival schedules a new destination without forcing a stop', async t => {
  const { enableAgent, disposeAgent } = await import('../src/modules/main/autonomy.ts')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', () => new Promise(() => {}))
  const signal = initial => {
    let current = initial
    return Object.assign(() => current, { set: value => { current = value } })
  }
  const moves = []
  let stops = 0
  const center = { x: 0, y: 0 }
  const player = {
    id: 'native-arrival', name: 'test', avatarId: signal(1),
    agentMode: signal(true), agentState: signal('agent'), agentSpeech: signal(''),
    position: center,
    getCurrentMap: () => ({ getBody: () => ({ position: center }), getPlayers: () => [] }),
    moveTo: target => moves.push(target), stopMoveTo: () => { stops += 1 },
  }
  try {
    enableAgent(player)
    const initialStops = stops
    assert.equal(moves.length, 1)
    t.mock.timers.tick(1000)
    assert.equal(moves.length, 1)
    assert.equal(stops, initialStops)
    Object.assign(center, moves[0])
    t.mock.timers.tick(1000)
    assert.equal(stops, initialStops)
    t.mock.timers.tick(5000)
    assert.equal(moves.length, 2)
    assert.notDeepEqual(moves[0], moves[1])
    assert.equal(stops, initialStops)
    disposeAgent(player)
    assert.equal(stops, initialStops + 1)
    t.mock.timers.tick(10000)
    assert.equal(moves.length, 2)
  } finally {
    disposeAgent(player)
  }
})
