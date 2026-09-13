import { RpgClientEngine, inject } from '@rpgjs/client'
import { Container, Graphics, Text, computed, h, useDefineEmits, useDefineProps, useProps } from 'canvasengine'
import { remotePlayerHealthView } from './combat-hud-logic'

function read(value: any) { return typeof value === 'function' ? value() : value }

export function RemotePlayerHealth($$props: any) {
  useProps($$props)
  const defineProps = useDefineProps($$props)
  useDefineEmits($$props)
  const { object } = defineProps()
  const engine = inject(RpgClientEngine)
  const sprite = object?.()
  const isRemotePlayer = computed(() => {
    const id = String(read(sprite?.id) ?? '')
    return Boolean(id) && id !== String(engine.playerIdSignal?.() ?? engine.playerId ?? '') && !(typeof sprite?.isEvent === 'function' && sprite.isEvent())
  })
  const health = computed(() => remotePlayerHealthView(
    read(sprite?.hpSignal ?? sprite?.hp),
    read(sprite?.defeated),
    read(sprite?.param?.maxHp ?? sprite?.maxHp ?? 100),
  ))
  const top = computed(() => {
    const bounds = sprite?.__rpgjsGraphicBounds?.()
    return Number.isFinite(bounds?.top) ? bounds.top - 18 : -50
  })
  const draw = (graphics: any) => {
    graphics.clear()
    if (!isRemotePlayer()) return
    const state = health()
    const width = 52
    graphics.roundRect(-width / 2 - 1, -1, width + 2, 8, 2).fill({ color: 0x171717, alpha: .9 })
    graphics.roundRect(-width / 2, 0, width, 6, 1).fill({ color: 0x4a2020, alpha: .95 })
    if (state.percent > 0) graphics.roundRect(-width / 2, 0, width * state.percent / 100, 6, 1).fill({ color: state.isDown ? 0x777777 : 0xd94b45 })
  }
  const text = computed(() => isRemotePlayer() ? health().label : '')
  const style = computed(() => ({ fontFamily: 'monospace', fontSize: 9, fontWeight: '700', fill: health().isDown ? '#ffd1cc' : '#ffffff', stroke: { color: '#171717', width: 3 } }))

  return h(Container, { x: computed(() => (read(sprite?.hitbox)?.w ?? 32) / 2), y: top, zIndex: 1000 }, [
    h(Graphics, { draw }),
    h(Text, { text, anchor: [.5, 1], y: -3, style }),
  ])
}
