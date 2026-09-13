import { test, expect, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'

const API_PORT = 18100
const WORLD_PORT = 18101
const WEB_PORT = 18102
const processes = []
const debugPages = []
let fakeApi
let failSteps = false
let stepDelayMs = 0
let activeSteps = 0
let maxActiveSteps = 0

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': `http://127.0.0.1:${WEB_PORT}`,
    'access-control-allow-credentials': 'true',
  })
  response.end(JSON.stringify(body))
}

async function waitFor(url, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stderr.on('data', chunk => { output += String(chunk) })
  child.output = () => output
  processes.push(child)
  return child
}

async function enterWorld(context, avatarId) {
  const page = await context.newPage()
  debugPages.push(page)
  await page.goto(`http://127.0.0.1:${WEB_PORT}`)
  if (avatarId !== 1) await page.locator(`[data-avatar-id="${avatarId}"]`).click()
  await page.locator('.enter-game-button').click()
  await page.waitForFunction(() => {
    const snapshot = window.__ZHIWOJING_E2E__?.snapshot()
    return snapshot?.currentId && snapshot.players[snapshot.currentId]
  })
  return page
}

async function snapshot(page) {
  return page.evaluate(() => window.__ZHIWOJING_E2E__.snapshot())
}

function connectedPlayerCount(state) {
  return Object.values(state.players).filter(player => player.isConnected).length
}

test.beforeAll(async () => {
  fakeApi = createServer((request, response) => {
    if (request.method === 'OPTIONS') return json(response, 200, {})
    if (request.url === '/api/health') return json(response, 200, { status: 'ok' })
    if (request.url === '/api/oauth/status') return json(response, 200, { configured: false, integrationReady: false })
    if (request.url === '/api/zhihu/hot') return json(response, 200, { items: [{
      title: '全景热榜交互验证',
      url: 'https://www.zhihu.com/question/1',
      thumbnailUrl: '',
      summary: '新热榜建筑门口可正常打开内容',
    }] })
    if (request.url === '/api/agent/step') {
      if (failSteps) return json(response, 503, { detail: { code: 'TEST_UNAVAILABLE' } })
      activeSteps += 1
      maxActiveSteps = Math.max(maxActiveSteps, activeSteps)
      return setTimeout(() => {
        activeSteps -= 1
        json(response, 200, { action: 'move', to: { x: 29, y: 25, name: '集市' } })
      }, stepDelayMs)
    }
    if (request.url === '/api/agent/chat') return json(response, 200, { response: '你好，继续散步吧。' })
    return json(response, 404, { error: 'not_found' })
  })
  fakeApi.listen(API_PORT, '127.0.0.1')
  await once(fakeApi, 'listening')

  const world = start(process.execPath, ['dist/server/node-server.js'], {
    RPGJS_HOST: '127.0.0.1', RPGJS_PORT: String(WORLD_PORT), AVATAR_API_URL: `http://127.0.0.1:${API_PORT}`,
  })
  const vite = start('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(WEB_PORT)], {
    RPG_TYPE: 'mmorpg', VITE_E2E: 'true', VITE_CAMERA_ZOOM: '1', VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
    VITE_RPGJS_SERVER_HOST: `127.0.0.1:${WORLD_PORT}`,
  })
  try {
    await Promise.all([
      waitFor(`http://127.0.0.1:${WORLD_PORT}/health`),
      waitFor(`http://127.0.0.1:${WEB_PORT}`),
    ])
    // Let Vite finish first-load dependency optimization before the real session.
    const warmBrowser = await chromium.launch()
    const warmPage = await warmBrowser.newPage()
    await warmPage.goto(`http://127.0.0.1:${WEB_PORT}`)
    await warmPage.waitForTimeout(2500)
    await warmBrowser.close()
  } catch (error) {
    throw new Error(`${error.message}\nWORLD:\n${world.output()}\nVITE:\n${vite.output()}`)
  }
})

test.afterAll(async () => {
  for (const child of processes) child.kill('SIGTERM')
  await Promise.all(processes.map(child => child.exitCode === null ? once(child, 'exit') : undefined))
  await new Promise(resolve => fakeApi.close(resolve))
})

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return
  for (const page of debugPages) {
    if (!page.isClosed()) {
      try { console.error(JSON.stringify(await snapshot(page), null, 2)) } catch {}
    }
  }
  for (const child of processes) console.error(child.output())
})

test('six buildings load without legacy markers and hot-list interaction works', async () => {
  test.setTimeout(240000)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 2200, height: 1700 } })
  try {
    const page = await enterWorld(context, 1)
    await expect.poll(async () => {
      const s = await snapshot(page)
      return Object.entries(s.events).filter(([id, event]) => id.startsWith('town-building-') && event.graphicBounds?.width > 100).length
    }, {timeout:30000}).toBe(6)
    await page.waitForTimeout(500)
    await page.screenshot({path: '../docs/town-installed-desktop.png'})
    const s = await snapshot(page)
    for (const id of ['home','hot','book','wendao','write','tiangong']) expect(s.events['town-building-' + id]).toBeTruthy()
    for (const id of ['landmark-hot-square','landmark-user-home']) {
      expect(s.events[id]).toBeTruthy()
      expect(s.events[id].graphicBounds?.width).toBe(1)
      expect(s.events[id].graphicBounds?.height).toBe(1)
    }
    await page.evaluate(async () => {
      const { openLandmarkPanel } = await import('/src/landmark-panel.ts')
      openLandmarkPanel({
        id: 'landmark-hot-square', name: '热榜广场', x: 928, y: 608, kind: 'hot-square',
      })
    })
    await expect(page.locator('#landmark-root')).toBeVisible()
    await expect(page.locator('#landmark-title')).toHaveText('热榜广场')
    await expect(page.locator('.hot-item strong')).toHaveText('全景热榜交互验证')
    await page.keyboard.press('Escape')
    await page.setViewportSize({width:390,height:844})
    await page.waitForTimeout(500)
    await page.screenshot({path: '../docs/town-installed-mobile.png'})
  } finally { await context.close(); await browser.close() }
})
