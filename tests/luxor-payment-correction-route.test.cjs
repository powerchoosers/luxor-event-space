'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/portal/payment-corrections/route.ts')
let session, member, calls
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => member, memberCan: () => member?.allowed },
  '@/lib/supabaseRestServer': { supabaseRestStrict: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { corrected: true } } },
}
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText
const loaded = new Module(file, module)
loaded.filename = file
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
loaded._compile(compiled, file)
const valid = { paymentId: '11111111-1111-4111-8111-111111111111', installmentId: '22222222-2222-4222-8222-222222222222', expectedUpdatedAt: '2026-11-01T00:00:00Z', reason: 'Recorded in error', actor: 'attacker@example.invalid' }
const request = (body) => ({ json: async () => body })
test.beforeEach(() => { session = { email: 'owner@example.invalid' }; member = { status: 'active', allowed: true }; calls = [] })
test('requires a session and finance permission', async () => {
  session = null
  assert.equal((await loaded.exports.POST(request(valid))).status, 401)
  session = { email: 'owner@example.invalid' }; member.allowed = false
  assert.equal((await loaded.exports.POST(request(valid))).status, 403)
  assert.equal(calls.length, 0)
})
test('requires an explicit reason and current receipt version', async () => {
  assert.equal((await loaded.exports.POST(request({ ...valid, reason: '' }))).status, 400)
  assert.equal((await loaded.exports.POST(request({ ...valid, expectedUpdatedAt: 'invalid' }))).status, 400)
  assert.equal(calls.length, 0)
})
test('uses the authenticated actor and calls the atomic correction', async () => {
  const result = await loaded.exports.POST(request(valid))
  assert.equal(result.status, 200)
  assert.equal(calls[0].url, 'rpc/luxor_correct_manual_installment_payment')
  assert.equal(calls[0].body.p_actor_email, 'owner@example.invalid')
  assert.equal(calls[0].body.p_reason, valid.reason)
})
