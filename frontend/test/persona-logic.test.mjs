import test from 'node:test'
import assert from 'node:assert/strict'
import { personaError, personaView } from '../src/persona-logic.mjs'

test('personaView normalizes API data', () => {
  assert.deepEqual(personaView({ domains: ['AI'], interest_tags: ['阅读'], summary: '我'.repeat(220) }), { domains: ['AI'], tags: ['阅读'], summary: '我'.repeat(200) })
})

test('personaError explains missing configuration', () => {
  assert.match(personaError({ detail: { code: 'ZHIHU_NOT_CONFIGURED' } }, 503), /尚未配置/)
})
