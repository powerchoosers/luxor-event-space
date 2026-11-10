'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadCatalog() {
  const file = path.join(root, 'src/lib/luxorSystemWorkflowCatalog.ts')
  const loaded = new Module(file, module)
  loaded.filename = file
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file)
  return loaded.exports.SYSTEM_WORKFLOWS.map(([id]) => id)
}

function loadSafeLink() {
  const file = path.join(root, 'src/lib/luxorWorkflowLink.ts')
  const loaded = new Module(file, module)
  loaded.filename = file
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file)
  return loaded.exports.isSafeWorkflowLink
}

test('every catalog workflow has contacts progress coverage', () => {
  const contacts = fs.readFileSync(path.join(root, 'src/app/api/marketing/system-messages/contacts/route.ts'), 'utf8')
  const sourceIds = [...contacts.matchAll(/'(system-[^']+)':\s*\{/g)].map((match) => match[1])
  const phoneIds = [...contacts.matchAll(/'(system-phone-[^']+)':/g)].map((match) => match[1])
  const special = ['system-calendar-messages', 'system-proposal-breakdown']
  const covered = new Set([...sourceIds, ...phoneIds, ...special])
  for (const id of loadCatalog()) {
    assert.ok(covered.has(id), `Missing contacts/progress wiring for ${id}`)
  }
})

test('every catalog workflow has a safe editor link', () => {
  const isSafeWorkflowLink = loadSafeLink()
  for (const id of loadCatalog()) {
    assert.equal(isSafeWorkflowLink(`/portal/marketing/custom-workflows/${id}`), true, `Unsafe or missing safe-link pattern for ${id}`)
  }
})
