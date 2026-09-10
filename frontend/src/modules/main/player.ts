import { RpgPlayer, type RpgPlayerHooks } from '@rpgjs/server'

export const player: RpgPlayerHooks = {
    async onConnected(player: RpgPlayer) {
        player.name = '旅人'
        player.setGraphic('hero')
        await player.changeMap('nature-open-world', 'start')
    }
}
