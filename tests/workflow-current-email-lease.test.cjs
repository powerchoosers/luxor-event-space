/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const inquiry = '11111111-1111-4111-8111-111111111111'
const slot = '22222222-2222-4222-8222-222222222222'
const job = '33333333-3333-4333-8333-333333333333'
const enrollment = '44444444-4444-4444-8444-444444444444'
const step = '55555555-5555-4555-8555-555555555555'
const workflow = '66666666-6666-4666-8666-666666666666'
const accepted = '2026-01-01T00:00:00.000Z'
let state
function compile(relative, stubs = {}) {
  const file = path.join(root, relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(file + '.synthetic.cjs', module)
  mod.filename = file + '.synthetic.cjs'; mod.paths = module.paths
  const previous = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : previous.call(this, request, parent, main) }
  try { mod._compile(output, mod.filename) } finally { Module._load = previous }
  return mod.exports
}
const format = compile('src/lib/luxorWorkflowEmailActivity.ts').workflowEmailActivity
const route = compile('src/app/api/workflow-current-email/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'operator@example.invalid' }) },
  '@/lib/supabaseRestServer': { supabaseRestStrict: async (query) => {
    state.queries.push(query)
    if (query.startsWith('luxor_workflow_contact_slots?')) return state.slots
    if (query.startsWith('luxor_follow_up_enrollments?')) return state.enrollments
    if (query.startsWith('luxor_custom_workflow_enrollments?')) return state.customEnrollments
    if (query.startsWith('luxor_custom_workflows?')) return state.workflows
    if (query.startsWith('luxor_custom_workflow_step_runs?')) return state.runs
    if (query === 'rpc/luxor_workflow_contact_slot_preview_clear') return state.clear
    if (query.startsWith('luxor_email_jobs?')) return state.jobs
    if (query.startsWith('luxor_adoption_actions?')) {
      if (state.adoptionError) throw new Error('adoption ledger unavailable')
      return query.includes('record_table=eq.luxor_email_jobs') ? state.adoptionActions : state.adoptionSiblings
    }
    if (query.startsWith('luxor_adoption_runs?')) return state.adoptionRuns
    if (query.startsWith('luxor_adoption_gates?')) return state.adoptionGates
    if (query.startsWith('luxor_adoption_invalidations?')) return state.adoptionInvalidations
    if (query.startsWith('luxor_workflow_dispatch_leases?')) {
      if (state.leaseError) throw new Error('lease unavailable')
      return state.leases
    }
    throw new Error('Unexpected query: ' + query)
  } },
})
function reset(overrides = {}) {
  state = {
    slots: [{ id: slot, workflow_kind: 'system', enrollment_id: enrollment, step_key: 'email_2', action_kind: 'email', action_id: job, status: 'open' }],
    enrollments: [{ status: 'active' }], customEnrollments: [{ status: 'active', workflow_id: workflow }],
    workflows: [{ status: 'active' }], runs: [{ id: step }], clear: true,
    jobs: [{ subject: 'Synthetic email', status: 'sending', scheduled_for: '2099-01-01T00:00:00Z', job_type: 'marketing_campaign', automation_enrollment_id: enrollment, automation_step_key: 'email_2', custom_workflow_step_run_id: null }],
    leases: [], adoptionActions: [], adoptionSiblings: [], adoptionRuns: [], adoptionGates: [], adoptionInvalidations: [], queries: [], ...overrides,
  }
}
async function load() {
  const response = await route.GET({ nextUrl: new URL('https://example.invalid/?inquiryId=' + inquiry) })
  const body = await response.json()
  return { status: response.status, body, activity: body.action ? format(body.action) : null }
}
const lease = (overrides = {}) => ({ stage: 'dispatching', accepted_at: null, dispatch_started_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', finalized_at: null, ...overrides })
test('accepted provider receipt survives a failed projection and overrides stale sending job', async () => {
  reset({ leases: [lease({ stage: 'accepted', accepted_at: accepted })] })
  const result = await load()
  assert.equal(result.status, 200)
  assert.equal(result.activity.label, 'Email accepted; workflow needs review')
  const query = state.queries.find((value) => value.startsWith('luxor_workflow_dispatch_leases?'))
  for (const part of ['channel=eq.email', 'job_id=eq.' + job, 'inquiry_id=eq.' + inquiry, 'slot_id=eq.' + slot]) assert.ok(query.includes(part))
  assert.ok(!query.includes('provider_reference'))
})
test('held accepted evidence remains accepted, never inferred delivered or sending', async () => {
  reset({ clear: false, leases: [lease({ stage: 'held', accepted_at: accepted })] })
  assert.equal((await load()).activity.label, 'Email accepted; workflow needs review')
})
test('held, expired and missing sending leases require outcome review', async () => {
  for (const value of [lease({ stage: 'held' }), lease({ expires_at: '2000-01-01T00:00:00Z' }), null]) {
    reset({ leases: value ? [value] : [] })
    assert.equal((await load()).activity.label, 'Email outcome uncertain; needs review')
  }
})
test('live dispatch and pre-dispatch claim have distinct activity', async () => {
  reset({ leases: [lease()] }); assert.equal((await load()).activity.label, 'Email sending')
  reset({ leases: [lease({ stage: 'claimed', dispatch_started_at: null })] }); assert.equal((await load()).activity.label, 'Email preparing')
  reset({ leases: [lease({ stage: 'claimed', dispatch_started_at: null, expires_at: '2000-01-01T00:00:00Z' })] }); assert.equal((await load()).activity.label, 'Email needs review')
  reset({ leases: [lease({ stage: 'held', dispatch_started_at: null })] }); assert.equal((await load()).activity.label, 'Email needs review')
})
test('fully projected accepted mail is left to normal sent history', async () => {
  reset({ leases: [lease({ stage: 'accepted', accepted_at: accepted, finalized_at: accepted })] })
  state.jobs[0].status='sent'
  assert.equal((await load()).activity,null)
})
test('an unclaimed queued workflow email retains its scheduled date', async () => {
  reset(); state.jobs[0].status='queued'
  const activity = (await load()).activity
  assert.equal(activity.label, 'Scheduled email'); assert.equal(activity.scheduledFor, '2099-01-01T00:00:00Z')
})
test('lease lookup failure does not infer acceptance or sending', async () => {
  reset({ leaseError: true }); const result = await load()
  assert.equal(result.status, 503); assert.equal(result.activity, null)
})
test('non-email current action does not inspect any email lease', async () => {
  reset(); state.slots[0].action_kind = 'call'
  const result = await load()
  assert.equal(result.status, 200); assert.equal(result.activity, null)
  assert.equal(state.queries.some((value) => value.startsWith('luxor_workflow_dispatch_leases?')), false)
})
test('unrelated essential email is not represented as an ordered workflow outcome', async () => {
  reset(); state.jobs[0].job_type='invoice'
  const result=await load()
  assert.equal(result.status,503); assert.equal(result.activity,null)
  assert.equal(state.queries.some((value) => value.startsWith('luxor_workflow_dispatch_leases?')),false)
})
test('custom workflow ownership is verified before reporting acceptance', async () => {
  reset({ leases: [lease({ stage: 'accepted', accepted_at: accepted })] })
  state.slots[0].workflow_kind='custom'
  state.jobs[0].job_type='custom_workflow'
  state.jobs[0].custom_workflow_step_run_id=step
  assert.equal((await load()).activity.label,'Email accepted; workflow needs review')
  state.runs=[]
  assert.equal((await load()).status,503)
})
const adoptedAction = () => ({
  action_id: '77777777-7777-4777-8777-777777777777', run_id: '88888888-8888-4888-8888-888888888888',
  inquiry_id: inquiry, enrollment_id: enrollment, step_key: 'email_2', channel: 'email', designation: 'current',
  record_table: 'luxor_email_jobs', record_id: job, effective_due_at: '2099-02-15T16:00:00Z',
})
test('adopted current email displays ledger due date, never historical job date', async () => {
  reset({ adoptionActions: [adoptedAction()], adoptionRuns: [{ state: 'applied', inquiry_id: inquiry, invalidation_floor: 0 }], adoptionGates: [{ held: true }] })
  state.jobs[0].status = 'queued'
  const result = await load()
  assert.equal(result.status, 200)
  assert.equal(result.body.action.scheduledFor, '2099-02-15T16:00:00Z')
  assert.equal(result.activity.scheduledFor, '2099-02-15T16:00:00Z')
})
test('held adopted email remains review-only even with a ledger date', async () => {
  reset({ adoptionActions: [adoptedAction()], adoptionRuns: [{ state: 'applied', inquiry_id: inquiry, invalidation_floor: 0 }], adoptionGates: [{ held: true }] })
  state.slots[0].status = 'held'; state.jobs[0].status = 'queued'
  const result = await load()
  assert.equal(result.body.action.scheduledFor, '2099-02-15T16:00:00Z')
  assert.equal(result.activity.label, 'Email needs review')
  assert.equal(result.activity.scheduledFor, null)
})
test('ledger errors, missing binding and inconsistent adopted dates fail closed', async () => {
  for (const setup of [
    { adoptionError: true },
    { adoptionSiblings: [{ action_id: '77777777-7777-4777-8777-777777777777' }] },
    { adoptionActions: [{ ...adoptedAction(), effective_due_at: null }] },
    { adoptionActions: [{ ...adoptedAction(), designation: 'deferred' }] },
    { adoptionActions: [{ ...adoptedAction(), enrollment_id: '99999999-9999-4999-8999-999999999999' }] },
    { adoptionActions: [adoptedAction()], adoptionRuns: [{ state: 'rolled_back_held', inquiry_id: inquiry }], adoptionGates: [{ held: true }] },
    { adoptionActions: [adoptedAction()], adoptionRuns: [{ state: 'applied', inquiry_id: inquiry }], adoptionGates: [] },
    { adoptionActions: [adoptedAction()], adoptionRuns: [{ state: 'applied', inquiry_id: inquiry, invalidation_floor: 0 }], adoptionGates: [{ held: true }], adoptionInvalidations: [{ id: 1 }] },
  ]) {
    reset(setup);state.jobs[0].status='queued'
    const result = await load()
    assert.equal(result.status, 503);assert.equal(result.activity,null)
  }
})
test('non-adopted system and custom emails retain their own scheduled date', async () => {
  reset();state.jobs[0].status='queued';assert.equal((await load()).activity.scheduledFor,'2099-01-01T00:00:00Z')
  reset();state.slots[0].workflow_kind='custom';state.jobs[0].job_type='custom_workflow'
  state.jobs[0].custom_workflow_step_run_id=step;state.jobs[0].status='queued'
  assert.equal((await load()).activity.scheduledFor,'2099-01-01T00:00:00Z')
  assert.equal(state.queries.some((value)=>value.startsWith('luxor_adoption_actions?')),false)
})
