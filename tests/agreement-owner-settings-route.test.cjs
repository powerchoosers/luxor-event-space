'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/agreement-owner/route.ts')
let session, role, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active', role }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorAgreementOwnerCopy': { AGREEMENT_OWNER_DEFAULT: { subject: 'Executed Luxor agreement - {{client_name}}', heading: 'Executed agreement archived', body: 'Body' } },
  '@/lib/luxorAgreementOwnerCopyServer': { readAgreementOwnerCopySetting: async () => ({ installed: true, setting: { revision: 1 } }), saveAgreementOwnerCopySetting: async (...args) => { saved = args; return { revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; role = 'owner'; permissions = ['marketing', 'emails', 'finances', 'planner']; live = true; saved = null }
test('requires owner, marketing, email, finance and planner permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); role = 'staff'; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'emails', 'planner']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'emails', 'finances']; assert.equal((await loaded.exports.GET()).status, 403)
})
test('preview cannot write and restore uses the authenticated actor', async () => {
  reset(); const request = { json: async () => ({ copy: null, revision: 1, actor: 'spoof' }) }
  live = false; assert.equal((await loaded.exports.PATCH(request)).status, 409); assert.equal(saved, null)
  live = true; assert.equal((await loaded.exports.PATCH(request)).status, 200); assert.deepEqual(saved, [null, 1, 'owner@example.invalid'])
})
