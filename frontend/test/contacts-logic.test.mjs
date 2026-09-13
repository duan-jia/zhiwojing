import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/contacts.ts', import.meta.url), 'utf8')
test('contact logic totals unread and explains capped delivery', () => {
  assert.match(source, /reduce\(\(sum, item\) => sum \+ item\.unread/)
  assert.match(source, /连续回复已达上限/)
  assert.match(source, /setInterval\(refresh, 5_000\)/)
  assert.doesNotMatch(source, /重新添加|\/restore|status: 'active' \| 'removed'/)
  assert.match(source, /active = null; await refresh\(\)/)
})
