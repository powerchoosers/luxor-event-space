'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/automation-step-settings/route.ts')
const id = '11111111-1111-4111-8111-111111111111'
const updatedAt = '2026-10-05T00:00:00.000Z'
let session, authorized, production, template, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => production },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!authorized) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorFollowUpsServer': { getLuxorFollowUpSetup: async () => ({ templates: [template] }), updateLuxorFollowUpTemplate: async (...args) => { saved = args; return { ...template, updated_at: 'new' } } },
}
const loaded = new Module(file, module)
loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded)
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const PATCH = loaded.exports.PATCH
const req = (body) => ({ json: async () => body })
function reset() { session = { email: 'operator@example.invalid' }; authorized = true; production = true; saved = null; template = { id, automation_key: 'brochure_lead', channel: 'phone', uses_existing_delivery: false } }
test('rejects missing permission and local preview without saving', async () => {
  reset(); session = null; assert.equal((await PATCH(req({}))).status, 401)
  reset(); authorized = false; assert.equal((await PATCH(req({}))).status, 403)
  reset(); production = false; assert.equal((await PATCH(req({}))).status, 409)
  assert.equal(saved, null)
})
test('saves future phone task settings with an expected revision', async () => {
  reset()
  const result = await PATCH(req({ templateId: id, expectedUpdatedAt: updatedAt, delayDays: 3, name: 'Call guest', notes: 'Discuss the tour' }))
  assert.equal(result.status, 200)
  assert.deepEqual(saved, [id, { delay_days: 3, name: 'Call guest', body: 'Discuss the tour' }, updatedAt])
})
test('rejects invalid timing, existing delivery and email content injection', async () => {
  reset(); assert.equal((await PATCH(req({ templateId: id, expectedUpdatedAt: updatedAt, delayDays: -1 }))).status, 400)
  template.uses_existing_delivery = true; assert.equal((await PATCH(req({ templateId: id, expectedUpdatedAt: updatedAt, delayDays: 1 }))).status, 400)
  template.uses_existing_delivery = false; template.channel = 'email'
  assert.equal((await PATCH(req({ templateId: id, expectedUpdatedAt: updatedAt, delayDays: 1, name: 'Injected' }))).status, 400)
  assert.equal(saved, null)
})
test('saves email timing without altering message content', async () => {
  reset(); template.channel = 'email'
  assert.equal((await PATCH(req({ templateId: id, expectedUpdatedAt: updatedAt, delayDays: 7 }))).status, 200)
  assert.deepEqual(saved, [id, { delay_days: 7 }, updatedAt])
})
