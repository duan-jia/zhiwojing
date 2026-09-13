import type { RpgPlayer } from '@rpgjs/server'
import { idleWakeDelay, meetingAllowed, moveTimedOut } from './autonomy-logic'

export const AGENT_LOCATIONS = [
  { id: 'square', name: '广场', x: 25, y: 23 },
  { id: 'well', name: '水井', x: 27, y: 23 },
  { id: 'woods', name: '树林', x: 22, y: 25 },
  { id: 'river', name: '河边', x: 26, y: 27 },
  { id: 'market', name: '集市', x: 29, y: 25 },
] as const

const TILE_SIZE = 32
const MEETING_DISTANCE = 2
const ARRIVAL_DISTANCE_PX = 24
const API_URL = (typeof process !== 'undefined' && process.env.AVATAR_API_URL) || 'http://127.0.0.1:8000'

function reportPresence(player: AgentPlayer, humanControlled: boolean) {
  void post('/api/presence', { user_id: value(player.avatarId), online: true, human_controlled: humanControlled })
    .catch(error => console.warn('presence update failed', error))
}

type AgentAction =
  | { action: 'move'; to: { x: number; y: number; name: string } }
  | { action: 'say'; text: string }
  | { action: 'idle' }

type AgentPlayer = RpgPlayer & {
  avatarId: (() => number) & { set(value: number): void }
  agentMode: (() => boolean) & { set(value: boolean): void }
  agentSpeech: (() => string) & { set(value: string): void }
}

type State = { busy: boolean; target?: { x: number; y: number }; lastAction?: string; moveStartedAt?: number; arrivalTimer?: ReturnType<typeof setTimeout>; idleTimer?: ReturnType<typeof setTimeout>; meetingTimer?: ReturnType<typeof setTimeout> }
const states = new Map<string, State>()
const meetingCooldowns = new Map<string, number>()
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()

function value<T>(signal: (() => T) | T): T {
  return typeof signal === 'function' ? (signal as () => T)() : signal
}

function position(player: RpgPlayer) {
  const p = (player as unknown as { position: { x: number; y: number } }).position
  return { x: Math.round(p.x / TILE_SIZE), y: Math.round(p.y / TILE_SIZE) }
}

function roomPlayers(player: RpgPlayer): AgentPlayer[] {
  const map = player.getCurrentMap() as unknown as { getPlayers?: () => AgentPlayer[]; users?: AgentPlayer[] } | null
  if (!map) return []
  return map.getPlayers?.() ?? map.users ?? []
}

function isTalking(player: AgentPlayer) {
  return Boolean((player as unknown as { isInDialogue?: boolean }).isInDialogue) || states.get(String(player.id))?.busy === true
}

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`avatar API ${response.status}`)
  return response.json() as Promise<T>
}

function showBubble(player: AgentPlayer, text: string) {
  player.agentSpeech.set(text)
  const id = String(player.id)
  const previous = bubbleTimers.get(id)
  if (previous) clearTimeout(previous)
  bubbleTimers.set(id, setTimeout(() => {
    player.agentSpeech.set('')
    bubbleTimers.delete(id)
  }, 6_000))
}

function stateFor(player: AgentPlayer) {
  const id = String(player.id)
  const state = states.get(id) ?? { busy: false }
  states.set(id, state)
  return state
}

function clearArrival(state: State) {
  if (state.arrivalTimer) clearTimeout(state.arrivalTimer)
  state.arrivalTimer = undefined
  state.moveStartedAt = undefined
}

function scheduleIdleWake(player: AgentPlayer) {
  if (!value(player.agentMode)) return
  const state = stateFor(player)
  if (state.idleTimer) clearTimeout(state.idleTimer)
  state.idleTimer = setTimeout(() => {
    state.idleTimer = undefined
    void advanceAgent(player, 'idle')
  }, idleWakeDelay())
}

function scheduleMeetingCheck(player: AgentPlayer) {
  const state = stateFor(player)
  if (state.meetingTimer) clearTimeout(state.meetingTimer)
  if (!value(player.agentMode)) return
  state.meetingTimer = setTimeout(() => {
    state.meetingTimer = undefined
    if (nearby(player).length > 0) void advanceAgent(player, 'meeting')
    scheduleMeetingCheck(player)
  }, 1_500)
}

function nearby(player: AgentPlayer) {
  const here = position(player)
  return roomPlayers(player)
    .filter(other => other.id !== player.id)
    .map(other => ({ other, distance: Math.hypot(position(other).x - here.x, position(other).y - here.y) }))
    .filter(item => item.distance <= MEETING_DISTANCE)
}

async function meet(player: AgentPlayer, other: AgentPlayer) {
  const pair = [String(player.id), String(other.id)].sort().join(':')
  if (!meetingAllowed(meetingCooldowns.get(pair)) || isTalking(player) || isTalking(other)) return false
  meetingCooldowns.set(pair, Date.now())
  const playerState = stateFor(player)
  const otherState = stateFor(other)
  playerState.busy = true
  otherState.busy = true
  try {
    const opening = await requestStep(player, [{ avatar_id: value(other.avatarId), name: other.name, distance: 1 }])
    const text = opening.action === 'say' ? opening.text : `你好，${other.name}！`
    showBubble(player, text)
    if (value(other.agentMode)) {
      const response = await post<{ response: string }>('/api/agent/chat', {
        user_id: value(player.avatarId), avatar_id: value(other.avatarId),
        conversation_id: `meeting:${pair}`, message: text,
      })
      showBubble(other, response.response)
    } else {
      showBubble(other, text)
    }
    return true
  } finally {
    playerState.busy = false
    otherState.busy = false
    scheduleIdleWake(player)
    scheduleIdleWake(other)
  }
}

async function requestStep(player: AgentPlayer, observed = nearby(player).map(({ other, distance }) => ({ avatar_id: value(other.avatarId), name: other.name, distance }))) {
  const state = stateFor(player)
  return post<AgentAction>('/api/agent/step', {
    avatar_id: value(player.avatarId), position: position(player), locations: AGENT_LOCATIONS,
    nearby: observed, persona: player.name, last_action: state.lastAction,
  })
}

function watchArrival(player: AgentPlayer, state: State) {
  if (!state.target || !value(player.agentMode)) return
  const here = (player as unknown as { position: { x: number; y: number } }).position
  const distance = Math.hypot(here.x - state.target.x * TILE_SIZE, here.y - state.target.y * TILE_SIZE)
  if (distance <= ARRIVAL_DISTANCE_PX) {
    clearArrival(state)
    state.target = undefined
    state.busy = false
    void advanceAgent(player, 'arrived')
    return
  }
  if (moveTimedOut(state.moveStartedAt)) {
    clearArrival(state)
    state.target = undefined
    state.busy = false
    player.stopMoveTo()
    scheduleIdleWake(player)
    return
  }
  state.arrivalTimer = setTimeout(() => watchArrival(player, state), 250)
}

export async function advanceAgent(player: AgentPlayer, event: 'enabled' | 'arrived' | 'meeting' | 'idle') {
  if (!value(player.agentMode)) return
  const state = stateFor(player)
  const encounter = nearby(player)[0]
  if (encounter && await meet(player, encounter.other)) return
  if (state.busy) return
  state.busy = true
  try {
    const action = await requestStep(player)
    state.lastAction = `${event}:${action.action}`
    if (action.action === 'move') {
      state.target = { x: action.to.x, y: action.to.y }
      state.moveStartedAt = Date.now()
      player.moveTo({ x: action.to.x * TILE_SIZE, y: action.to.y * TILE_SIZE })
      watchArrival(player, state)
    } else {
      state.busy = false
      if (action.action === 'say') showBubble(player, action.text)
      scheduleIdleWake(player)
    }
  } catch (error) {
    state.busy = false
    console.warn('agent step failed', error)
    scheduleIdleWake(player)
  }
}

export function enableAgent(player: AgentPlayer) {
  player.agentMode.set(true)
  reportPresence(player, false)
  scheduleMeetingCheck(player)
  void advanceAgent(player, 'enabled')
}

export function takeControl(player: AgentPlayer) {
  player.agentMode.set(false)
  reportPresence(player, true)
  player.stopMoveTo()
  const state = states.get(String(player.id))
  if (state) {
    clearArrival(state)
    if (state.idleTimer) clearTimeout(state.idleTimer)
    if (state.meetingTimer) clearTimeout(state.meetingTimer)
  }
  states.set(String(player.id), { busy: false, lastAction: state?.lastAction })
}

export function toggleAgent(player: AgentPlayer) {
  if (value(player.agentMode)) takeControl(player)
  else enableAgent(player)
}
