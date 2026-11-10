'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let session, permissions, live, saved, enabled
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorEventEmailCopy': { EVENT_EMAIL_DEFAULTS: {}, EVENT_EMAIL_KEYS: ['details', 'day', 'thanks'] },
  '@/lib/luxorEventEmailCopyServer': { readEventEmailSettings: async () => ({ installed: true, settings: [] }), saveEventEmailSetting: async (...args) => { saved = args; return { revision: 2 } } },
  '@/lib/luxorPaymentRemindersServer': { areLuxorFinalPaymentRemindersEnabled: async () => { if (enabled === null) throw new Error('synthetic'); return enabled } },
}
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/event-email/route.ts'), loaded = new Module(file, module)
loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const req = (body) => ({ json: async () => body })
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'emails', 'calendar']; live = true; saved = null; enabled = true }
test('requires marketing, email and calendar access', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'calendar']; assert.equal((await loaded.exports.GET()).status, 403)
})
test('preview cannot write; restoring uses the authenticated actor and selected step', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({ key: 'details', copy: null, revision: 1 }))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req({ key: 'unknown', copy: null, revision: 1 }))).status, 400)
  assert.equal((await loaded.exports.PATCH(req({ key: 'details', copy: null, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['details', null, 1, 'owner@example.invalid'])
})
