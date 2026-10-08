/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const inquiryId = '11111111-1111-4111-8111-111111111111'
const enrollmentId = '22222222-2222-4222-8222-222222222222'
const itemId = '33333333-3333-4333-8333-333333333333'
const futureTime = '2099-01-01T16:00:00.000Z'
let state

function loadRoute() {
  const source = fs.readFileSync(path.join(root, 'src/app/api/follow-ups/route.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const route = new Module(path.join(root, 'follow-ups-route.synthetic.cjs'), module)
  route.filename = path.join(root, 'follow-ups-route.synthetic.cjs')
  route.paths = module.paths
  const originalLoad = Module._load
  const stubs = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'synthetic@example.invalid' }) },
    '@/lib/luxorFollowUpsServer': {
      getLuxorFollowUpSetup: async () => ({ automation: null, templates: [] }),
      isLuxorBrochureFollowUpSendingEnabled: async () => false,
      updateLuxorFollowUpTemplate: async () => null,
      recordLuxorFollowUpResponse: async (id) => { state.responses.push(id); return { recorded: true, status: 'completed' } },
      controlLuxorBrochureFollowUp: async (id, action) => { state.controls.push({ id, action }); return state.controlResult },
      setLuxorFollowUpDisposition: async (id, disposition) => { state.dispositions.push({ id, disposition }) },
    },
    '@/lib/supabaseRestServer': { supabaseRest: async (query, init = {}) => mockSupabase(query, init) },
    '@/lib/luxorInquiriesServer': {
      getLuxorInquiry: async (id) => id === inquiryId ? { id, marketing_opt_in: state.inquiryEligible !== false, status: state.inquiryStatus || 'new', follow_up_disposition: state.inquiryDisposition || null } : null,
      updateLuxorInquiry: async () => ({ id: inquiryId, metadata: {} }),
    },
    '@/lib/luxorNotesServer': { createNote: async () => ({ id: 'synthetic-note' }) },
  }
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { route._compile(js, route.filename) } finally { Module._load = originalLoad }
  return route.exports
}

async function mockSupabase(query, init) {
  state.queries.push({ query, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
  if (query === 'rpc/luxor_recover_brochure_follow_up_overdue') {
    const input = JSON.parse(init.body)
    state.rpcCalls.push(input)
    if (state.action.step_key === 'email_5' && input.p_decision === 'skip') return { status: 'terminal_skip_requires_reschedule_or_stop' }
    const before = structuredClone({ action: state.action, job: state.job })
    try {
      if (input.p_decision === 'skip') {
        if (state.job) state.job.status = 'cancelled'
        if (state.failAfterFirstWrite) throw new Error('Synthetic failure after linked-job update.')
        state.action.status = 'skipped'
        state.action.completed_at = '2026-10-08T12:00:00.000Z'
        state.action.outcome = 'Skipped by staff during overdue resume review.'
        return { status: 'success', decision: 'skip', action_id: itemId }
      }
      if (state.job) state.job.scheduled_for = input.p_scheduled_at
      if (state.failAfterFirstWrite) throw new Error('Synthetic failure after linked-job update.')
      state.action.scheduled_at = input.p_scheduled_at
      return { status: 'success', decision: 'reschedule', action_id: itemId, scheduled_at: input.p_scheduled_at }
    } catch (error) {
      state.action = before.action
      state.job = before.job
      throw error
    }
  }
  if (query.startsWith('luxor_follow_up_enrollments?')) return [{ id: enrollmentId, inquiry_id: inquiryId, automation_key: 'brochure_lead', status: state.enrollmentStatus, ended_reason: state.endedReason, marketing_consent_at_enrollment: true }]
  if (query.startsWith('luxor_follow_up_actions?')) return [{ id: itemId, enrollment_id: enrollmentId, channel: 'email', step_key: state.action.step_key, status: state.action.status, scheduled_at: state.action.scheduled_at, email_job_id: '44444444-4444-4444-8444-444444444444' }]
  if (query.startsWith('luxor_email_jobs?')) return state.job?.status === 'queued' ? [{ id: '44444444-4444-4444-8444-444444444444', scheduled_for: state.job.scheduled_for }] : []
  return []
}

function reset(overrides = {}) {
  state = {
    queries: [], controls: [], dispositions: [], responses: [], rpcCalls: [], inquiryEligible: true,
    enrollmentStatus: 'paused', endedReason: null, controlResult: { status: 'active', finalized: false },
    action: { id: itemId, step_key: 'email_2', status: 'email_queued', scheduled_at: '2020-01-01T00:00:00Z' },
    job: { id: '44444444-4444-4444-8444-444444444444', status: 'queued', scheduled_for: '2020-01-01T00:00:00Z' },
    ...overrides,
  }
}
function request(body) { return { json: async () => body } }
const route = loadRoute()

test('decline disposition succeeds without an enrollment and is safely repeatable', async () => {
  reset()
  const first = await route.POST(request({ inquiryId, action: 'disposition', disposition: 'not_interested' }))
  const second = await route.POST(request({ inquiryId, action: 'disposition', disposition: 'not_interested' }))
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.deepEqual(state.dispositions, [{ id: inquiryId, disposition: 'not_interested' }, { id: inquiryId, disposition: 'not_interested' }])
  assert.equal(state.controls.length, 0)
})

test('the database disposition trigger stops only live enrollments and records the decline reason', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261005010000_brochure_lead_follow_ups.sql'), 'utf8')
  assert.match(migration, /new\.follow_up_disposition in \('not_interested', 'lost_another_venue', 'event_canceled'\) then stop_reason := new\.follow_up_disposition/i)
  assert.match(migration, /status in \('active', 'paused'\)/i)
})

test('stop reason patch is conditional so an unsubscribe reason wins a race', async () => {
  reset({ enrollmentStatus: 'active', endedReason: null, controlResult: { status: 'stopped', finalized: false } })
  const response = await route.POST(request({ inquiryId, action: 'stop', stopReason: 'manual_stop' }))
  assert.equal(response.status, 200)
  const patch = state.queries.find((item) => item.method === 'PATCH' && item.query.startsWith('luxor_follow_up_enrollments?'))
  assert.match(patch.query, /ended_reason=eq\.manual_stop/)
  assert.doesNotMatch(patch.query, /ended_reason=neq/)
})

test('resume refuses an overdue queued email without activating the sequence', async () => {
  reset()
  const response = await route.POST(request({ inquiryId, action: 'resume' }))
  assert.equal(response.status, 409)
  assert.equal(state.controls.length, 0)
})

test('resume refuses a suppressed lead before changing sequence state', async () => {
  reset({ inquiryEligible: false })
  const response = await route.POST(request({ inquiryId, action: 'resume' }))
  assert.equal(response.status, 409)
  assert.equal(state.controls.length, 0)
})

test('overdue recovery uses one atomic database operation for the selected action and job', async () => {
  reset()
  const response = await route.POST(request({ inquiryId, action: 'recover_overdue', enrollmentId, itemId, decision: 'skip', stepKey: 'email_2' }))
  assert.equal(response.status, 200)
  assert.equal(state.rpcCalls.length, 1)
  assert.deepEqual(state.rpcCalls[0], { p_inquiry_id: inquiryId, p_enrollment_id: enrollmentId, p_action_id: itemId, p_decision: 'skip', p_scheduled_at: null })
  assert.equal(state.action.status, 'skipped')
  assert.equal(state.job.status, 'cancelled')
  assert.equal(state.queries.some((item) => item.method === 'PATCH'), false)
})

test('injected failure after first staged write rolls back and a retry updates both rows', async () => {
  reset({ failAfterFirstWrite: true })
  const body = { inquiryId, action: 'recover_overdue', enrollmentId, itemId, decision: 'skip' }
  const first = await route.POST(request(body))
  assert.equal(first.status, 500)
  assert.equal(state.job.status, 'queued')
  assert.equal(state.action.status, 'email_queued')
  state.failAfterFirstWrite = false
  const retry = await route.POST(request(body))
  assert.equal(retry.status, 200)
  assert.equal(state.job.status, 'cancelled')
  assert.equal(state.action.status, 'skipped')
  assert.equal(state.rpcCalls.length, 2)
})

test('the final Day 30 email cannot be skipped and leaves the queued email intact', async () => {
  reset({ action: { id: itemId, step_key: 'email_5', status: 'email_queued', scheduled_at: '2020-01-01T00:00:00Z' } })
  const response = await route.POST(request({ inquiryId, action: 'recover_overdue', enrollmentId, itemId, decision: 'skip' }))
  const result = await response.json()
  assert.equal(response.status, 409)
  assert.match(result.error, /final approved email cannot be skipped/i)
  assert.equal(state.action.status, 'email_queued')
  assert.equal(state.job.status, 'queued')
})

test('database recovery function validates eligibility, locks linked rows, and updates the action/job pair atomically', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261008020000_atomic_follow_up_overdue_recovery.sql'), 'utf8')
  assert.match(migration, /target_inquiry\.marketing_opt_in/i)
  assert.match(migration, /target_enrollment\.status <> 'paused'/i)
  assert.match(migration, /target_enrollment\.marketing_consent_at_enrollment/i)
  assert.match(migration, /for update/i)
  assert.match(migration, /target_action\.step_key = 'email_5'/i)
  assert.match(migration, /set status = 'cancelled'/i)
  assert.match(migration, /set status = 'skipped'/i)
  assert.match(migration, /set scheduled_for = p_scheduled_at/i)
  assert.match(migration, /set scheduled_at = p_scheduled_at/i)
  assert.match(migration, /grant execute[\s\S]*to service_role/i)
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i)
})

test('reschedule requires an explicit future time and updates only the selected queued items', async () => {
  reset()
  const invalid = await route.POST(request({ inquiryId, action: 'recover_overdue', enrollmentId, itemId, decision: 'reschedule' }))
  assert.equal(invalid.status, 400)
  assert.equal(state.rpcCalls.length, 0)
  const response = await route.POST(request({ inquiryId, action: 'recover_overdue', enrollmentId, itemId, decision: 'reschedule', scheduledAt: futureTime, stepKey: 'email_2' }))
  assert.equal(response.status, 200)
  assert.equal(state.action.scheduled_at, futureTime)
  assert.equal(state.job.scheduled_for, futureTime)
  assert.equal(state.rpcCalls.length, 1)
})

test('late-response recording reaches the existing response finalizer', async () => {
  reset()
  const response = await route.POST(request({ inquiryId, action: 'response' }))
  assert.equal(response.status, 200)
  assert.deepEqual(state.responses, [inquiryId])
})
