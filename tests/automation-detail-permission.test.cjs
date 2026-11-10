'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/automation-detail/route.ts')
let session, authorized, production, reads, templates, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => production },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!authorized) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorFollowUpsServer': { getLuxorFollowUpSetup: async () => { reads++; return { templates: templates || [] } }, updateLuxorFollowUpTemplate: async (id, updates, revision) => { saved = { id, updates, revision }; return saved } },
  '@/lib/luxorEmailJobsServer': {}, '@/lib/luxorFollowUpEmailContent': {}, '@/lib/luxorAutomationDetail': { validateFollowUpContentUpdates: (current, updates) => { assert.deepEqual(current, updates); return updates } },
  '@/lib/luxorBrochureStepDefaults': { BROCHURE_EMAIL_DEFAULTS: { email_2: { name: 'Original', subject: 'Original subject', body: 'Original body', cta_text: '', cta_url: '', secondary_cta_text: '', secondary_cta_url: '' } } },
  '@/lib/luxorBrochureDeliveryCopy': {}, '@/lib/luxorBrochureDeliveryCopyServer': {},
  '@/lib/luxorTourEmailServer': {}, '@/lib/luxorTextCampaignsServer': {}, '@/lib/luxorSystemMessageTemplatesServer': {}, '@/lib/luxorTourEmailCopyServer': {}, '@/lib/luxorAutomationsLibrary': {}, '@/lib/supabaseRestServer': {},
}
const loaded = new Module(file, module)
loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded)
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
test('copy saves require a portal session, marketing permission and production environment', async () => {
  const request = { json: async () => ({}) }
  session = null; authorized = true; production = true; reads = 0
  assert.equal((await loaded.exports.PATCH(request)).status, 401)
  session = { email: 'operator@example.invalid' }; authorized = false
  assert.equal((await loaded.exports.PATCH(request)).status, 403)
  authorized = true; production = false
  assert.equal((await loaded.exports.PATCH(request)).status, 409)
  assert.equal(reads, 0)
})
test('email previews and queue reviews require workflow permission', async () => {
  const request = { json: async () => ({}) }
  session = null; authorized = true; reads = 0
  assert.equal((await loaded.exports.POST(request)).status, 401)
  session = { email: 'operator@example.invalid' }; authorized = false
  assert.equal((await loaded.exports.POST(request)).status, 403)
  assert.equal(reads, 0)
})
test('restores only the server-owned original and never changes queued messages', async () => {
  session = { email: 'operator@example.invalid' }; authorized = true; production = true; saved = null
  const id = 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725'
  templates = [{ id, channel: 'email', automation_key: 'brochure_lead', step_key: 'email_2', uses_existing_delivery: false, body: 'Current {{first_name}}' }]
  const request = (body) => ({ json: async () => body })
  assert.equal((await loaded.exports.PATCH(request({ templateId: id, expectedUpdatedAt: '2026-01-01T00:00:00Z', restoreDefault: true, updates: { body: 'forged' } }))).status, 200)
  assert.equal(saved.updates.body, 'Original body')
  assert.equal((await loaded.exports.PATCH(request({ templateId: id, expectedUpdatedAt: '2026-01-01T00:00:00Z', restoreDefault: true, applyToQueued: true }))).status, 400)
})
