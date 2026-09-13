function isEditableTarget(target: any): boolean {
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
}

export function isAttackKey(event: any): boolean {
  return !event.repeat && !isEditableTarget(event.target) && String(event.key).toLowerCase() === 'j'
}

export function processCombatKey(engine: any, event: any): boolean {
  if (!isAttackKey(event)) return false
  engine.processAction('action')
  event.preventDefault?.()
  return true
}
