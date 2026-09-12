import type { RpgPlayer } from '@rpgjs/server'

export const AGENT_LOCATIONS = [
  { id: 'square', name: '广场', x: 25, y: 23 },
  { id: 'well', name: '水井', x: 27, y: 23 },
  { id: 'woods', name: '树林', x: 22, y: 25 },
  { id: 'river', name: '河边', x: 26, y: 27 },
  { id: 'market', name: '集市', x: 29, y: 25 },
] as const

const TILE_SIZE = 32
const MEETING_DISTANCE = 2
const MEETING_COOLDOWN_MS = 60_000
const API_URL = (typeof process !== 'undefined' && process.env.AVATAR_API_URL) || 'http://127.0.0.1:8000'

type AgentAction =
  | { action: 'move'; to: { x: number; y: number; name: string } }
  | { action: 'say'; text: string }
  | { action: 'idle' }

type AgentPlayer = RpgPlayer & {
  avatarId: (() => number) & { set(value: number): void }
  agentMode: (() => boolean) & { set(value: boolean): void }
  agentSpeech: (() => string) & { set(value: string): void }
}

type State = { busy: boolean; target?: { x: number; y: number }; lastAction?: string; arrivalTimer?: ReturnType<typeof setTimeout> }
const states = new Map<string, State>()
const meetingCooldowns = new Map<string, number>()

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
  setTimeout(() => player.agentSpeech.set(''), 6_000)
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
  if (Date.now() - (meetingCooldowns.get(pair) ?? 0) < MEETING_COOLDOWN_MS || isTalking(player) || isTalking(other)) return false
  meetingCooldowns.set(pair, Date.now())
  states.get(String(player.id))!.busy = true
  states.get(String(other.id))!.busy = true
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
    states.get(String(player.id))!.busy = false
    states.get(String(other.id))!.busy = false
  }
}

async function requestStep(player: AgentPlayer, observed = nearby(player).map(({ other, distance }) => ({ avatar_id: value(other.avatarId), name: other.name, distance }))) {
  const state = states.get(String(player.id))!
  return post<AgentAction>('/api/agent/step', {
    avatar_id: value(player.avatarId), position: position(player), locations: AGENT_LOCATIONS,
    nearby: observed, persona: player.name, last_action: state.lastAction,
  })
}

function watchArrival(player: AgentPlayer, state: State) {
  if (!state.target || !value(player.agentMode)) return
  const here = position(player)
  if (Math.hypot(here.x - state.target.x, here.y - state.target.y) <= 0.75) {
    state.target = undefined
    state.busy = false
    void advanceAgent(player, 'arrived')
    return
  }
  state.arrivalTimer = setTimeout(() => watchArrival(player, state), 250)
}

export async function advanceAgent(player: AgentPlayer, event: 'enabled' | 'arrived' | 'meeting') {
  if (!value(player.agentMode)) return
  const state = states.get(String(player.id)) ?? { busy: false }
  states.set(String(player.id), state)
  const encounter = nearby(player)[0]
  if (encounter && await meet(player, encounter.other)) return
  if (state.busy) return
  state.busy = true
  try {
    const action = await requestStep(player)
    state.lastAction = `${event}:${action.action}`
    if (action.action === 'move') {
      state.target = { x: action.to.x, y: action.to.y }
      player.moveTo({ x: action.to.x * TILE_SIZE, y: action.to.y * TILE_SIZE })
      watchArrival(player, state)
    } else {
      state.busy = false
      if (action.action === 'say') showBubble(player, action.text)
    }
  } catch (error) {
    state.busy = false
    console.warn('agent step failed', error)
  }
}

export function enableAgent(player: AgentPlayer) {
  player.agentMode.set(true)
  void advanceAgent(player, 'enabled')
}

export function takeControl(player: AgentPlayer) {
  player.agentMode.set(false)
  player.stopMoveTo()
  const state = states.get(String(player.id))
  if (state?.arrivalTimer) clearTimeout(state.arrivalTimer)
  states.set(String(player.id), { busy: false, lastAction: state?.lastAction })
}

export function toggleAgent(player: AgentPlayer) {
  if (value(player.agentMode)) takeControl(player)
  else enableAgent(player)
}
