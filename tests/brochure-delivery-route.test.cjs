'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/brochure-delivery/route.ts')
let session, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorBrochureDeliveryCopy': { BROCHURE_DELIVERY_DEFAULT: {} },
  '@/lib/luxorBrochureDeliveryCopyServer': { readBrochureDeliverySetting: async () => ({ installed: true, setting: { revision: 1 } }), saveBrochureDeliverySetting: async (...args) => { saved = args; return { revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'emails']; live = true; saved = null }
const req = (body) => ({ json: async () => body })
test('requires marketing and email access and blocks preview writes', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['emails']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); live = false; assert.equal((await loaded.exports.PATCH(req({ copy: null, revision: 1 }))).status, 409); assert.equal(saved, null)
})
test('restores using the session actor and expected revision', async () => {
  reset(); assert.equal((await loaded.exports.PATCH(req({ copy: null, revision: 2, actor: 'spoof' }))).status, 200)
  assert.deepEqual(saved, [null, 2, 'owner@example.invalid'])
})
