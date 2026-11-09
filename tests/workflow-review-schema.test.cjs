/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const inquiryId = '11111111-1111-4111-8111-111111111111'
let rows = [], calls = [], failDeferred = false, failRecoveryState = false, activeEnrollments = [], readOnly = { slots: [], customHolds: [], audit: [] }
function loadRoute() {
  const source = fs.readFileSync(path.join(root, 'src/app/api/workflow-review/route.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const route = new Module(path.join(root, 'workflow-review.synthetic.cjs'), module)
  route.filename = path.join(root, 'workflow-review.synthetic.cjs')
  route.paths = module.paths
  const stubs = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/luxorPortalAuth': {
      getLuxorPortalSession: async () => ({ email: 'synthetic@example.invalid' }),
      getVerifiedLuxorPortalSession: async () => ({ email: 'synthetic@example.invalid' }),
      isAuthorizedLuxorPortalEmail: () => true,
    },
    '@/lib/supabaseRestServer': {
      supabaseRest: async (query) => {
        calls.push(query)
        if (readOnly.error) throw readOnly.error
        if (query.startsWith('luxor_workflow_contact_slots?')) return readOnly.slots
        if (query.startsWith('luxor_custom_workflow_enrollments?')) return readOnly.customHolds
        if (query.startsWith('luxor_workflow_resolution_audit?')) return readOnly.audit
        return []
      },
      supabaseRestStrict: async (query) => {
      calls.push(query)
      if (query.startsWith('luxor_ordered_deferred_enrollment_draft?')) {
        if (failDeferred) throw new Error('unavailable')
        // Emulate the old PostgREST schema rejecting any status projection/filter.
        if (query.includes('select=status') || query.includes('&status=')) throw new Error('missing status column')
        return rows
      }
      if (query.startsWith('luxor_follow_up_enrollments?')) return activeEnrollments
      if (query.startsWith('luxor_ordered_brochure_recovery_state?') && failRecoveryState) throw new Error('missing recovery-state table')
      return []
    } },
  }
  const original = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, isMain)
  }
  try { route._compile(js, route.filename) } finally { Module._load = original }
  return route.exports
}
const route = loadRoute()
async function get(input, enabled=true, readOnlyInput={}) {
  rows=input;calls=[];failDeferred=false;failRecoveryState=Boolean(readOnlyInput.failRecoveryState);activeEnrollments=readOnlyInput.orderedEnrollments || [];readOnly={ slots: [], customHolds: [], audit: [], ...readOnlyInput }
  process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED=enabled ? 'true' : 'false'
  const response = await route.GET({ nextUrl: new URL(`https://example.invalid/?inquiryId=${inquiryId}`) })
  return { response, body: await response.json() }
}
test('compact drain schema without status reports a pending follow-up', async () => {
  const { response, body } = await get([{ inquiry_id: inquiryId, receipt_job_id: 'synthetic' }])
  assert.equal(response.status, 200)
  assert.match(body.review, /waiting for workflow processing/)
  assert.ok(calls.some((q) => q.includes('select=*')))
})
test('extended schema distinguishes pending, review and completed', async () => {
  assert.match((await get([{ status: 'pending' }])).body.review, /waiting/)
  assert.match((await get([{ status: 'review' }])).body.review, /needs review/)
  assert.equal((await get([{ status: 'completed' }])).body.review, null)
  assert.match((await get([{ status: 'pending' }, { status: 'review' }])).body.review, /needs review/)
})
test('unknown or truncated states fail closed', async () => {
  assert.match((await get([{ status: null }])).body.review, /needs review/)
  assert.match((await get(Array.from({ length: 1000 }, () => ({ status: 'completed' })))).body.review, /needs review/)
})
test('disabled ordering reads existing holds without querying ordered-only columns', async () => {
  const { response, body } = await get([], false)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { review: null, resolution: null, audit: [] })
  assert.equal(calls.length, 3)
  assert.ok(calls.some((q) => q.startsWith('luxor_workflow_contact_slots?')))
  assert.ok(calls.some((q) => q.startsWith('luxor_workflow_resolution_audit?')))
  assert.equal(calls.some((q) => q.includes('ordered_progression_required') || q.includes('call_completion_required') || q.startsWith('luxor_ordered_deferred_enrollment_draft?')), false)
})
test('disabled ordering keeps read-only visibility of existing holds', async () => {
  const { response, body } = await get([], false, { slots: [{ id: 'slot' }], audit: [{ actor_email: 'synthetic@example.invalid' }] })
  assert.equal(response.status, 200)
  assert.match(body.review, /needs review/)
  assert.equal(body.resolution, null)
  assert.equal(body.audit.length, 1)
})
test('disabled ordering does not hide unrelated database errors', async () => {
  const { response, body } = await get([], false, { error: new Error('database unavailable') })
  assert.equal(response.status, 503)
  assert.match(body.error, /could not be loaded/)
})
test('database failures remain visible', async () => {
  process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true'; failDeferred=true
  const response = await route.GET({ nextUrl: new URL(`https://example.invalid/?inquiryId=${inquiryId}`) })
  assert.equal(response.status, 503)
})
test('enabled ordering fails closed when required recovery-state schema is missing', async () => {
  const { response, body } = await get([], true, { orderedEnrollments: [{ id: '22222222-2222-4222-8222-222222222222' }], failRecoveryState: true })
  assert.equal(response.status, 503)
  assert.match(body.error, /could not be loaded/)
  assert.ok(calls.some((query) => query.startsWith('luxor_ordered_brochure_recovery_state?')))
})
