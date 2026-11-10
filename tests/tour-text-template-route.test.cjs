'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/tour-text/route.ts')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorTourNotificationsServer': { areLuxorTourNotificationsEnabled: async () => false },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorSystemMessageTemplates': { TOUR_TEXT_DEFAULTS: { tour_confirmation: 'original confirmation', tour_reminder: 'original reminder' } },
  '@/lib/luxorSystemMessageTemplatesServer': { readTourTextTemplate: async () => ({ installed: true, template: { body_template: 'original', revision: 1 } }), saveTourTextTemplate: async (...args) => { saved = args; return { body_template: args[1], revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'messages', 'calendar']; live = true; saved = null }
const req = (body) => ({ json: async () => body })
test('requires workflow, messages and calendar permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET({ nextUrl: new URL('http://localhost/?key=tour_confirmation') })).status, 401)
  reset(); permissions = ['marketing', 'messages']; assert.equal((await loaded.exports.GET({ nextUrl: new URL('http://localhost/?key=tour_confirmation') })).status, 403)
  reset(); const result = await loaded.exports.GET({ nextUrl: new URL('http://localhost/?key=tour_confirmation') }); assert.equal(result.status, 200); assert.equal(result.body.enabled, false)
})
test('blocks preview writes and restores server-owned default', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({}))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req({ key: 'other' }))).status, 400)
  assert.equal((await loaded.exports.PATCH(req({ key: 'tour_reminder', restoreDefault: true, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['tour_reminder', 'original reminder', 1, 'owner@example.invalid'])
})
