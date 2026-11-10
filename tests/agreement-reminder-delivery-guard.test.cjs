'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let signature, failRead, patches
const file = path.resolve(__dirname, '../src/lib/luxorEmailJobsServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
mod.require = (name) => name === './supabaseRestServer' ? {
  supabaseRestStrict: async (query) => { assert.match(query, /id=eq\.signature&inquiry_id=eq\.inquiry/); if (failRead) throw new Error('read failed'); return signature ? [signature] : [] },
  supabaseRest: async (query, options) => { patches.push({ query, body: JSON.parse(options.body) }); return [] },
} : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const job = { id: 'job', inquiry_id: 'inquiry', signature_request_id: 'signature', job_type: 'contract_view_reminder', metadata: {} }
function reset() { signature = { status: 'sent', signed_at: null }; failRead = false; patches = [] }
test('sent and viewed agreements remain eligible', async () => {
  for (const status of ['sent', 'viewed']) { reset(); signature.status = status; assert.equal(await mod.exports.cancelIneligibleAgreementReminder(job), false); assert.equal(patches.length, 0) }
})
test('signed and void agreements cancel either claimed reminder', async () => {
  for (const state of [{ status: 'signed', signed_at: null }, { status: 'void', signed_at: null }, { status: 'viewed', signed_at: '2026-11-09T00:00:00Z' }]) {
    for (const kind of ['contract_view_reminder', 'contract_signature_reminder']) {
      reset(); signature = state; assert.equal(await mod.exports.cancelIneligibleAgreementReminder({ ...job, job_type: kind }), true)
      assert.match(patches[0].query, /id=eq\.job&status=eq\.sending/); assert.equal(patches[0].body.status, 'cancelled')
    }
  }
})
test('unverifiable or not-yet-sent agreements hold instead of delivering', async () => {
  reset(); failRead = true; await assert.rejects(mod.exports.cancelIneligibleAgreementReminder(job), /held.*verified/)
  reset(); signature = null; await assert.rejects(mod.exports.cancelIneligibleAgreementReminder(job), /held.*verified/)
  reset(); await assert.rejects(mod.exports.cancelIneligibleAgreementReminder({ ...job, signature_request_id: null }), /held.*verified/)
  reset(); signature.status = 'draft'; await assert.rejects(mod.exports.cancelIneligibleAgreementReminder(job), /not ready/); assert.equal(patches.length, 0)
})
test('test, custom and corrected messages retain separate handling', async () => {
  reset(); for (const overrides of [{ test_run_id: 'test' }, { custom_workflow_step_run_id: 'step' }, { metadata: { corrected_email_resend_request_id: 'request' } }, { job_type: 'marketing_campaign' }]) assert.equal(await mod.exports.cancelIneligibleAgreementReminder({ ...job, ...overrides }), false)
  assert.equal(patches.length, 0)
})
