export const pensordWeapon = {
  id: 'pensord',
  name: '金色长剑',
  description: '用于测试战斗反馈的像素长剑。',
  icon: 'spritesheets/pensord-32.png',
  price: 0,
  _type: 'weapon' as const,
  attackProfile: {
    id: 'pensord-basic',
    damageMultiplier: 1.25,
    startupMs: 70,
    activeMs: 110,
    recoveryMs: 180,
    hitboxes: {
      up: { offsetX: -16, offsetY: -48, width: 32, height: 48 },
      down: { offsetX: -16, offsetY: 16, width: 32, height: 48 },
      left: { offsetX: -48, offsetY: -16, width: 48, height: 32 },
      right: { offsetX: 16, offsetY: -16, width: 48, height: 32 },
    },
  },
}

export function initializeStarterWeapon(player: any) {
  const item = player.getItem?.('pensord')
  if (!item) player.addItem(pensordWeapon, 1)
  const equipped = player.equipments?.() ?? []
  const alreadyEquipped = equipped.some((entry: any) => (entry?.id?.() ?? entry?.id) === 'pensord')
  if (!alreadyEquipped) player.equip('pensord', true)
}
