type AutonomyInputHandlers<Player> = {
    toggleAgent(player: Player): void
    takeControl(player: Player): void
}

export function handleAutonomyInput<Player>(
    player: Player,
    data: any,
    handlers: AutonomyInputHandlers<Player>,
) {
    const action = String(data?.action ?? data?.input ?? '')
    if (action === 'agentToggle') handlers.toggleAgent(player)
    else if (action === 'takeControl' || ['up', 'down', 'left', 'right'].includes(action) || data?.direction) {
        handlers.takeControl(player)
    }
}
