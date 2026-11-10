'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const file = path.resolve(__dirname, '../src/app/api/marketing/custom-workflows/[workflowId]/contacts/route.ts')
const workflowId = '11111111-1111-4111-8111-111111111111'
let session = null
let allowed = true
let leadAccess = true
let reads = []
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => leadAccess },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!allowed) throw new ServiceError('Forbidden', 403) } },
  '@/lib/supabaseRestServer': {
    supabaseRestCount: async (query) => { reads.push(query); return query.includes('status=eq.active') ? 1 : 0 },
    supabaseRestStrict: async (query) => {
      reads.push(query)
      if (query.startsWith('luxor_custom_workflows?')) return [{ id: workflowId }]
      if (query.startsWith('luxor_custom_workflow_enrollments?')) return [{ id: 'enrollment', inquiry_id: 'contact', workflow_version_id: 'old-version', current_step_id: 'step-1', status: 'active', next_run_at: null, started_at: '2026-01-01', stop_reason: null, last_error: null }]
      if (query.startsWith('luxor_inquiries?')) return [{ id: 'contact', full_name: 'Test contact', email: 'test@example.invalid' }]
      if (query.startsWith('luxor_custom_workflow_versions?')) return [{ id: 'old-version', definition: { steps: [{ id: 'step-1', name: 'Original step' }] } }]
      throw new Error('Unexpected query')
    },
  },
}
const loaded = new Module(file, module)
loaded.filename = file
loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actualRequire = loaded.require.bind(loaded)
loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actualRequire(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const GET = loaded.exports.GET
const request = (page = '1') => ({ nextUrl: { searchParams: new URLSearchParams({ page }) } })
const context = { params: Promise.resolve({ workflowId }) }

test('requires a session and marketing authorization before reading contacts', async () => {
  session = null; allowed = true; reads = []
  assert.equal((await GET(request(), context)).status, 401)
  session = { email: 'operator@example.invalid' }; allowed = false
  assert.equal((await GET(request(), context)).status, 403)
  allowed = true; leadAccess = false
  assert.equal((await GET(request(), context)).status, 403)
  leadAccess = true
  assert.deepEqual(reads, [])
})

test('uses the enrolled version to resolve the current step and scopes reads to the workflow', async () => {
  session = { email: 'operator@example.invalid' }; allowed = true; reads = []
  const result = await GET(request('2'), context)
  assert.equal(result.status, 200)
  assert.equal(result.body.contacts[0].stepName, 'Original step')
  assert.equal(result.body.counts.active, 1)
  assert.ok(reads.some((query) => query.includes(`workflow_id=eq.${workflowId}`) && query.includes('offset=25')))
  assert.ok(reads.some((query) => query.startsWith('luxor_custom_workflow_versions?') && query.includes(`workflow_id=eq.${workflowId}`)))
})

test('rejects malformed pages without querying enrollment data', async () => {
  session = { email: 'operator@example.invalid' }; allowed = true; reads = []
  assert.equal((await GET(request('-1'), context)).status, 400)
  assert.deepEqual(reads, [])
})
