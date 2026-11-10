'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/event-reminder/route.ts')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorSystemMessageTemplates': { EVENT_REMINDER_DEFAULT: 'original {{event_date}}', renderEventReminder: () => 'preview' },
  '@/lib/luxorSystemMessageTemplatesServer': { readEventReminderTemplate: async () => ({ installed: true, template: { body_template: 'original {{event_date}}', revision: 1 } }), saveEventReminderTemplate: async (...args) => { saved = args; return { body_template: args[0], revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'messages', 'planner']; live = true; saved = null }
const req = (body) => ({ json: async () => body })
test('requires workflow, messages and planner permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing', 'planner']; assert.equal((await loaded.exports.GET()).status, 403)
})
test('blocks preview writes and uses server-owned default and actor', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({}))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req({ restoreDefault: true, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['original {{event_date}}', 1, 'owner@example.invalid'])
})
