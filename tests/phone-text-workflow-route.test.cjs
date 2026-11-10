'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function compile(file, mocks = {}) {
  const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
  const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  assert.deepEqual(output.diagnostics || [], []); loaded._compile(output.outputText, file); return loaded.exports
}
const definitions = compile(path.resolve(__dirname, '../src/lib/luxorPhoneTextWorkflow.ts'))
let session, permissions, production, calls, conflict, stored
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const row = { missed_call_text_body: definitions.PHONE_TEXT_DEFAULTS.missed_call, missed_call_text_enabled: false, inbound_text_reply_body: definitions.PHONE_TEXT_DEFAULTS.inbound_acknowledgment, inbound_text_reply_enabled: true, inbound_text_reply_cooldown_hours: 12, updated_at: '2026-11-09T12:00:00.000Z' }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => production },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorPhoneTextWorkflow': definitions,
  '@/lib/supabaseRestServer': { supabaseRestStrict: async (query, options) => { calls.push({ query, options }); return conflict && options ? [] : [options ? { ...stored, ...JSON.parse(options.body) } : stored] } },
}
const route = compile(path.resolve(__dirname, '../src/app/api/marketing/system-messages/phone-text/route.ts'), mocks)
const req = (body) => ({ json: async () => body })
function reset() { session = { email: 'Owner@example.invalid' }; permissions = ['marketing', 'messages', 'calls']; production = true; calls = []; conflict = false; stored = { ...row } }
test('requires workflow, calls and messages permissions and gates preview writes', async () => {
  reset(); session = null; assert.equal((await route.GET({ nextUrl: new URL('http://localhost/?kind=missed_call') })).status, 401)
  reset(); permissions = ['marketing', 'messages']; assert.equal((await route.GET({ nextUrl: new URL('http://localhost/?kind=missed_call') })).status, 403)
  reset(); production = false; assert.equal((await route.PATCH(req({}))).status, 409); assert.equal(calls.length, 0)
})
test('updates only selected automation fields with optimistic revision and session actor', async () => {
  reset()
  const response = await route.PATCH(req({ kind: 'inbound_acknowledgment', body: definitions.PHONE_TEXT_DEFAULTS.inbound_acknowledgment, enabled: true, cooldownHours: 24, revision: row.updated_at, actor: 'spoof' }))
  assert.equal(response.status, 200)
  assert.match(calls[0].query, /updated_at=eq\./)
  const payload = JSON.parse(calls[0].options.body)
  assert.equal(payload.updated_by, 'owner@example.invalid'); assert.equal(payload.inbound_text_reply_cooldown_hours, 24)
  assert.equal(payload.missed_call_text_enabled, undefined); assert.equal(payload.ring_to_number, undefined)
  conflict = true; assert.equal((await route.PATCH(req({ kind: 'missed_call', body: definitions.PHONE_TEXT_DEFAULTS.missed_call, enabled: false, revision: row.updated_at }))).status, 409)
})
test('rejects invalid opt-out wording and cooldown before writing', async () => {
  reset()
  assert.equal((await route.PATCH(req({ kind: 'missed_call', body: 'Hello there', enabled: true, revision: row.updated_at }))).status, 400)
  assert.equal((await route.PATCH(req({ kind: 'inbound_acknowledgment', body: definitions.PHONE_TEXT_DEFAULTS.inbound_acknowledgment, enabled: true, cooldownHours: 0, revision: row.updated_at }))).status, 400)
  assert.equal(calls.filter((call) => call.options).length, 0)
})
test('allows a setting change without rewriting a pre-existing message that predates the editor rules', async () => {
  reset(); stored.missed_call_text_body = 'Hi! Thanks for calling Luxor at Las Palmas Events. Reply STOP to opt out.'
  const input = { kind: 'missed_call', body: stored.missed_call_text_body, enabled: false, revision: stored.updated_at }
  assert.equal((await route.PATCH(req(input))).status, 200)
  assert.equal(JSON.parse(calls.at(-1).options.body).missed_call_text_body, stored.missed_call_text_body)
  reset(); stored.missed_call_text_body = input.body
  assert.equal((await route.PATCH(req({ ...input, body: 'Changed text without safeguards' }))).status, 400)
  assert.equal(calls.filter((call) => call.options).length, 0)
})
