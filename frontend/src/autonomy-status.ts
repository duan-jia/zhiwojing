type AutonomyModeView = {
  label: string
  hint: string
  className: string
}

export function autonomyModeView(agentMode: boolean, agentState = 'agent', connected = true): AutonomyModeView {
  if (!connected) return { label: '世界连接已断开', hint: '请检查本地服务', className: 'autonomy-mode--offline' }
  if (!agentMode || agentState === 'human') {
    return { label: '真人控制中', hint: '按 G 交给分身', className: 'autonomy-mode--human' }
  }
  if (agentState === 'degraded') {
    return { label: '本地巡游中', hint: '模型暂不可用，正在恢复', className: 'autonomy-mode--degraded' }
  }
  return { label: '分身托管中', hint: '按 G 真人接管', className: 'autonomy-mode--agent' }
}

function readAgentMode(player: any): boolean | null {
  if (!player || player.agentMode === undefined) return null
  return Boolean(typeof player.agentMode === 'function' ? player.agentMode() : player.agentMode)
}

export function setupAutonomyStatus(engine: any) {
  const root = document.querySelector<HTMLElement>('#autonomy-mode')
  const label = root?.querySelector<HTMLElement>('.autonomy-mode__label')
  const hint = root?.querySelector<HTMLElement>('.autonomy-mode__hint')
  let renderedKey = ''
  let connected = true

  return {
    setConnected(value: boolean) {
      connected = value
      renderedKey = ''
    },
    step() {
      if (!root || !label || !hint) return
      const mode = readAgentMode(engine.sceneMap?.getCurrentPlayer?.())
      if (mode === null && connected) {
        root.hidden = true
        renderedKey = ''
        return
      }
      const player = engine.sceneMap?.getCurrentPlayer?.()
      const state = String(typeof player?.agentState === 'function' ? player.agentState() : player?.agentState ?? 'agent')
      const key = `${connected}:${mode}:${state}`
      if (key === renderedKey && !root.hidden) return

      const view = autonomyModeView(mode ?? true, state, connected)
      label.textContent = view.label
      hint.textContent = view.hint
      root.classList.remove('autonomy-mode--agent', 'autonomy-mode--human', 'autonomy-mode--degraded', 'autonomy-mode--offline')
      root.classList.add(view.className)
      root.hidden = false
      renderedKey = key
    },
  }
}
