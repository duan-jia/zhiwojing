import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import { TOWN_BUILDINGS } from '../src/town-layout.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const configFile = join(projectRoot, 'vite.config.ts')
process.env.RPG_TYPE = 'mmorpg'
const oldThemePath = '@rpgjs/ui-css/src/theme-default/theme.css'
const themePath = '@rpgjs/ui-css/theme-default/theme.css'
const themeMarker = '--rpg-ui-body-bg:'
const worldFiles = [
  'nature-open-world.tmx',
  'nature-nw.tmx',
  'nature-ne.tmx',
  'nature-sw.tmx',
  'nature-se.tmx'
]

const stylesheetUrls = (html, indexUrl) => [...html.matchAll(/<link\b[^>]*>/gi)]
  .map(([tag]) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return null
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
    return href ? new URL(href, indexUrl) : null
  })
  .filter(url => url && url.origin === indexUrl.origin)

const closePreview = server => new Promise((resolve, reject) => {
  server.httpServer.close(error => error ? reject(error) : resolve())
})

test('production previews serve maps and the UI theme at root and subpath', async () => {
  const sourceHtml = await readFile(join(projectRoot, 'index.html'), 'utf8')
  assert.equal(sourceHtml.includes(oldThemePath), false)
  assert.equal(sourceHtml.includes(themePath), true)
  await access(join(projectRoot, 'node_modules', '@rpgjs', 'ui-css', 'theme-default', 'theme.css'))

  for (const variant of [
    { name: 'root', base: '/', route: '/' },
    { name: 'subpath', base: '/quest/', route: '/quest/' }
  ]) {
    await build({
      root: projectRoot,
      configFile,
      base: variant.base
    })
    const outDir = join(projectRoot, 'dist', 'client')
    for (const fileName of worldFiles) {
      await access(join(outDir, 'map', fileName))
    }

    const server = await preview({
      root: projectRoot,
      configFile: false,
      base: variant.base,
      build: { outDir },
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: true
      }
    })

    try {
      const address = server.httpServer.address()
      assert(address && typeof address === 'object')
      const origin = new URL(`http://127.0.0.1:${address.port}`)
      const indexUrl = new URL(variant.route, origin)

      const indexResponse = await fetch(indexUrl)
      assert.equal(indexResponse.status, 200, `${variant.name} index status`)
      const builtHtml = await indexResponse.text()
      assert.doesNotMatch(builtHtml, /node_modules\/@rpgjs\/ui-css/)
      assert.match(builtHtml, /id="login-root"/)
      assert.match(builtHtml, /id="rpg" hidden/)

      for (const fileName of worldFiles) {
        const mapResponse = await fetch(new URL(`${variant.route}map/${fileName}`, origin))
        assert.equal(mapResponse.status, 200, `${variant.name} ${fileName} status`)
        assert.match(await mapResponse.text(), /<map\b/)
      }

      for (const building of TOWN_BUILDINGS) {
        const response = await fetch(new URL(`${variant.route}spritesheets/${building.image}`, origin))
        assert.equal(response.status, 200, `${variant.name} ${building.name} image`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        assert.equal(bytes[25], 6, `${building.name} RGBA source`)
      }
      for (const file of ['town-collision.tsx', 'town-collision.svg']) {
        const response = await fetch(new URL(`${variant.route}map/${file}`, origin))
        assert.equal(response.status, 200, `${variant.name} ${file}`)
      }

      const localStylesheets = stylesheetUrls(builtHtml, indexUrl)
      assert(localStylesheets.length > 0, `${variant.name} emitted no local stylesheets`)
      let fetchedTheme = false
      for (const stylesheetUrl of localStylesheets) {
        const response = await fetch(stylesheetUrl)
        assert.equal(response.status, 200, `${variant.name} stylesheet status: ${stylesheetUrl}`)
        assert.match(response.headers.get('content-type') ?? '', /^text\/css\b/)
        if ((await response.text()).includes(themeMarker)) fetchedTheme = true
      }
      assert.equal(fetchedTheme, true, `${variant.name} did not fetch the bundled default theme`)
    } finally {
      await closePreview(server)
    }
  }
})
