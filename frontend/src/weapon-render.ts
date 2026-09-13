import { RpgClientEngine, inject } from '@rpgjs/client'
import { Container, Sprite, computed, h, useDefineEmits, useDefineProps, useProps } from 'canvasengine'

function read(value: any) { return typeof value === 'function' ? value() : value }

export function EquippedWeaponSprite($$props: any) {
  useProps($$props)
  const defineProps = useDefineProps($$props)
  useDefineEmits($$props)
  const { object } = defineProps()
  const engine = inject(RpgClientEngine)
  const sprite = object?.()
  const visible = computed(() => {
    if (!sprite || (typeof sprite.isEvent === 'function' && sprite.isEvent())) return false
    const equipments = read(sprite.equipments) ?? []
    return equipments.some((item: any) => (read(item?.id) ?? item?.id) === 'pensord')
  })
  const direction = computed(() => String(read(sprite?.direction) ?? 'down'))
  const sheet = computed(() => ({ definition: engine.getSpriteSheet('pensord-icon'), playing: 'default' }))
  const placement = computed(() => {
    switch (direction()) {
      case 'up': return { x: 11, y: -18, rotation: Math.PI * 0.1 }
      case 'left': return { x: -18, y: 3, rotation: -Math.PI * 0.45 }
      case 'right': return { x: 18, y: 3, rotation: Math.PI * 0.45 }
      default: return { x: 11, y: 18, rotation: Math.PI * 0.9 }
    }
  })
  return h(Container, { visible, zIndex: 20 }, [
    h(Sprite, { sheet, anchor: [0.5, 0.5], x: computed(() => placement().x), y: computed(() => placement().y), rotation: computed(() => placement().rotation), scale: 0.7 }),
  ])
}
