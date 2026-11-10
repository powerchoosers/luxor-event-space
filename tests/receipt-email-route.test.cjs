'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorInquiryEmailCopy': { RECEIPT_EMAIL_DEFAULTS: { tour_request_received: {}, newsletter_confirmation: {} } },
  '@/lib/luxorReceiptEmailCopyServer': { readReceiptEmailCopy: async () => ({ installed: true, setting: { revision: 1 } }), saveReceiptEmailCopy: async (...args) => { saved = args; return { revision: 2 } } },
}
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/receipt-email/route.ts'), loaded = new Module(file, module)
loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const req = (key, body = {}) => ({ nextUrl: new URL(`http://localhost/?key=${key}`), json: async () => body })
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'emails']; live = true; saved = null }
test('requires email and workflow permissions and a recognized receipt', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET(req('newsletter_confirmation'))).status, 401)
  reset(); permissions = ['marketing']; assert.equal((await loaded.exports.GET(req('newsletter_confirmation'))).status, 403)
  reset(); assert.equal((await loaded.exports.GET(req('unknown'))).status, 400)
})
test('preview cannot write; restoring uses the signed-in actor and selected receipt', async () => {
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req('tour_request_received', { copy: null, revision: 1 }))).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(req('tour_request_received', { copy: null, revision: 1, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, ['tour_request_received', null, 1, 'owner@example.invalid'])
})
