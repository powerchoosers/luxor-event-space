/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
let state

function loadTypeScript(filePath, stubs = {}) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(path.join(root, `${path.basename(filePath)}.synthetic.cjs`), module)
  loaded.filename = path.join(root, `${path.basename(filePath)}.synthetic.cjs`)
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, loaded.filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

const model = loadTypeScript('src/lib/luxorAutomationsLibrary.ts')

function templates(count = 9, overrides = {}) {
  const channels = ['email', 'phone', 'email', 'phone', 'email', 'phone', 'email', 'phone', 'email']
  return Array.from({ length: count }, (_, index) => ({
    automation_key: 'brochure_lead',
    step_key: `step_${index + 1}`,
    sort_order: (index + 1) * 10,
    channel: channels[index % channels.length],
    delay_days: index === 0 ? 0 : index,
    name: `Saved step ${index + 1}`,
    active: true,
    uses_existing_delivery: index === 0,
    ...overrides,
  }))
}

function automation(overrides = {}) {
  return {
    automation_key: 'brochure_lead',
    name: 'Brochure Lead Follow-Up',
    enabled: true,
    send_approved: true,
    timing_configured: true,
    timezone: 'America/Chicago',
    updated_at: '2026-10-05T15:29:04.817331+00:00',
    ...overrides,
  }
}

function loadRoute() {
  return loadTypeScript('src/app/api/marketing/automations/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => state.authenticated ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorFollowUpsServer': {
      isLuxorBrochureFollowUpSendingEnabled: async () => {
        if (state.gateError) throw new Error('synthetic runtime gate error')
        return state.sendsConfigured
      },
    },
    '@/lib/supabaseRestServer': {
      supabaseRest: async (query, init = {}) => {
        state.restCalls.push({ query, method: (init.method || 'GET').toUpperCase() })
        if (state.readError) throw new Error('synthetic database read failure')
        if (query.startsWith('luxor_follow_up_automations?')) return state.automations
        if (query.startsWith('luxor_follow_up_templates?')) return state.templates
        throw new Error(`Unexpected read query ${query}`)
      },
      supabaseRestCount: async (query) => {
        state.countCalls.push({ query, method: 'HEAD' })
        if (state.countErrorFor?.(query)) throw new Error('synthetic exact count failure')
        if (query.startsWith('luxor_follow_up_automations?')) return state.automationTotal
        if (query.startsWith('luxor_follow_up_templates?')) return state.templateTotal
        if (query.includes('luxor_follow_up_enrollments?')) return state.metrics.activeEnrollments
        if (query.includes('luxor_email_jobs?') && query.includes('metadata->>automation_key')) return state.metrics.sentFollowUp
        if (query.includes('luxor_email_jobs?') && query.includes('tour_revision_id')) return state.metrics.sentTour
        throw new Error(`Unexpected count query ${query}`)
      },
    },
    '@/lib/luxorAutomationsLibrary': model,
  })
}

function reset(overrides = {}) {
  state = {
    authenticated: true,
    sendsConfigured: true,
    gateError: false,
    readError: false,
    automationTotal: 1,
    templateTotal: 9,
    automations: [automation()],
    templates: templates(),
    metrics: { activeEnrollments: 3, sentFollowUp: 7, sentTour: 2 },
    countErrorFor: null,
    restCalls: [],
    countCalls: [],
    ...overrides,
  }
}

async function getPayload(route) {
  const response = await route.GET()
  return { response, payload: await response.json() }
}

test('active status requires complete saved configuration and the live send gate', async () => {
  reset()
  const route = loadRoute()
  const { response, payload } = await getPayload(route)
  assert.equal(response.status, 200)
  assert.equal(payload.workflows[0].status, 'active')
  assert.equal(payload.workflows[0].stepsCount, 9)
  assert.equal(payload.workflows[0].channelSummary, 'Email + Phone tasks')
  assert.equal(payload.workflows[0].activeEnrollmentCount, 3)
  assert.equal(payload.workflows[0].sentMessageCount, 7)
  assert.deepEqual(payload.totals, { total: 1, active: 1, draft: 0, paused: 0 })
})

test('complete setup with a disabled runtime gate is paused, not active', async () => {
  reset({ sendsConfigured: false })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].status, 'paused')
  assert.equal(payload.totals.active, 0)
  assert.equal(payload.totals.paused, 1)
})

test('incomplete approval or steps are drafts and do not become active', async () => {
  reset({ automations: [automation({ send_approved: false })], sendsConfigured: false })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].status, 'draft')
  assert.equal(payload.totals.draft, 1)

  reset({ templates: templates(8), templateTotal: 8 })
  const incomplete = await getPayload(loadRoute())
  assert.equal(incomplete.payload.workflows[0].status, 'draft')
})

test('unknown runtime state withholds status totals instead of presenting zero', async () => {
  reset({ gateError: true })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].status, 'unknown')
  assert.equal(payload.totals.total, 1)
  assert.equal(payload.totals.active, null)
  assert.equal(payload.totals.draft, null)
  assert.equal(payload.totals.paused, null)
})

test('missing saved configuration fields stay unknown instead of being treated as a draft or active', async () => {
  reset({ automations: [automation({ timezone: null })] })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].status, 'unknown')
  assert.equal(payload.totals.active, null)
  assert.equal(payload.totals.draft, null)
  assert.equal(payload.totals.paused, null)
})

test('unknown saved definitions are visible but cannot inflate status buckets', async () => {
  const unknown = automation({ automation_key: 'unmapped_flow', name: 'Saved but unverified' })
  reset({ automations: [unknown], automationTotal: 1, templates: [], templateTotal: 0 })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].status, 'unknown')
  assert.equal(payload.totals.total, 1)
  assert.equal(payload.totals.active, null)
})

test('exact totals and activity counts exclude test leads and test-run jobs', async () => {
  reset()
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.systemManaged.status, 'system-managed')
  assert.equal(payload.systemManaged.activeEnrollmentCount, null)
  assert.equal(payload.systemManaged.sentMessageCount, 2)
  const enrollmentCount = state.countCalls.find((item) => item.query.includes('luxor_follow_up_enrollments?'))
  const emailCount = state.countCalls.find((item) => item.query.includes('metadata->>automation_key'))
  const tourCount = state.countCalls.find((item) => item.query.includes('tour_revision_id'))
  for (const query of [enrollmentCount.query, emailCount.query, tourCount.query]) {
    assert.match(query, /luxor_inquiries\.is_test=eq\.false/)
  }
  assert.match(emailCount.query, /test_run_id=is\.null/)
  assert.match(tourCount.query, /test_run_id=is\.null/)
  assert.ok(state.countCalls.every((item) => item.method === 'HEAD'))
  assert.ok(state.restCalls.every((item) => item.method === 'GET'))
  assert.equal(state.restCalls.some((item) => ['POST', 'PATCH', 'DELETE'].includes(item.method)), false)
})

test('count failures remain unavailable instead of becoming zero', async () => {
  reset({ countErrorFor: (query) => query.includes('luxor_follow_up_enrollments?') })
  const { payload } = await getPayload(loadRoute())
  assert.equal(payload.workflows[0].activeEnrollmentCount, null)
  assert.equal(payload.workflows[0].sentMessageCount, 7)
})

test('an empty saved-workflow table returns real zero totals and a separate tour item', async () => {
  reset({ automations: [], templates: [], automationTotal: 0, templateTotal: 0 })
  const { payload } = await getPayload(loadRoute())
  assert.deepEqual(payload.workflows, [])
  assert.deepEqual(payload.totals, { total: 0, active: 0, draft: 0, paused: 0 })
  assert.equal(payload.systemManaged.kind, 'system')
})

test('load failures return an actionable error and unauthenticated requests do not read data', async () => {
  reset({ readError: true })
  const failed = await getPayload(loadRoute())
  assert.equal(failed.response.status, 500)
  assert.match(failed.payload.error, /Try again/i)

  reset({ authenticated: false })
  const unauthenticated = await getPayload(loadRoute())
  assert.equal(unauthenticated.response.status, 401)
  assert.equal(state.countCalls.length, 0)
  assert.equal(state.restCalls.length, 0)
})

test('search and status filters work together, and an open target resolves to its own entry', () => {
  const saved = { id: 'brochure_lead', kind: 'saved', status: 'active', name: 'Brochure Lead Follow-Up' }
  const paused = { id: 'past_leads', kind: 'saved', status: 'paused', name: 'Past Lead Re-engagement' }
  const system = { id: 'system:tour-notifications', kind: 'system', status: 'system-managed', name: 'Tour confirmations & reminders' }
  const entries = [saved, paused, system]

  assert.deepEqual(model.filterAutomationLibrary(entries, '  BROCHURE ', 'active'), [saved])
  assert.deepEqual(model.filterAutomationLibrary(entries, 'lead', 'paused'), [paused])
  assert.deepEqual(model.filterAutomationLibrary(entries, 'tour', 'active'), [])
  assert.equal(model.findAutomationLibraryEntry(entries, 'past_leads'), paused)
  assert.equal(model.findAutomationLibraryEntry(entries, 'missing'), null)

  const totals = model.summarizeSavedAutomations(entries, 2)
  assert.deepEqual(totals, { total: 2, active: 1, draft: 0, paused: 1 })
})

test('library UI includes loading, empty, no-match, error, and retry states', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/marketing/tabs/AutomationsLibraryTab.tsx'), 'utf8')
  assert.match(source, /Loading automations/)
  assert.match(source, /No saved automations yet/)
  assert.match(source, /No automations match those filters/)
  assert.match(source, /role="alert"/)
  assert.match(source, /Try again/)
  assert.match(source, /setRetryVersion/)
})
