import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deliveryNotice, totalUnread } from '../src/contacts-logic.mjs'

const source = await readFile(new URL('../src/contacts.ts', import.meta.url), 'utf8')
test('contact logic totals unread across contacts', () => {
  assert.equal(totalUnread([{ unread: 2 }, { unread: 0 }, { unread: 5 }]), 7)
  assert.equal(totalUnread([]), 0)
})

test('contact logic explains only capped delivery', () => {
  assert.match(deliveryNotice({ delivered: 'capped' }), /连续回复已达上限/)
  assert.match(deliveryNotice({ delivered: 'agent', capped: true }), /连续回复已达上限/)
  assert.equal(deliveryNotice({ delivered: 'agent', capped: false }), '')
  assert.equal(deliveryNotice({ delivered: 'human' }), '')
})

test('contacts UI retains polling and mutual-delete behavior', () => {
  assert.match(source, /setInterval\(refresh, 5_000\)/)
  assert.doesNotMatch(source, /重新添加|\/restore|status: 'active' \| 'removed'/)
  assert.match(source, /active = null; await refresh\(\)/)
})
