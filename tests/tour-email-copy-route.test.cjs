'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/tour-email/route.ts')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorTourEmailCopy': { TOUR_EMAIL_NOTICE_KEYS: ['confirmation', 'reminder_24', 'reminder_2'] },
  '@/lib/luxorTourEmailCopyServer': { readTourEmailCopySettings: async () => ({ installed: true, settings: [] }), saveTourEmailCopySetting: async (...args) => { saved = args; return { revision: 2 } } },
  '@/lib/luxorTourNotificationsServer': { areLuxorTourNotificationsEnabled: async () => true },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'emails', 'calendar']; live = true; saved = null }
const req = (body) => ({ json: async () => body })
test('requires calendar, emails and workflow permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET()).status, 403)
})
test('blocks preview writes, validates notice and uses session actor on restore', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({}))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req({ key: 'other', copy: null }))).status, 400)
  assert.equal((await loaded.exports.PATCH(req({ key: 'confirmation', copy: null, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['confirmation', null, 1, 'owner@example.invalid'])
})
