export function isEditableTarget(target: any): boolean {
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
}

export function mappedAutonomyAction(
  event: any,
  controls: Record<string, unknown>,
  agentMode: boolean,
  matches: (event: any, bind: unknown) => boolean,
) {
  if (event.repeat || isEditableTarget(event.target)) return null
  if (matches(event, controls.agentToggle)) return 'agentToggle'
  if (agentMode && ['up', 'down', 'left', 'right'].some(name => matches(event, controls[name]))) return 'takeControl'
  return null
}

export function processAutonomyKey(engine: any, event: any, matches: (event: any, bind: unknown) => boolean) {
  const controls = engine.globalConfig?.keyboardControls ?? {}
  const currentPlayer = engine.sceneMap?.getCurrentPlayer?.()
  const mode = typeof currentPlayer?.agentMode === 'function' ? currentPlayer.agentMode() : currentPlayer?.agentMode
  const action = mappedAutonomyAction(event, controls, Boolean(mode), matches)
  if (action) engine.processAction({ action })
  return action
}
