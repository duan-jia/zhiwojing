import type {
    RpgPlayer,
    RpgPlayerConnectionContext,
    RpgPlayerHooks,
} from '@rpgjs/server'
import { enableAgent, takeControl, toggleAgent } from './autonomy'

const profiles = {
    1: { name: '体验用户', graphic: 'hero' },
    2: { name: '苏晚', graphic: 'female' },
    3: { name: '周博', graphic: 'hero' },
} as const

type AvatarIdSignal = (() => number) & { set(value: number): void }

function avatarIdFromContext(context: RpgPlayerConnectionContext): 1 | 2 | 3 {
    const avatarId = Number(context.query.avatar_id)
    return avatarId === 2 || avatarId === 3 ? avatarId : 1
}

export const player: RpgPlayerHooks = {
    props: {
        agentMode: { $default: true, $syncWithClient: true, $permanent: false },
        agentSpeech: { $default: '', $syncWithClient: true, $permanent: false },
        avatarId: {
            $default: 1,
            $syncWithClient: true,
            $permanent: false,
        },
    },
    async onConnected(player: RpgPlayer) {
        player.name = '体验用户'
        player.setGraphic('hero')
        await player.changeMap('nature-open-world', 'start')
        enableAgent(player as any)
    },
    onInput(player: RpgPlayer, data: any) {
        const input = String(data?.input ?? data?.action ?? '')
        if (input === 'agentToggle') toggleAgent(player as any)
        else if (['up', 'down', 'left', 'right'].includes(input) || data?.direction) takeControl(player as any)
    },
    onAccepted(player: RpgPlayer, context: RpgPlayerConnectionContext) {
        const avatarId = avatarIdFromContext(context)
        const profile = profiles[avatarId]
        const shortId = String(player.id).slice(-4).toUpperCase()
        const synchronizedPlayer = player as RpgPlayer & { avatarId: AvatarIdSignal }
        synchronizedPlayer.avatarId.set(avatarId)
        player.name = `${profile.name} · ${shortId}`
        player.setGraphic(profile.graphic)
    },
}
