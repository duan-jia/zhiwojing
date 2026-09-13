import type {
    RpgPlayer,
    RpgPlayerConnectionContext,
    RpgPlayerHooks,
} from '@rpgjs/server'
import { disposeAgent, enableAgent, takeControl, toggleAgent } from './autonomy.ts'
import { handleAutonomyInput } from './player-input.ts'
import { clearRespawnTimer, initializeCombatPlayer, revivePlayer } from './combat'

const profiles = {
    1: { name: '体验用户', graphic: 'hero' },
    2: { name: '苏晚', graphic: 'female' },
    3: { name: '周博', graphic: 'hero' },
} as const
const API_URL = (typeof process !== 'undefined' && process.env.AVATAR_API_URL) || 'http://127.0.0.1:8000'

function presence(userId: number, online: boolean, humanControlled: boolean) {
    void fetch(`${API_URL}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, online, human_controlled: humanControlled }) })
        .catch(error => console.warn('presence update failed', error))
}

type AvatarIdSignal = (() => number) & { set(value: number): void }

function avatarIdFromContext(context: RpgPlayerConnectionContext): 1 | 2 | 3 {
    const avatarId = Number(context.query.avatar_id)
    return avatarId === 2 || avatarId === 3 ? avatarId : 1
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
        player.setGraphic('hero')
        const actionPlayer = player as RpgPlayer & { on(event: string, callback: () => void): void }
        actionPlayer.on('revive', () => revivePlayer(player))
        initializeCombatPlayer(player)
        await player.changeMap('nature-open-world', 'start')
    },
    onJoinMap(player: RpgPlayer) {
        const synchronizedPlayer = player as RpgPlayer & {
            agentMode: (() => boolean) & { set(value: boolean): void }
        }
        if (synchronizedPlayer.agentMode()) enableAgent(player as any)
    },
    onInput(player: RpgPlayer, data: any) {
        handleAutonomyInput(player as any, data, { toggleAgent, takeControl })
    },
    onLeaveMap(player: RpgPlayer) {
        disposeAgent(player as any)
    },
    onDisconnected(player: RpgPlayer) {
        disposeAgent(player as any)
        clearRespawnTimer(player)
        const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal }
        presence(synchronizedPlayer.avatarId(), false, false)
    },
    onAccepted(player: RpgPlayer, context: RpgPlayerConnectionContext) {
        const avatarId = avatarIdFromContext(context)
        const profile = profiles[avatarId]
        const shortId = String(player.id).slice(-4).toUpperCase()
        const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal }
        synchronizedPlayer.avatarId.set(avatarId)
        player.name = `${profile.name} · ${shortId}`
        player.setGraphic(profile.graphic)
        presence(avatarId, true, false)
    },
}
