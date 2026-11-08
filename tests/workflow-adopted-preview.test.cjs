/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const task = '11111111-1111-4111-8111-111111111111'
const inquiry = '22222222-2222-4222-8222-222222222222'
const enrollment = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const reviewId = '55555555-5555-4555-8555-555555555555'
const slotId = '66666666-6666-4666-8666-666666666666'
const actionId = (i) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`
const recordId = (i) => `88888888-8888-4888-8888-${String(i).padStart(12, '0')}`
const fixedNow = '2026-11-08T10:00:00.000Z'
const req = { nextUrl: new URL(`https://example.invalid/?taskId=${task}&inquiryId=${inquiry}`) }

function ledger() {
  return Array.from({ length: 9 }, (_, i) => {
    const channel = i % 2 === 0 ? 'call' : 'email'
    const stepKey = i === 2 ? 'phone_2' : `step_${i}`
    return { action_id: actionId(i), run_id: runId, inquiry_id: inquiry, enrollment_id: enrollment,
      step_key: stepKey, ordinal: i, delay_days: i, channel,
      designation: i === 2 ? 'current' : i < 4 ? 'historical' : 'deferred',
      record_table: channel === 'call' ? 'luxor_tasks' : 'luxor_email_jobs', record_id: i === 2 ? task : recordId(i),
      template_image: { name: `Step ${i}`, step_key: stepKey, channel: channel === 'call' ? 'phone' : 'email', delay_days: i, active: true } }
  })
}

function route({ adoption = false, error = null, ordered = false, fixture = null, readsEnabled = true } = {}) {
  const calls = []
  const queries = []
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])) } static now() { return Date.parse(fixedNow) } }
  const strict = async (url, options = {}) => {
    queries.push({ url, method: options.method || 'GET' })
    if (!fixture) throw new Error('Unavailable schema')
    if (url.startsWith('luxor_adoption_actions?') && url.includes('record_id=')) return fixture.current ?? [fixture.actions[2]]
    if (url.startsWith('luxor_adoption_actions?')) return fixture.actions
    if (url.startsWith('luxor_adoption_runs?')) return fixture.runs ?? [{ state:'applied', inquiry_id:inquiry, invalidation_floor:0, producer_review_id:reviewId }]
    if (url.startsWith('luxor_adoption_gates?')) return fixture.gates ?? [{ held:true }]
    if (url.startsWith('luxor_workflow_contact_slots?')) {
      if (!url.includes('status=eq.held')) throw new Error('Adopted call preview must query held slots')
      return fixture.slots ?? [{ id:slotId }]
    }
    if (url.startsWith('luxor_adoption_invalidations?')) return fixture.invalidations ?? []
    if (url.startsWith('luxor_adoption_producer_reviews?')) return fixture.reviews ?? [{ valid:true }]
    if (url === 'rpc/luxor_adoption_preview_admitted') {
      if (fixture.admissionError) throw new Error('Admission schema unavailable')
      return fixture.admitted ?? true
    }
    throw new Error(`Unexpected query ${url}`)
  }
  const deps = {
    'next/server': { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({}) },
    '@/lib/luxorFollowUpsServer': {},
    '@/lib/luxorInquiriesServer': { getLuxorInquiry: async () => fixture?.lead ?? { status:'new', marketing_opt_in:true, phone:'5551234567', email:'synthetic@example.invalid' } },
    '@/lib/luxorInquiryTypes': { isLuxorInquiryArchived: () => false },
    '@/lib/luxorOrderedBrochurePlan': {},
    '@/lib/luxorWorkflowTentativePreview': {},
    '@/lib/luxorLegacyAdoptionServer': { legacyAdoptionEnabled: () => readsEnabled, isAdoptedTask: async (id) => {
      calls.push(id)
      if (error) throw error
      return adoption
    } },
    '@/lib/supabaseRestServer': { supabaseRestStrict: strict, supabaseRest: async (url) => {
      if (url.startsWith('luxor_tasks?')) return [{ id: task, inquiry_id: inquiry, status: 'pending', automation_enrollment_id: enrollment, automation_step_key: 'phone_2' }]
      if (url.startsWith('luxor_follow_up_enrollments?')) return [{ id: enrollment, inquiry_id: inquiry, status: 'active', ordered_progression_required: ordered }]
      if (url.startsWith('luxor_workflow_contact_slots?')) return []
      throw new Error('Unexpected query')
    } },
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/app/api/workflow-next-preview/route.ts'), 'utf8')
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS })
  const mod = { exports: {} }
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (name) => {
    if (!(name in deps)) throw new Error(`Unexpected import: ${name}`)
    return deps[name]
  }, Date: FixedDate, Number, Set, Promise, URL })
  return { GET: mod.exports.GET, calls, queries }
}

test('adopted legacy enrollment never returns a fixed legacy task', async () => {
  const { GET, calls } = route({ adoption: true })
  const result = await GET(req)
  assert.equal(result.body.mode, 'ordered')
  assert.equal(result.body.preview.type, 'unavailable')
  assert.deepEqual(calls, [task])
})

test('verified non-adopted legacy task retains legacy preview', async () => {
  const { GET, calls } = route()
  const result = await GET(req)
  assert.equal(result.body.mode, 'legacy')
  assert.deepEqual(calls, [task])
})

test('adopted preview remains unavailable until adoption read views are enabled', async () => {
  const { GET, queries } = route({ adoption:true, readsEnabled:false, fixture:{ actions:ledger() } })
  const result = await GET(req)
  assert.equal(result.body.preview.type, 'unavailable')
  assert.equal(queries.some((q) => q.url === 'rpc/luxor_adoption_preview_admitted'), false)
  const legacy = await route({ adoption:false, readsEnabled:false }).GET(req)
  assert.equal(legacy.body.mode, 'legacy')
})

test('missing, inaccessible, or stale adoption ownership fails closed', async () => {
  for (const error of [new Error('missing schema'), new Error('permission denied'), new Error('schema cache stale')]) {
    const result = await route({ error }).GET(req)
    assert.equal(result.body.mode, 'ordered')
    assert.equal(result.body.preview.type, 'unavailable')
  }
})

test('ordinary ordered path does not depend on adoption lookup', async () => {
  const { GET, calls } = route({ ordered: true })
  const result = await GET(req)
  assert.equal(result.body.mode, 'ordered')
  assert.equal(result.body.preview.type, 'unavailable')
  assert.equal(calls.length, 0)
})

test('adopted preview skips historical steps and calculates from assumed completion, not original dates', async () => {
  const { GET, queries } = route({ adoption:true, fixture:{ actions:ledger() } })
  const result = await GET(req)
  assert.equal(result.body.preview.type, 'next')
  assert.equal(result.body.preview.title, 'Step 4')
  assert.equal(result.body.preview.tentativeAt, '2026-11-10T10:00:00.000Z')
  assert.equal(result.body.preview.requiresReview, true)
  assert.deepEqual(queries.filter((q) => q.method === 'POST').map((q) => q.url), ['rpc/luxor_adoption_preview_admitted'])
  assert.equal(queries.some((q) => q.url.includes('status=eq.held')), true)
})

test('adopted preview fails closed for stale or ambiguous evidence', async () => {
  for (const overrides of [
    { runs:[{ state:'review', inquiry_id:inquiry, invalidation_floor:0, producer_review_id:reviewId }] },
    { gates:[{ held:false }] }, { slots:[] }, { invalidations:[{id:1}] }, { reviews:[{valid:false}] },
    { admitted:false }, { admissionError:true },
    { actions:ledger().map((a,i) => i === 4 ? {...a, designation:'review'} : a) },
    { actions:ledger().map((a,i) => i === 4 ? {...a, delay_days:0} : a) },
    { actions:ledger().map((a,i) => i === 4 ? {...a, template_image:{...a.template_image, step_key:'wrong'}} : a) },
    { actions:ledger().slice(0,8) }, { lead:{ status:'new', marketing_opt_in:false, phone:'555', email:'synthetic@example.invalid' } },
  ]) {
    const result = await route({ adoption:true, fixture:{ actions:ledger(), ...overrides } }).GET(req)
    assert.equal(result.body.preview.type, 'unavailable')
  }
})

test('adopted final action returns finished without creating another task', async () => {
  const actions=ledger().map((a,i) => i > 2 ? {...a, designation:'historical'} : a)
  const { GET, queries } = route({ adoption:true, fixture:{ actions } })
  const result=await GET(req)
  assert.equal(result.body.preview.type, 'finished')
  assert.equal(queries.some((q) => /luxor_tasks/.test(q.url) && q.method !== 'GET'), false)
})

test('display preserves the tentative review requirement without a materialized task', () => {
  const source=fs.readFileSync(path.join(__dirname, '../src/lib/luxorNextFollowUpDisplay.ts'), 'utf8')
  const mod={exports:{}}
  vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS}),{module:mod,exports:mod.exports,Date,Number})
  const display=mod.exports.selectNextFollowUpDisplay(
    {status:'fulfilled',value:[]},
    {status:'fulfilled',value:{mode:'ordered',preview:{type:'next',title:'Step 4',tentativeAt:'2026-11-10T10:00:00.000Z',requiresReview:true}}},
    task,
  )
  assert.equal(display.summary.tentative,true)
  assert.equal(display.summary.requiresReview,true)
  assert.equal(display.summary.task,undefined)
})
