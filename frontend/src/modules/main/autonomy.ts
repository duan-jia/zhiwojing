import type { RpgPlayer } from '@rpgjs/server'
import {
  MODEL_REFRESH_MS,
  MODEL_TIMEOUT_MS,
  chooseLocation,
  idleWakeDelay,
  meetingAllowed,
  modelRetryDelay,
  moveTimedOut,
} from './autonomy-logic.ts'

export const TILE_SIZE = 32

export const AGENT_LOCATIONS = [
  { id: 'square', name: '中央广场', x: 29, y: 24 },
  { id: 'home', name: '知我居门前', x: 14, y: 18 },
  { id: 'hot', name: '知乎热榜门前', x: 29, y: 20 },
  { id: 'book', name: '藏书阁门前', x: 47, y: 19 },
  { id: 'wendao', name: '问道馆门前', x: 14, y: 37 },
  { id: 'studio', name: '创作坊门前', x: 46, y: 37 },
  { id: 'tiangong', name: '天工坊门前', x: 31, y: 41 },
] as const

export function systemPlayerEvent(avatarId: number, name: string, graphic: string, x: number, y: number) {
  return {
    id: `system-player-${avatarId}`,
    x,
    y,
    event: {
      onInit(this: any) {
        this.systemPlayer = true
        this.name = name
        this.setGraphic(graphic)
        this.setHitbox(1, 1)
        this.setSync({
          avatarId: { $default: avatarId, $syncWithClient: true, $permanent: false },
          agentMode: { $default: true, $syncWithClient: true, $permanent: false },
          agentSpeech: { $default: '', $syncWithClient: true, $permanent: false },
          agentState: { $default: 'agent', $syncWithClient: true, $permanent: false },
          dialoguePaused: { $default: false, $syncWithClient: true, $permanent: false },
          defeated: { $default: false, $syncWithClient: true, $permanent: false },
        })
        this.avatarId.set(avatarId)
        this.agentMode.set(true)
        this.agentState.set('agent')
        this.hp = 100
        this.combatNpc = true
        this.battleAi = { getFaction: () => 'npcs', handleDamage: () => undefined }
        this.actionBattleFaction = 'npcs'
        enableAgent(this as AgentActor)
      },
    },
  }
}

const MEETING_DISTANCE = 2
const MAX_MODEL_CONCURRENCY = 3
const API_URL = (typeof process !== 'undefined' && process.env.AVATAR_API_URL) || 'http://127.0.0.1:8000'
const SYSTEM_AGENT_TOKEN = (typeof process !== 'undefined' && process.env.SYSTEM_AGENT_TOKEN) || ''

type AgentLocation = (typeof AGENT_LOCATIONS)[number]
type AgentAction =
  | { action: 'move'; to: { x: number; y: number; name: string } }
  | { action: 'say'; text: string }
  | { action: 'idle' }
type AgentState = 'human' | 'agent' | 'degraded'
type Signal<T> = (() => T) & { set(value: T): void }
export type AgentActor = RpgPlayer & {
  authToken?: string
  avatarId: Signal<number>
  agentMode: Signal<boolean>
  agentSpeech: Signal<string>
  agentState: Signal<AgentState>
  dialoguePaused?: Signal<boolean>
  systemPlayer?: boolean
}
type State = {
  generation: number
  moving: boolean
  currentTarget?: AgentLocation
  previousTargetId?: string
  pendingIntent?: AgentLocation
  moveStartedAt?: number
  nextModelAt: number
  failures: number
  requestAbort?: AbortController
  meetingAborts: Set<AbortController>
  arrivalTimer?: ReturnType<typeof setTimeout>
  dwellTimer?: ReturnType<typeof setTimeout>
  modelTimer?: ReturnType<typeof setTimeout>
  meetingTimer?: ReturnType<typeof setTimeout>
}

const states = new Map<string, State>()
const meetingCooldowns = new Map<string, number>()
const meetingsInFlight = new Set<string>()
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const slotWaiters: Array<() => void> = []
let activeModelRequests = 0

function value<T>(signal: (() => T) | T): T {
  return typeof signal === 'function' ? (signal as () => T)() : signal
}

function defeated(player: AgentActor) {
  const prop = (player as any).defeated
  return Boolean(typeof prop === 'function' ? prop() : prop)
}

function dialoguePaused(player: AgentActor): boolean {
  const prop = player.dialoguePaused as any
  return Boolean(prop && (typeof prop === 'function' ? prop() : prop))
}

export function canUseAgentApi(player: Pick<AgentActor, 'systemPlayer'>, systemToken = SYSTEM_AGENT_TOKEN): boolean {
  return !player.systemPlayer || Boolean(systemToken)
}

function reportPresence(player: AgentActor, humanControlled: boolean) {
  const controller = new AbortController()
  void post(player, '/api/presence', {
    user_id: value(player.avatarId), connection_id: playerId(player), online: true, human_controlled: humanControlled,
  }, controller.signal).catch(error => console.warn('presence update failed', error))
}

function playerId(player: AgentActor) {
  return String(value((player as unknown as { id: (() => string) | string }).id))
}

function position(player: RpgPlayer) {
  const p = (player as unknown as { position: { x: number; y: number } }).position
  return { x: Math.round(p.x / TILE_SIZE), y: Math.round(p.y / TILE_SIZE) }
}

function roomPlayers(player: AgentActor): AgentActor[] {
  const map = player.getCurrentMap() as unknown as { getPlayers?: () => AgentActor[]; users?: AgentActor[] } | null
  const players = map?.getPlayers?.() ?? map?.users ?? []
  const events = (map as any)?.getEvents?.() ?? []
  return [...players, ...events.filter((event: any) => event?.systemPlayer)] as AgentActor[]
}

function nearby(player: AgentActor) {
  if (defeated(player)) return []
  const here = position(player)
  return roomPlayers(player)
    .filter(other => playerId(other) !== playerId(player) && !defeated(other))
    .map(other => ({ other, distance: Math.hypot(position(other).x - here.x, position(other).y - here.y) }))
    .filter(item => item.distance <= MEETING_DISTANCE)
}

function acquireModelSlot(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const enter = () => {
      if (signal.aborted) return reject(signal.reason)
      activeModelRequests += 1
      resolve(() => {
        activeModelRequests -= 1
        slotWaiters.shift()?.()
      })
    }
    if (activeModelRequests < MAX_MODEL_CONCURRENCY) enter()
    else {
      slotWaiters.push(enter)
      signal.addEventListener('abort', () => {
        const index = slotWaiters.indexOf(enter)
        if (index >= 0) slotWaiters.splice(index, 1)
        reject(signal.reason)
      }, { once: true })
    }
  })
}

async function post<T>(player: AgentActor, path: string, body: object, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(player.authToken ? { authorization: `Bearer ${player.authToken}` } : {}), ...(player.systemPlayer && SYSTEM_AGENT_TOKEN ? { 'x-system-agent-token': SYSTEM_AGENT_TOKEN } : {}) }, body: JSON.stringify(body), signal,
  })
  if (!response.ok) throw new Error(`avatar API ${response.status}`)
  return response.json() as Promise<T>
}

function showBubble(player: AgentActor, text: string) {
  player.agentSpeech.set(text)
  const id = playerId(player)
  const previous = bubbleTimers.get(id)
  if (previous) clearTimeout(previous)
  bubbleTimers.set(id, setTimeout(() => {
    player.agentSpeech.set('')
    bubbleTimers.delete(id)
  }, 6_000))
}

function currentState(player: AgentActor, generation?: number) {
  const state = states.get(playerId(player))
  if (!state || (generation !== undefined && state.generation !== generation)) return undefined
  return state
}

function clearStateTimers(state: State) {
  for (const timer of [state.arrivalTimer, state.dwellTimer, state.modelTimer, state.meetingTimer]) {
    if (timer) clearTimeout(timer)
  }
}

function locationFor(action: AgentAction): AgentLocation | undefined {
  if (action.action !== 'move') return undefined
  return AGENT_LOCATIONS.find(location => location.x === action.to.x && location.y === action.to.y)
}

function scheduleNextLeg(player: AgentActor, generation: number) {
  const state = currentState(player, generation)
  if (!state || !value(player.agentMode) || defeated(player)) return
  if (state.dwellTimer) clearTimeout(state.dwellTimer)
  state.dwellTimer = setTimeout(() => {
    const active = currentState(player, generation)
    if (!active || !value(player.agentMode) || defeated(player)) return
    active.dwellTimer = undefined
    startNextLeg(player, generation)
  }, idleWakeDelay())
}

// moveTo uses the physics body's center and a 48px arrival radius.
// Observe arrival only; SeekAvoid owns velocity and stopping at the target.
function observeArrival(player: AgentActor, generation: number) {
  const state = currentState(player, generation)
  if (!state?.currentTarget || !value(player.agentMode) || defeated(player)) return
  state.arrivalTimer = setTimeout(() => {
    const active = currentState(player, generation)
    if (!active?.currentTarget || !value(player.agentMode) || defeated(player)) return
    active.arrivalTimer = undefined
    const body = (player.getCurrentMap() as any)?.getBody(playerId(player))
    const center = body?.position
    const arrived = center && Math.hypot(
      center.x - active.currentTarget.x * TILE_SIZE,
      center.y - active.currentTarget.y * TILE_SIZE,
    ) <= 48
    const failed = moveTimedOut(active.moveStartedAt)
    if (!arrived && !failed) {
      observeArrival(player, generation)
      return
    }
    if (!arrived && failed) player.stopMoveTo()
    active.moving = false
    active.moveStartedAt = undefined
    active.previousTargetId = active.currentTarget.id
    active.currentTarget = undefined
    scheduleNextLeg(player, generation)
  }, 1_000)
}

function startNextLeg(player: AgentActor, generation: number) {
  const state = currentState(player, generation)
  if (!state || state.moving || dialoguePaused(player) || !value(player.agentMode) || defeated(player)) return
  const target = state.pendingIntent ?? chooseLocation(AGENT_LOCATIONS, [state.currentTarget?.id, state.previousTargetId])
  state.pendingIntent = undefined
  if (!target) return
  state.currentTarget = target
  state.moving = true
  state.moveStartedAt = Date.now()
  try {
    player.moveTo({ x: target.x * TILE_SIZE, y: target.y * TILE_SIZE })
    observeArrival(player, generation)
  } catch (error) {
    console.warn('agent movement failed', error)
    player.stopMoveTo()
    state.moving = false
    state.previousTargetId = target.id
    state.currentTarget = undefined
    scheduleNextLeg(player, generation)
  }
}

function scheduleModelRetry(player: AgentActor, generation: number, delay: number) {
  const state = currentState(player, generation)
  if (!state) return
  if (state.modelTimer) clearTimeout(state.modelTimer)
  state.modelTimer = setTimeout(() => {
    const active = currentState(player, generation)
    if (!active) return
    active.modelTimer = undefined
    void refreshIntent(player, generation)
  }, delay)
}

async function refreshIntent(player: AgentActor, generation: number) {
  const state = currentState(player, generation)
  if (!state || state.requestAbort || dialoguePaused(player) || !canUseAgentApi(player) || !value(player.agentMode) || defeated(player) || Date.now() < state.nextModelAt) return
  const controller = new AbortController()
  state.requestAbort = controller
  state.nextModelAt = Date.now() + MODEL_REFRESH_MS
  const timeout = setTimeout(() => controller.abort(new Error('agent model timeout')), MODEL_TIMEOUT_MS)
  let release: (() => void) | undefined
  try {
    release = await acquireModelSlot(controller.signal)
    const action = await post<AgentAction>(player, '/api/agent/step', {
      avatar_id: value(player.avatarId), position: position(player), locations: AGENT_LOCATIONS,
      nearby: nearby(player).map(({ other, distance }) => ({ avatar_id: value(other.avatarId), name: other.name, distance })),
      persona: player.name, last_action: state.previousTargetId,
    }, controller.signal)
    const active = currentState(player, generation)
    if (!active || !value(player.agentMode) || defeated(player)) return
    active.failures = 0
    active.nextModelAt = Date.now() + MODEL_REFRESH_MS
    player.agentState.set('agent')
    active.pendingIntent = locationFor(action)
    if (action.action === 'say') showBubble(player, action.text)
  } catch (error) {
    const active = currentState(player, generation)
    if (!active || defeated(player) || (controller.signal.aborted && !value(player.agentMode))) return
    active.failures += 1
    const delay = modelRetryDelay(active.failures)
    active.nextModelAt = Date.now() + delay
    player.agentState.set('degraded')
    console.warn('agent intent unavailable; using local patrol', error)
    scheduleModelRetry(player, generation, delay)
  } finally {
    clearTimeout(timeout)
    release?.()
    const active = currentState(player, generation)
    if (active?.requestAbort === controller) active.requestAbort = undefined
  }
}

async function startMeeting(player: AgentActor, other: AgentActor, generation: number, pair: string) {
  const controller = new AbortController()
  const state = currentState(player, generation)
  if (!state) return
  state.meetingAborts.add(controller)
  const timeout = setTimeout(() => controller.abort(new Error('agent meeting timeout')), MODEL_TIMEOUT_MS)
  let release: (() => void) | undefined
  showBubble(player, `你好，${other.name}！`)
  try {
    release = await acquireModelSlot(controller.signal)
    const response = await post<{ response: string }>(player, '/api/agent/chat', {
      user_id: value(player.avatarId), avatar_id: value(other.avatarId),
      conversation_id: `meeting:${pair}`, message: `你好，${other.name}！`,
    }, controller.signal)
    if (currentState(player, generation) && value(player.agentMode) && !defeated(player)) showBubble(player, response.response)
  } catch {
    // The local greeting is the deterministic fallback; movement never waits here.
  } finally {
    clearTimeout(timeout)
    release?.()
    currentState(player, generation)?.meetingAborts.delete(controller)
    meetingsInFlight.delete(pair)
  }
}

function scheduleMeetingCheck(player: AgentActor, generation: number) {
  const state = currentState(player, generation)
  if (!state || dialoguePaused(player) || !canUseAgentApi(player) || !value(player.agentMode) || defeated(player)) return
  state.meetingTimer = setTimeout(() => {
    const active = currentState(player, generation)
    if (!active || dialoguePaused(player) || !value(player.agentMode) || defeated(player)) return
    active.meetingTimer = undefined
    const encounter = nearby(player)[0]
    if (encounter) {
      const pair = [playerId(player), playerId(encounter.other)].sort().join(':')
      if (playerId(player) === pair.split(':')[0] && meetingAllowed(meetingCooldowns.get(pair)) && !meetingsInFlight.has(pair)) {
        meetingCooldowns.set(pair, Date.now())
        meetingsInFlight.add(pair)
        void startMeeting(player, encounter.other, generation, pair)
      }
    }
    scheduleMeetingCheck(player, generation)
  }, 1_500)
}

export function enableAgent(player: AgentActor) {
  disposeAgent(player)
  player.agentMode.set(true)
  player.agentState.set(canUseAgentApi(player) ? 'agent' : 'degraded')
  if (!player.systemPlayer) reportPresence(player, false)
  const state: State = {
    generation: Date.now() + Math.random(), moving: false, nextModelAt: 0, failures: 0,
    meetingAborts: new Set(),
  }
  states.set(playerId(player), state)
  state.pendingIntent = AGENT_LOCATIONS[0]
  startNextLeg(player, state.generation)
  void refreshIntent(player, state.generation)
  scheduleMeetingCheck(player, state.generation)
}

/** Freeze or resume a system player's autonomous behavior while a dialogue is open. */
export function setAgentDialoguePaused(player: AgentActor, paused: boolean): void {
  if (!player.systemPlayer || !player.dialoguePaused) return
  player.dialoguePaused.set(paused)
  const state = states.get(playerId(player))
  if (!state) return
  if (paused) {
    state.arrivalTimer && clearTimeout(state.arrivalTimer)
    state.dwellTimer && clearTimeout(state.dwellTimer)
    state.modelTimer && clearTimeout(state.modelTimer)
    state.meetingTimer && clearTimeout(state.meetingTimer)
    state.requestAbort?.abort(new Error('dialogue opened'))
    state.pendingIntent = state.currentTarget ?? state.pendingIntent
    state.currentTarget = undefined
    state.moving = false
    state.moveStartedAt = undefined
    player.stopMoveTo()
  } else {
    startNextLeg(player, state.generation)
    scheduleMeetingCheck(player, state.generation)
    void refreshIntent(player, state.generation)
  }
}

export function disposeAgent(player: AgentActor) {
  const id = playerId(player)
  const state = states.get(id)
  if (state) {
    clearStateTimers(state)
    state.requestAbort?.abort(new Error('agent lifecycle ended'))
    for (const controller of state.meetingAborts) controller.abort(new Error('agent lifecycle ended'))
    states.delete(id)
  }
  const bubble = bubbleTimers.get(id)
  if (bubble) clearTimeout(bubble)
  bubbleTimers.delete(id)
  for (const pair of meetingCooldowns.keys()) if (pair.split(':').includes(id)) meetingCooldowns.delete(pair)
  for (const pair of meetingsInFlight) if (pair.split(':').includes(id)) meetingsInFlight.delete(pair)
  try { player.stopMoveTo() } catch { /* Player may already have left its map. */ }
}

export function takeControl(player: AgentActor) {
  disposeAgent(player)
  player.agentMode.set(false)
  player.agentState.set('human')
  if (!player.systemPlayer) reportPresence(player, true)
}

export function toggleAgent(player: AgentActor) {
  if (value(player.agentMode)) takeControl(player)
  else enableAgent(player)
}

export function pauseAgent(player: AgentActor) {
  const state = currentState(player)
  try { player.stopMoveTo() } catch { /* Player may already have left its map. */ }
  if (!state) return
  clearStateTimers(state)
  state.requestAbort?.abort(new Error('agent paused'))
  for (const controller of state.meetingAborts) controller.abort(new Error('agent paused'))
  state.requestAbort = undefined
  state.meetingAborts.clear()
  state.moving = false
  state.moveStartedAt = undefined
}

export function resumeAgent(player: AgentActor) {
  if (!value(player.agentMode) || defeated(player)) return
  const state = currentState(player)
  if (!state) {
    enableAgent(player)
    return
  }
  startNextLeg(player, state.generation)
  void refreshIntent(player, state.generation)
  scheduleMeetingCheck(player, state.generation)
}
