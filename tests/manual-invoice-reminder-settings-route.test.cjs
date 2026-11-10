'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/manual-invoice-reminder/route.ts')
let session, role, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active', role }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorManualInvoiceReminderCopy': { MANUAL_INVOICE_REMINDER_DEFAULTS: {}, MANUAL_INVOICE_REMINDER_KEYS: ['unpaid_invoice', 'final_payment'] },
  '@/lib/luxorManualInvoiceReminderCopyServer': { readManualInvoiceReminderSettings: async () => ({ installed: true, settings: [] }), saveManualInvoiceReminderSetting: async (...args) => { saved = args; return { revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; role = 'owner'; permissions = ['marketing', 'emails', 'finances']; live = true; saved = null }
test('requires portal session, marketing operator, email and finance permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); assert.equal((await loaded.exports.GET()).status, 200)
})
