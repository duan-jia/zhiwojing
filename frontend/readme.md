# RPG JS Game

This is a project template for [RPGJS](https://rpgjs.dev) apps. It lives at https://github.com/rpgjs/starter/tree/v5.

To create a new project based on this template using [degit](https://github.com/Rich-Harris/degit):

```bash
npx degit rpgjs/starter#5 rpg-app
cd rpg-app
```
## Get started

Install the dependencies...

```bash
cd rpg-app
npm install
npm run dev
```

Navigate to [localhost:5173](http://localhost:5173). You should see your game running. Edit a file in `src`, save it, and reload the page to see your changes.


## Production

### Build with NodeJS

```bash
NODE_ENV=production npm run build
```

Verify that root and subpath production servers can load the sample Tiled map
and bundled UI theme:

```bash
npm run test:production
```

## Resources

[Documentation](https://v5.rpgjs.dev)

## Credits for Sample package assets

### Graphics

[Pipoya](https://pipoya.itch.io)
# CSS reset and text colors

`index.html` imports `@rpgjs/ui-css/reset.css`, whose global `body` rule uses white text. Do not rely on inherited text color for application UI: every light-background panel or control in `login.css` must set an explicit dark `color`. Dark game HUDs, status overlays, prompts, and blue message bubbles should continue to set white text explicitly.

## 小镇地图与镜头

`src/tiled/nature-open-world.tmx` 是 64×48、每格 32×32 px 的 Tiled 地图。图层按
`Ground`（草地底色）、`Terrain`（道路/水）、`Buildings`（五栋建筑外观）、
`Nature`（树木/石块）排列，`Objects` 保存出生点与文字招牌坐标。坐标均以地图左上角
为原点；代码中的像素坐标等于格坐标乘 32。中央广场为 x=23..34、y=19..28；出生点
为 (29,26)。建筑仅作外观，门前道路可通行；水、树和建筑瓦片带碰撞。

镜头默认缩放为 **2×**，可在构建/启动前通过 `VITE_CAMERA_ZOOM` 调整，例如
`VITE_CAMERA_ZOOM=1.5 npm run dev`。此项只改变镜头，不改变 32×32 角色或地图坐标。
地图源需要调整时运行 `npm run build:map`，并同步修改 `landmarks.ts`、服务端事件和
`modules/main/autonomy.ts` 中的地点。
# 战斗操作

- `J`：普攻；700ms 内连续输入可打出三段连击。
- `Shift`：短距闪避（含短暂无敌帧）。
- 按住 `F`：正面格挡；起手瞬间可招架并强化下一次反击。
- 按住 `K`、松开：蓄力攻击（300–900ms）。`E` 保留给地标互动。
- 输入框或可编辑面板聚焦时不会触发上述战斗按键。
