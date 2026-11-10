'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/inquiry-confirmation/route.ts')
let session, marketing, messages, production, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => messages },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => production },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!marketing) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorSystemMessageTemplates': { INQUIRY_CONFIRMATION_DEFAULT: 'original', renderInquiryConfirmation: () => 'preview' },
  '@/lib/luxorSystemMessageTemplatesServer': { readInquiryConfirmationTemplate: async () => ({ installed: true, template: { body_template: 'original', revision: 1 } }), saveInquiryConfirmationTemplate: async (...args) => { saved = args; return { body_template: args[0], revision: 2 } } },
}
const loaded = new Module(file, module)
loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded)
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const req = (body) => ({ json: async () => body })
function reset() { session = { email: 'owner@example.invalid' }; marketing = true; messages = true; production = true; saved = null }
test('requires portal, marketing and messages authorization', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); marketing = false; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); messages = false; assert.equal((await loaded.exports.GET()).status, 403)
})
test('preview cannot write and restore uses server-owned default and session actor', async () => {
  reset(); production = false
  assert.equal((await loaded.exports.PATCH(req({ body: 'change', revision: 1 }))).status, 409)
  assert.equal(saved, null)
  production = true
  assert.equal((await loaded.exports.PATCH(req({ restoreDefault: true, revision: 1, actorEmail: 'spoof@example.invalid' }))).status, 200)
  assert.deepEqual(saved, ['original', 1, 'owner@example.invalid'])
})
