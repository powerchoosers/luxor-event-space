'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const contacts = fs.readFileSync(path.join(root, 'src/app/api/marketing/system-messages/contacts/route.ts'), 'utf8')
const catalog = fs.readFileSync(path.join(root, 'src/lib/luxorSystemWorkflowCatalog.ts'), 'utf8')
const ids = [...catalog.matchAll(/\['(system-[^']+)'/g)].map((match) => match[1])

test('contacts route recognizes every catalog workflow key', () => {
  const sourceIds = [...contacts.matchAll(/'(system-[^']+)':\s*\{/g)].map((match) => match[1])
  const phoneIds = [...contacts.matchAll(/'(system-phone-[^']+)':/g)].map((match) => match[1])
  const specials = ['system-calendar-messages', 'system-proposal-breakdown']
  const allowed = new Set([...sourceIds, ...phoneIds, ...specials])
  for (const id of ids) {
    assert.ok(allowed.has(id), `${id} is missing from contacts route allowlist`)
  }
})
