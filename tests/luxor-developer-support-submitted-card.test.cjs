/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')

function load(file, stubs = {}) {
  const resolved = path.resolve(file)
  const m = new Module(resolved, module)
  m.filename = resolved
  m.paths = module.paths
  const old = Module._load
  Module._load = function (name, parent, isMain) {
    return name in stubs ? stubs[name] : old.call(this, name, parent, isMain)
  }
  try {
    m._compile(
      ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      m.filename,
    )
  } finally {
    Module._load = old
  }
  return m.exports
}

const submitted = load('src/lib/luxorDeveloperSupportSubmittedCard.ts')

test('truncateDeveloperSupportSummary shortens long descriptions', () => {
  const long = 'a'.repeat(220)
  const result = submitted.truncateDeveloperSupportSummary(long)
  assert.ok(result.endsWith('…'))
  assert.ok(result.length <= submitted.DEVELOPER_SUPPORT_SUMMARY_DESCRIPTION_MAX)
  assert.equal(submitted.truncateDeveloperSupportSummary('   '), 'No extra details provided.')
})

test('parseDeveloperSupportSubmittedSnapshot validates shape', () => {
  const ok = submitted.parseDeveloperSupportSubmittedSnapshot({
    submittedAt: '2026-11-16T12:00:00.000Z',
    title: 'Lead inbox refresh stuck',
    description: 'Spinner never clears',
    priority: 'high',
    pagePath: '/portal/leads',
    attachmentCount: 2,
    withTeam: true,
  })
  assert.ok(ok)
  assert.equal(ok.attachmentCount, 2)
  assert.equal(ok.withTeam, true)
  assert.equal(submitted.parseDeveloperSupportSubmittedSnapshot({ title: 'x' }), null)
})

test('developerSupportConfirmResult maps confirm RPC payload', () => {
  const snapshot = submitted.developerSupportConfirmResult({
    title: 'Broken button',
    description: 'Save does nothing',
    priority: 'medium',
    pagePath: '/portal/settings',
    attachmentCount: 1,
    result: {
      confirmation_id: '11111111-1111-4111-8111-111111111111',
      dispatch: { runUuid: 'bc-uuid', backgroundComposerId: null },
    },
  })
  assert.equal(snapshot.confirmationId, '11111111-1111-4111-8111-111111111111')
  assert.equal(snapshot.withTeam, true)
  assert.ok(snapshot.submittedAt)
})