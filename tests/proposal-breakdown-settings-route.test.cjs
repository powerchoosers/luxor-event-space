'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/proposal-breakdown/route.ts')
let session, permissions, live
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorAutomationEnvironment': { canControlLiveLuxorAutomations: () => live },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/luxorProposalBreakdownCopy': { PROPOSAL_BREAKDOWN_DEFAULT: { subject: 'Proposal Breakdown: {{event_type}}', eyebrow: 'Proposal Breakdown', headline: 'Headline', intro: 'Intro', packageNote: 'Note', closing: 'Closing', footer: 'Footer' } },
  '@/lib/luxorProposalBreakdownCopyServer': { readProposalBreakdownSetting: async () => ({ installed: true, setting: { revision: 1 } }), saveProposalBreakdownSetting: async () => ({ revision: 2 }) },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'emails', 'planner']; live = true }
test('requires portal session, marketing operator, email and planner permissions', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET()).status, 401)
  reset(); permissions = ['marketing']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET()).status, 403)
  reset(); assert.equal((await loaded.exports.GET()).status, 200)
})
