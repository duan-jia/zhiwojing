type AutonomyInputHandlers<Player> = {
    toggleAgent(player: Player): void
    takeControl(player: Player): void
    setDialoguePaused?(player: Player, avatarId: number, paused: boolean): void
}

export function handleAutonomyInput<Player>(
    player: Player,
    data: any,
    handlers: AutonomyInputHandlers<Player>,
) {
    const action = String(data?.action ?? data?.input ?? '')
    if (action === 'agentToggle') handlers.toggleAgent(player)
    else if ((action === 'dialogueOpen' || action === 'dialogueClose') && Number.isInteger(Number(data?.avatar_id))) {
        handlers.setDialoguePaused?.(player, Number(data.avatar_id), action === 'dialogueOpen')
    }
    else if (isDelegated(player) && (action === 'takeControl' || ['up', 'down', 'left', 'right'].includes(action) || data?.direction)) {
        handlers.takeControl(player)
    }
}

function isDelegated(player: any): boolean {
    const mode = player?.agentMode
    return Boolean(typeof mode === 'function' ? mode() : mode)
}
