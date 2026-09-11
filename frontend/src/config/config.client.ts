import { provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { provideMain } from "../modules/main";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { avatarIdForSprite, openAvatarChat } from '../chat'

export default {
  providers: [
    provideTiledMap({
      basePath: "map",
    }),
    provideClientGlobalConfig({
      keyboardControls: {
        up: ['up', 'w'],
        down: ['down', 's'],
        left: ['left', 'a'],
        right: ['right', 'd'],
        action: ['space', 'enter'],
      },
    }),
    provideMain(),
    provideClientModules([
      {
        engine: {
          onStart(engine) {
            engine.interactions.use(
              ({ sprite }) => avatarIdForSprite(sprite) !== null,
              {
                cursor: 'pointer',
                click: ({ sprite }) => {
                  const avatarId = avatarIdForSprite(sprite)
                  if (avatarId !== null) openAvatarChat(avatarId)
                },
              },
            )
          },
        },
        spritesheets: [
          {
            id: 'hero',
            image: 'spritesheets/hero.png',
            ...Presets.RMSpritesheet(3, 4)
          },
          {
            id: 'female',
            image: 'spritesheets/female.png',
             ...Presets.RMSpritesheet(3, 4)
          }
        ]
      }
    ])
  ],
};
