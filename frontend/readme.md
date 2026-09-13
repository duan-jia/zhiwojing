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
