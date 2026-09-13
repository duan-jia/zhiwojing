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
    'access-control-allow-origin': '*',
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
    RPG_TYPE: 'mmorpg', VITE_E2E: 'true', VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
    VITE_RPGJS_SERVER_HOST: `127.0.0.1:${WORLD_PORT}`,
  })
  try {
    await Promise.all([
      waitFor(`http://127.0.0.1:${WORLD_PORT}/health`),
      waitFor(`http://127.0.0.1:${WEB_PORT}`),
    ])
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

test('two clients render delegated movement, G takeover, and degraded patrol', async () => {
  test.setTimeout(60_000)
  const browser = await chromium.launch()
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const contextC = await browser.newContext()
  try {
    const [pageA, pageB] = await Promise.all([
      enterWorld(contextA, 1),
      enterWorld(contextB, 2),
    ])
    const beforeA = await snapshot(pageA)
    await pageB.waitForFunction(id => Boolean(window.__ZHIWOJING_E2E__?.snapshot().players[id]), beforeA.currentId)
    const origin = beforeA.players[beforeA.currentId]
    await Promise.all([
      expect.poll(async () => {
        const current = await snapshot(pageA)
        const after = current.players[current.currentId]
        return Math.hypot(after.x - origin.x, after.y - origin.y)
      }, { timeout: 10_000 }).toBeGreaterThan(8),
      expect.poll(async () => {
        const observer = await snapshot(pageB)
        const after = observer.players[beforeA.currentId]
        if (!after) return 0
        return Math.hypot(after.x - origin.x, after.y - origin.y)
      }, { timeout: 10_000 }).toBeGreaterThan(8),
    ])

    await pageA.keyboard.press('g')
    await expect(pageA.locator('.autonomy-mode__label')).toHaveText('真人控制中')
    await expect.poll(async () => (await snapshot(pageA)).players[beforeA.currentId].agentMode).toBe(false)

    await pageA.keyboard.down('ArrowRight')
    await pageA.waitForTimeout(250)
    await pageA.keyboard.up('ArrowRight')
    await pageA.keyboard.press('g')
    await expect(pageA.locator('.autonomy-mode__label')).toHaveText('分身托管中')
    const delegatedAgain = await snapshot(pageA)
    const delegatedOrigin = delegatedAgain.players[delegatedAgain.currentId]
    await Promise.all([
      expect.poll(async () => {
        const current = await snapshot(pageA)
        const after = current.players[current.currentId]
        return Math.hypot(after.x - delegatedOrigin.x, after.y - delegatedOrigin.y)
      }, { timeout: 10_000 }).toBeGreaterThan(8),
      expect.poll(async () => {
        const observer = await snapshot(pageB)
        const after = observer.players[beforeA.currentId]
        if (!after) return 0
        return Math.hypot(after.x - delegatedOrigin.x, after.y - delegatedOrigin.y)
      }, { timeout: 10_000 }).toBeGreaterThan(8),
    ])

    failSteps = true
    const pageC = await enterWorld(contextC, 3)
    await expect(pageC.locator('.autonomy-mode__label')).toHaveText('本地巡游中')
    await expect.poll(async () => {
      const current = await snapshot(pageC)
      return current.movement[current.currentId]?.distance ?? 0
    }, { timeout: 10_000 }).toBeGreaterThan(8)
  } catch (error) {
    for (const page of debugPages) {
      if (!page.isClosed()) console.error(JSON.stringify(await snapshot(page), null, 2))
    }
    throw error
  } finally {
    await contextA.close()
    await contextB.close()
    await contextC.close()
    await browser.close()
  }
})

test('ten delegated clients cap model traffic and reconnect without ghosts', async () => {
  test.setTimeout(90_000)
  failSteps = false
  stepDelayMs = 500
  maxActiveSteps = 0
  const browser = await chromium.launch()
  const contexts = await Promise.all(Array.from({ length: 10 }, () => browser.newContext()))
  try {
    const pages = await Promise.all(contexts.map((context, index) => enterWorld(context, (index % 3) + 1)))
    await expect.poll(() => maxActiveSteps, { timeout: 10_000 }).toBe(3)
    expect((await fetch(`http://127.0.0.1:${WORLD_PORT}/health`)).ok).toBe(true)

    await Promise.all(contexts.slice(1).map(context => context.close()))
    await expect.poll(async () => connectedPlayerCount(await snapshot(pages[0])), {
      timeout: 10_000,
    }).toBe(1)

    for (let index = 0; index < 10; index += 1) {
      await pages[0].reload({ waitUntil: 'domcontentloaded' })
      await pages[0].locator('.enter-game-button').click()
      await pages[0].waitForTimeout(300)
    }
    await pages[0].waitForFunction(() => {
      const state = window.__ZHIWOJING_E2E__?.snapshot()
      return state?.currentId && state.players[state.currentId]
    }, undefined, { timeout: 15_000 })
    await expect.poll(async () => connectedPlayerCount(await snapshot(pages[0])), {
      timeout: 10_000,
    }).toBe(1)
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})))
    await browser.close()
    stepDelayMs = 0
  }
})

test('native NPC patrol moves left and right on the same row', async () => {
  test.setTimeout(60000)
  const browser = await chromium.launch()
  const context = await browser.newContext()
  try {
    const page = await enterWorld(context, 1)
    await page.keyboard.press('g')
    const samples = []
    for (let i = 0; i < 80; i++) {
      const state = await snapshot(page)
      const npc = Object.values(state.events).find(event => event.name === '苏晚')
      if (npc) samples.push(npc)
      await page.waitForTimeout(150)
    }
    expect(samples.length).toBeGreaterThan(60)
    expect(samples.every(p => Math.abs(p.y - 800) < 2)).toBe(true)
    expect(Math.max(...samples.map(p => p.x)) - Math.min(...samples.map(p => p.x))).toBeGreaterThan(40)
    expect(samples.some((p, i) => i && p.x < samples[i - 1].x - 1)).toBe(true)
    expect(samples.some((p, i) => i && p.x > samples[i - 1].x + 1)).toBe(true)
    await page.screenshot({ path: 'test-results/npc-patrol.png' })
  } finally {
    await context.close()
    await browser.close()
  }
})
