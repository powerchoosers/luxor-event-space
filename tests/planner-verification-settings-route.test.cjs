'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/planner-verification/route.ts')
let session, role, permissions, live, saved
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active', role }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorPlannerVerificationCopy': { PLANNER_VERIFICATION_DEFAULT: { subject: 'Your Luxor design verification code', title: 'Verify', greeting: 'Hello,', intro: 'Intro', closing: 'Closing', note: 'Note' } },
  '@/lib/luxorPlannerVerificationCopyServer': { readPlannerVerificationSetting: async () => ({ installed: true, setting: { revision: 1 } }), savePlannerVerificationSetting: async (...args) => { saved = args; return { revision: 2 } } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; role = 'owner'; permissions = ['marketing', 'emails', 'planner']; live = true; saved = null }
test('requires owner, marketing, email and planner permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); role = 'staff'; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET()).status, 403)
})
