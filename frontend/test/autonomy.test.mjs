import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const autonomy = await readFile(new URL('../src/modules/main/autonomy.ts', import.meta.url), 'utf8')
const player = await readFile(new URL('../src/modules/main/player.ts', import.meta.url), 'utf8')
test('autonomy is transition-driven and defines nearby locations', () => {
  for (const name of ['广场', '水井', '树林', '河边', '集市']) assert.match(autonomy, new RegExp(name))
  assert.match(autonomy, /advanceAgent\(player, 'arrived'\)/)
  assert.doesNotMatch(autonomy, /setInterval/)
  assert.match(autonomy, /scheduleMeetingCheck/)
  assert.match(autonomy, /moveTimedOut/)
})
test('G toggles agent mode and movement takes control', () => {
  assert.match(player, /\.on\('agentToggle'/)
  assert.match(player, /\.on\('takeControl'/)
  assert.match(player, /takeControl/)
  assert.match(autonomy, /stopMoveTo\(\)/)
  assert.match(autonomy, /\/api\/agent\/(chat|step)/)
})
