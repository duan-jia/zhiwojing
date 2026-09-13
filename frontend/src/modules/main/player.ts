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

function presence(userId: number, token: string, online: boolean, humanControlled: boolean) {
    void fetch(`${API_URL}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ user_id: userId, online, human_controlled: humanControlled }) })
        .catch(error => console.warn('presence update failed', error))
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
        await player.changeMap('nature-open-world', 'start')
        initializeStarterWeapon(player)
    },
    onJoinMap(player: RpgPlayer) {
        const synchronizedPlayer = player as RpgPlayer & {
            agentMode: (() => boolean) & { set(value: boolean): void }
        }
        if (synchronizedPlayer.agentMode()) enableAgent(player as any)
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
        const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal }
        presence(synchronizedPlayer.avatarId(), String((player as any).authToken || ''), false, false)
    },
    onAccepted(player: RpgPlayer, context: RpgPlayerConnectionContext) {
        const avatarId = avatarIdFromContext(context)
        const profile = profiles[avatarId as keyof typeof profiles] || profiles[1]
        const shortId = String(player.id).slice(-4).toUpperCase()
        const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal }
        synchronizedPlayer.avatarId.set(avatarId)
        ;(player as any).authToken = String(context.query.token || '')
        player.name = `${profile.name} · ${shortId}`
        player.setGraphic(profile.graphic)
        presence(avatarId, String(context.query.token || ''), true, false)
    },
}
