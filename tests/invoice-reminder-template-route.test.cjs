'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/invoice-reminder/route.ts')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorSystemMessageTemplates': { INVOICE_REMINDER_DEFAULTS: { invoice_due_reminder: 'due', invoice_overdue_reminder: 'overdue', invoice_payment_request: 'payment request' } },
  '@/lib/luxorSystemMessageTemplatesServer': { readInvoiceReminderTemplate: async () => ({ installed: true, template: { body_template: 'due', revision: 1 } }), saveInvoiceReminderTemplate: async (...args) => { saved = args; return { body_template: args[1], revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'messages', 'finances']; live = true; saved = null }
const req = (body) => ({ json: async () => body })
test('requires workflow, messages and finance permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET({ nextUrl: new URL('http://localhost/?key=invoice_due_reminder') })).status, 401)
  reset(); permissions = ['marketing', 'messages']; assert.equal((await loaded.exports.GET({ nextUrl: new URL('http://localhost/?key=invoice_due_reminder') })).status, 403)
})
test('blocks preview writes, rejects unknown keys and restores the server default', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({}))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req({ key: 'other', revision: 1 }))).status, 400)
  assert.equal((await loaded.exports.PATCH(req({ key: 'invoice_overdue_reminder', restoreDefault: true, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['invoice_overdue_reminder', 'overdue', 1, 'owner@example.invalid'])
  assert.equal((await loaded.exports.PATCH(req({ key: 'invoice_payment_request', restoreDefault: true, revision: 2 }))).status, 200)
  assert.deepEqual(saved, ['invoice_payment_request', 'payment request', 2, 'owner@example.invalid'])
})
