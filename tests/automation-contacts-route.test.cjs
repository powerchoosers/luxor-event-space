'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const file = path.resolve(__dirname, '../src/app/api/marketing/automation-contacts/route.ts')
let session = null
let authorized = true
let leadAccess = true
let queries = []
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => leadAccess },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!authorized) throw new ServiceError('Forbidden', 403) } },
  '@/lib/supabaseRestServer': {
    supabaseRestCount: async (query) => { queries.push(query); return query.includes('status=eq.active') ? 1 : 0 },
    supabaseRestStrict: async (query) => {
      queries.push(query)
      if (query.startsWith('luxor_follow_up_enrollments?')) return [{ id: 'enrollment', inquiry_id: 'contact', status: 'active', started_at: '2026-01-01', luxor_inquiries: { id: 'contact', full_name: 'Test contact', email: 'test@example.invalid' } }]
      if (query.startsWith('luxor_follow_up_templates?')) return [{ step_key: 'call_1', name: 'Call the guest' }]
      if (query.startsWith('luxor_follow_up_actions?')) return [{ enrollment_id: 'enrollment', step_key: 'call_1', scheduled_at: '2026-02-01', status: 'task_created', channel: 'phone' }]
      throw new Error('Unexpected query')
    },
  },
}
const loaded = new Module(file, module)
loaded.filename = file
loaded.paths = Module._nodeModulePaths(path.dirname(file))
const realRequire = loaded.require.bind(loaded)
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const GET = loaded.exports.GET
const request = (search = 'id=brochure_lead&page=1') => ({ nextUrl: { searchParams: new URLSearchParams(search) } })

test('requires an authorized marketing operator before database reads', async () => {
  session = null; queries = []; authorized = true
  assert.equal((await GET(request())).status, 401)
  session = { email: 'operator@example.invalid' }; authorized = false
  assert.equal((await GET(request())).status, 403)
  authorized = true; leadAccess = false
  assert.equal((await GET(request())).status, 403)
  leadAccess = true
  assert.deepEqual(queries, [])
})
test('returns the earliest unresolved action with scoped enrollment counts', async () => {
  session = { email: 'operator@example.invalid' }; authorized = true; queries = []
  const result = await GET(request('id=brochure_lead&page=2'))
  assert.equal(result.status, 200)
  assert.equal(result.body.contacts[0].nextAction.name, 'Call the guest')
  assert.equal(result.body.contacts[0].nextAction.status, 'task_created')
  assert.equal(result.body.counts.active, 1)
  assert.ok(queries.some((query) => query.includes('automation_key=eq.brochure_lead') && query.includes('offset=25')))
  assert.ok(queries.some((query) => query.startsWith('luxor_follow_up_actions?') && query.includes('enrollment_id=in.(enrollment)')))
})
test('rejects unknown automation and malformed pagination', async () => {
  session = { email: 'operator@example.invalid' }; authorized = true; queries = []
  assert.equal((await GET(request('id=other'))).status, 404)
  assert.equal((await GET(request('id=brochure_lead&page=-1'))).status, 400)
  assert.deepEqual(queries, [])
})
