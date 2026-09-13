function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element && (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable
  ))
}

type ClientEngine = {
  stopProcessingInput?: boolean
  processAction(action: { action: string }): void
}

const CONTROL_HINTS = `
  <div class="rpg-ui-main-menu-section-title">操作按键</div>
  <div class="rpg-ui-control-hints" aria-label="操作按键提示">
    <div class="rpg-ui-control-hint"><kbd>WASD / 方向键</kbd><span>移动</span></div>
    <div class="rpg-ui-control-hint"><kbd>G</kbd><span>切换托管</span></div>
    <div class="rpg-ui-control-hint"><kbd>B</kbd><span>我的分身</span></div>
    <div class="rpg-ui-control-hint"><kbd>E</kbd><span>互动</span></div>
  </div>
`

export function mountControlHints(root: ParentNode = document): boolean {
  const panel = root.querySelector<HTMLElement>('.rpg-ui-main-menu-right > .rpg-ui-panel')
  if (!panel || panel.querySelector('.rpg-ui-control-hints')) return false
  panel.insertAdjacentHTML('afterbegin', CONTROL_HINTS)
  return true
}

export function processMenuKey(engine: ClientEngine, event: KeyboardEvent): boolean {
  if (
    event.key !== 'Escape'
    || event.repeat
    || isEditableTarget(event.target)
  ) return false

  const menuClose = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLButtonElement>('.rpg-ui-main-menu .rpg-ui-close-button')
  event.preventDefault()
  if (menuClose) {
    menuClose.click()
    return true
  }
  if (engine.stopProcessingInput) return false
  engine.processAction({ action: 'escape' })
  return true
}

export function setupMenuInput(engine: ClientEngine) {
  const onKeyDown = (event: KeyboardEvent) => { processMenuKey(engine, event) }
  const observer = new MutationObserver(() => { mountControlHints() })
  window.addEventListener('keydown', onKeyDown, true)
  observer.observe(document.body, { childList: true, subtree: true })
  mountControlHints()
  return {
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown, true)
      observer.disconnect()
    },
  }
}
