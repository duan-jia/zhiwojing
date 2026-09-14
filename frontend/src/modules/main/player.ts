import type {
    RpgPlayer,
    RpgPlayerConnectionContext,
    RpgPlayerHooks,
} from '@rpgjs/server'
import { disposeAgent, enableAgent, takeControl, toggleAgent } from './autonomy.ts'
import { handleAutonomyInput } from './player-input.ts'
import { clearRespawnTimer, initializeCombatPlayer, revivePlayer } from './combat'
import { initializeStarterWeapon } from './weapons'

const profiles = {
    1: { name: '体验用户', graphic: 'liukanshan' },
    2: { name: '苏晚', graphic: 'female' },
    3: { name: '周博', graphic: 'hero' },
} as const
const API_URL = (typeof process !== 'undefined' && process.env.AVATAR_API_URL) || 'http://127.0.0.1:8000'
const PRESENCE_HEARTBEAT_MS = 15_000
const presenceTimers = new Map<string, ReturnType<typeof setInterval>>()

function connectionId(player: RpgPlayer): string {
    const id = (player as any).id
    return String(typeof id === 'function' ? id() : id)
}

function presence(player: RpgPlayer, online: boolean) {
    const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal; agentMode: (() => boolean); authToken?: string }
    void fetch(`${API_URL}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json', ...(synchronizedPlayer.authToken ? { authorization: `Bearer ${synchronizedPlayer.authToken}` } : {}) }, body: JSON.stringify({ user_id: synchronizedPlayer.avatarId(), connection_id: connectionId(player), online, human_controlled: online && !synchronizedPlayer.agentMode() }) })
        .catch(error => console.warn('presence update failed', error))
}

function startPresenceHeartbeat(player: RpgPlayer) {
    const id = connectionId(player)
    const previous = presenceTimers.get(id)
    if (previous) clearInterval(previous)
    presence(player, true)
    presenceTimers.set(id, setInterval(() => presence(player, true), PRESENCE_HEARTBEAT_MS))
}

function stopPresenceHeartbeat(player: RpgPlayer) {
    const id = connectionId(player)
    const timer = presenceTimers.get(id)
    if (timer) clearInterval(timer)
    presenceTimers.delete(id)
    presence(player, false)
}

type AvatarIdSignal = (() => number) & { set(value: number): void }

function avatarIdFromContext(context: RpgPlayerConnectionContext): number {
    const avatarId = Number(context.query.avatar_id)
    return Number.isInteger(avatarId) && avatarId > 0 ? avatarId : 1
}

export const player: RpgPlayerHooks = {
    props: {
        agentMode: { $default: true, $syncWithClient: true, $permanent: false },
        agentSpeech: { $default: '', $syncWithClient: true, $permanent: false },
        agentState: { $default: 'agent', $syncWithClient: true, $permanent: false },
        avatarId: {
            $default: 1,
            $syncWithClient: true,
            $permanent: false,
        },
        defeated: { $default: false, $syncWithClient: true, $permanent: false },
    },
    async onConnected(player: RpgPlayer) {
        player.name = '体验用户'
        player.setGraphic('liukanshan')
        const actionPlayer = player as RpgPlayer & { on(event: string, callback: () => void): void }
        actionPlayer.on('revive', () => revivePlayer(player))
        initializeCombatPlayer(player)
        initializeStarterWeapon(player)
        await player.changeMap('nature-open-world', 'start')
    },
    onJoinMap(player: RpgPlayer) {
        const synchronizedPlayer = player as RpgPlayer & {
            agentMode: (() => boolean) & { set(value: boolean): void }
            authToken?: string
        }
        // The initial map join happens before onAccepted provides the
        // connection context. Wait for the application token before starting
        // autonomy because it reports presence immediately.
        if (synchronizedPlayer.agentMode() && synchronizedPlayer.authToken) enableAgent(player as any)
    },
    onInput(player: RpgPlayer, data: any) {
        const action = String(data?.action ?? data?.input ?? '')
        if (action === 'escape') {
            const openMenu = (player as any)._gui?.['rpg-main-menu']
            if (!openMenu) void player.callMainMenu()
            return
        }
        handleAutonomyInput(player as any, data, { toggleAgent, takeControl })
    },
    onLeaveMap(player: RpgPlayer) {
        disposeAgent(player as any)
    },
    onDisconnected(player: RpgPlayer) {
        disposeAgent(player as any)
        clearRespawnTimer(player)
        stopPresenceHeartbeat(player)
    },
    onAccepted(player: RpgPlayer, context: RpgPlayerConnectionContext) {
        const avatarId = avatarIdFromContext(context)
        const profile = profiles[avatarId as keyof typeof profiles] || profiles[1]
        const shortId = String(player.id).slice(-4).toUpperCase()
        const synchronizedPlayer = player as RpgPlayer & {
            avatarId: AvatarIdSignal
            agentMode: (() => boolean) & { set(value: boolean): void }
        }
        synchronizedPlayer.avatarId.set(avatarId)
        ;(player as any).authToken = String(context.query.token || '')
        player.name = `${profile.name} · ${shortId}`
        player.setGraphic(profile.graphic)
        startPresenceHeartbeat(player)
        // onAccepted also runs for the lobby connection. Only gameplay maps
        // expose a movement manager; a failed room transfer must not start
        // autonomous movement against the lobby's incomplete physics API.
        const map = (player as any).getCurrentMap?.()
        if (synchronizedPlayer.agentMode() && map?.moveManager) enableAgent(player as any)
    },
}
