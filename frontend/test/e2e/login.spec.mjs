import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
const children = []
test.beforeAll(async () => {
  for (const [args, env] of [
    [['dist/server/node-server.js'], { RPGJS_PORT: '18201', AUTH_REQUIRED: '0' }],
    [['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '18202'], { RPG_TYPE: 'mmorpg', VITE_E2E: 'true', VITE_API_URL: 'http://127.0.0.1:18202', VITE_RPGJS_SERVER_HOST: '127.0.0.1:18201' }],
  ]) children.push(spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' }))
  await expect.poll(async () => {
    try { return (await fetch('http://127.0.0.1:18202')).status } catch { return 0 }
  }, { timeout: 20000 }).toBe(200)
})
test.afterAll(async () => {
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(children.map(child => child.exitCode === null ? once(child, 'exit') : undefined))
})
for (const width of [1280, 390]) {
  test(`guest retry enters world at width ${width}`, async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 800 })
    let attempts = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/guest') return route.fulfill({ status: ++attempts === 1 ? 503 : 200, json: { token: 'test-guest', user: { id: 4, name: '游客' } } })
      return route.fulfill({ json: path === '/api/oauth/status' ? { integrationReady: false } : { contacts: [], unread: 0 } })
    })
    await page.goto('http://127.0.0.1:18202')
    await page.locator('.enter-game-button').click()
    await expect(page.locator('.login-status')).toHaveText('游客登录失败，请稍后重试。')
    await page.locator('.enter-game-button').click()
    await expect(page.locator('#login-root')).toBeHidden()
    await expect(page.locator('#rpg')).toBeVisible()
    await page.waitForFunction(() => {
      const s = window.__ZHIWOJING_E2E__?.snapshot()
      return s?.currentId && Number.isFinite(s.players[s.currentId]?.x)
    })
    const position = () => page.evaluate(() => {
      const s = window.__ZHIWOJING_E2E__.snapshot()
      return { x: s.players[s.currentId].x, y: s.players[s.currentId].y }
    })
    const before = await position()
    await page.keyboard.down('ArrowRight')
    await expect.poll(position).not.toEqual(before)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`guest-${width}.png`) })
  })
}
