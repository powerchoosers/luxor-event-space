/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const callSid = `CA${'1'.repeat(32)}`, childSid = `CA${'2'.repeat(32)}`
const numberSid = `PN${'3'.repeat(32)}`, number = '+15550002222', sessionId = 'live_synthetic_accepted'
let state

function compile(relative, stubs) {
  const filename = path.join(root, relative)
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
  loaded._compile(js, filename)
  return loaded.exports
}

const eligibility = compile('src/lib/luxorElenaInboundNotification.ts', {})
const service = compile('src/lib/luxorElenaInboundNotificationServer.ts', {
  'server-only': {}, './luxorElenaInboundNotification': eligibility,
  './supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
    state.requests.push({ query, init })
    if (state.dbFails) throw new Error('Synthetic database unavailable')
    if (query.startsWith('luxor_phone_numbers?')) return structuredClone(state.selected)
    assert.ok(query.startsWith('luxor_calls?'), 'Only approved call and public-number records may be accessed')
    const filters = new URLSearchParams(query.split('?')[1])
    if (!init.method) return state.row && filters.get('twilio_call_sid') === `eq.${state.row.twilio_call_sid}` ? [structuredClone(state.row)] : []
    assert.equal(init.method, 'PATCH')
    if (state.race) { const race = state.race; state.race = null; race() }
    if (!state.row) return []
    for (const [key, condition] of filters) {
      if (key === 'select') continue
      const actual = key.startsWith('metadata->>') ? state.row.metadata[key.slice(11)] : state.row[key]
      if (condition === 'is.null' ? actual !== null && actual !== undefined : condition !== `eq.${actual}`) return []
    }
    const patch = JSON.parse(init.body)
    assert.ok(Date.parse(patch.updated_at) > Date.parse(state.row.updated_at), 'CAS versions must advance even in the same millisecond')
    state.row = { ...state.row, ...patch }
    state.writes.push(patch)
    return [structuredClone(state.row)]
  } },
  './luxorWebPushServer': { sendLuxorWebPush: async (...args) => {
    assert.equal(state.row.is_read, false, 'The durable unread portal notice must precede the optional push')
    assert.ok(state.row.metadata.elena_answered_notification_claimed_at, 'Claim must precede external side effect')
    state.pushes.push(args)
    if (state.pushThrows) throw new Error('Synthetic provider error containing caller-private-data')
    return state.pushResult
  } },
})

function reset() {
  state = {
    selected: [{ phone_number: number, twilio_number_sid: numberSid, is_public: true }],
    row: { twilio_call_sid: callSid, direction: 'inbound', to_number: number, status: 'in-progress', is_read: true,
      from_number: '+15550001111', contact_name: 'Synthetic Caller', updated_at: new Date().toISOString(),
      metadata: { scope: 'elena_live_inbound', ingress_mode: 'programmable_sip', accepted: true,
        openai_session_id: sessionId, sip_answered: true, sip_child_call_sid: childSid, sip_answered_at: '2026-11-11T12:00:00.000Z', transfer_state: 'prepared' } },
    requests: [], writes: [], pushes: [], race: null, dbFails: false, pushThrows: false,
    pushResult: { configured: true, sent: 1, failed: 0, deliveredSubscriptionIds: ['synthetic-subscription'] },
  }
}

async function configured(fn) {
  const values = { LUXOR_ELENA_LIVE_INBOUND_ENABLED: 'true', LUXOR_ELENA_LIVE_NUMBER: number, LUXOR_ELENA_LIVE_NUMBER_SID: numberSid }
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]])), originalFetch = global.fetch
  Object.assign(process.env, values)
  global.fetch = async () => { throw new Error('Notification tests must never contact live services') }
  try { await fn() } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
}
const notify = () => service.notifyElenaInboundAnswered({ callSid, sessionId })

test('notification stays disabled without explicit live configuration and the sole matching public number', async () => {
  reset()
  await configured(async () => {
    process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'false'
    assert.equal((await notify()).status, 'skipped')
    assert.equal(state.requests.length, 0)
    process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'true'
    for (const selected of [[], [{ ...state.selected[0], is_public: false }], [{ ...state.selected[0], twilio_number_sid: `PN${'9'.repeat(32)}` }], [state.selected[0], state.selected[0]]]) {
      state.selected = selected
      assert.equal((await notify()).status, 'skipped')
    }
    assert.equal(state.writes.length, 0)
    assert.equal(state.pushes.length, 0)
    process.env.LUXOR_ELENA_LIVE_NUMBER = '+18176630380'
    assert.equal((await notify()).status, 'skipped')
  })
})

test('acceptance alone, test scope, mismatched sessions and unverified carrier answers cannot claim an answered notice', async () => {
  await configured(async () => {
    const invalid = [
      (row) => { row.metadata.scope = 'elena_phone_test' },
      (row) => { row.metadata.accepted = false },
      (row) => { row.metadata.openai_session_id = 'live_another_session' },
      (row) => { delete row.metadata.sip_answered },
      (row) => { delete row.metadata.sip_answered_at },
      (row) => { row.metadata.sip_answered_at = 'invalid-date' },
      (row) => { row.metadata.sip_child_call_sid = row.twilio_call_sid },
      (row) => { row.metadata.sip_child_call_sid = 'forged' },
      (row) => { row.to_number = '+15550009999' },
      (row) => { row.direction = 'outbound' },
    ]
    for (const mutate of invalid) {
      reset(); mutate(state.row)
      assert.equal((await notify()).status, 'skipped')
      assert.equal(state.writes.length, 0)
      assert.equal(state.pushes.length, 0)
    }
  })
})

test('carrier-confirmed live answer creates a durable unread notice and private owner push once', async () => {
  reset()
  await configured(async () => {
    assert.deepEqual(await notify(), { status: 'accepted', accepted: 1, failed: 0 })
    assert.equal(state.row.metadata.elena_answered_at, state.row.metadata.sip_answered_at)
    assert.equal(state.row.metadata.transfer_state, 'prepared')
    assert.equal(state.row.is_read, false)
    assert.equal(state.pushes.length, 1)
    const [type, payload, options] = state.pushes[0]
    assert.equal(type, 'call')
    assert.equal(payload.title, 'Elena answered a call')
    assert.equal(payload.body, 'Open the call to review caller details and the next step.')
    assert.equal(payload.url, '/portal/calls')
    assert.deepEqual(options, { userEmail: 'a.patterson@luxoratlaspalmas.com' })
    assert.ok(!JSON.stringify(payload).includes(state.row.from_number))
    assert.ok(!JSON.stringify(payload).includes(state.row.contact_name))
    assert.deepEqual(state.row.metadata.elena_answered_push_result, { status: 'accepted', accepted: 1, failed: 0, attempted_at: state.row.metadata.elena_answered_notification_claimed_at })
    assert.equal((await notify()).status, 'duplicate')
    assert.equal(state.pushes.length, 1)
  })
})

test('concurrent callbacks claim only one push and preserve metadata added by another call update', async () => {
  reset()
  await configured(async () => {
    state.race = () => {
      state.row.metadata.transfer_state = 'attempted'
      state.row.metadata.greeting_transcript_observed = true
      state.row.updated_at = new Date(Date.parse(state.row.updated_at) + 1).toISOString()
    }
    const results = await Promise.all([notify(), notify()])
    assert.equal(results.filter((result) => result.status === 'accepted').length, 1)
    assert.equal(state.pushes.length, 1)
    assert.equal(state.row.metadata.transfer_state, 'attempted')
    assert.equal(state.row.metadata.greeting_transcript_observed, true)
    assert.equal(state.row.is_read, false)
  })
})

test('missing push setup, no subscribers and provider failure retain a truthful portal notice without repeat sends', async () => {
  await configured(async () => {
    for (const mode of ['unconfigured', 'no-subscribers', 'failed', 'throw']) {
      reset()
      state.pushResult = { configured: mode !== 'unconfigured', sent: 0, failed: mode === 'failed' ? 1 : 0, deliveredSubscriptionIds: [] }
      state.pushThrows = mode === 'throw'
      const result = await notify()
      assert.equal(result.status, ['failed', 'throw'].includes(mode) ? 'failed' : 'unavailable')
      assert.equal(state.row.is_read, false)
      assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), true)
      assert.equal((await notify()).status, 'duplicate')
      assert.equal(state.pushes.length, 1)
    }
  })
})

test('a delayed signed answer still creates one notice after call completion, using actual answer time', async () => {
  reset()
  await configured(async () => {
    state.row.status = 'completed'
    assert.equal((await notify()).status, 'accepted')
    assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), true)
    assert.equal(state.row.metadata.elena_answered_at, '2026-11-11T12:00:00.000Z')
  })
})

test('portal answered-call eligibility needs both verified answer proof and the durable notice marker', () => {
  reset()
  assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), false)
  state.row.metadata.elena_answered_at = state.row.metadata.sip_answered_at
  assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), true)
  state.row.status = 'completed'
  assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), true)
  state.row.metadata.sip_child_call_sid = callSid
  assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), false)
  state.row.metadata = { scope: 'elena_phone_test', accepted: true }
  assert.equal(eligibility.isElenaLiveAnsweredCall(state.row), false)
  assert.equal(eligibility.isElenaLiveAnsweredCall({ direction: 'inbound', status: 'no-answer', metadata: {} }), false)
})

test('actual portal notification mapping preserves missed calls and labels only confirmed Elena answers', async () => {
  reset()
  const values = []
  const hooks = compile('src/hooks/usePortalNotifications.ts', {
    react: {
      useState: (initial) => { const index = values.length; values.push(typeof initial === 'function' ? initial() : initial); return [values[index], (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
      useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
    },
    '@/lib/luxorTextUtils': { decodeHtmlEntities: (text) => text },
    '@/lib/supabaseClient': { getPortalSupabaseClient: () => null },
    '@/lib/luxorEmailBounce': {}, '@/lib/luxorInvoiceNotificationEligibility': {},
    '@/lib/luxorElenaInboundNotification': eligibility,
  })
  const now = new Date().toISOString()
  const calls = [
    { ...structuredClone(state.row), id: 'elena', inquiry_id: 'lead-synthetic', status: 'completed', is_read: false, created_at: now,
      metadata: { ...state.row.metadata, sip_answered_at: now, elena_answered_at: now } },
    { ...structuredClone(state.row), id: 'accepted-only', status: 'in-progress', created_at: now },
    { id: 'missed', direction: 'inbound', status: 'no-answer', from_number: '+15550004444', contact_name: 'Other Caller', created_at: now, is_read: false },
    { id: 'service-failed', direction: 'inbound', status: 'completed', outcome: 'missed', from_number: '+15550003333', created_at: now, is_read: false },
    { id: 'regular-completed', direction: 'inbound', status: 'completed', created_at: now },
  ]
  const previous = { fetch: global.fetch, window: global.window, localStorage: global.localStorage, CustomEvent: global.CustomEvent }
  const stored = new Map()
  global.window = { dispatchEvent: () => {} }
  global.localStorage = { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) }
  global.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail } }
  global.fetch = async (url) => {
    assert.match(url, /^\/api\/portal\/notifications\/summary\?/)
    const sourceData = { calls, inquiries: [], emails: { messages: [] }, messages: [], invoices: [], expenses: [], bookings: [], payments: [], signatures: [], marketingEvents: { events: [] }, layoutReviews: { feedback: [] }, calendarResponses: { responses: [] } }
    return Response.json({ sources: Object.fromEntries(Object.entries(sourceData).map(([key, data]) => [key, { ok: true, data }])) })
  }
  try {
    await hooks.usePortalNotifications().refresh()
    assert.equal(values[3], null, 'Actual notification aggregation must complete without errors')
    assert.equal(values[0].length, 3)
    const answered = values[0].find((item) => item.id === 'call_elena')
    assert.equal(answered.title, 'Elena answered a call')
    assert.equal(answered.subtitle, eligibility.ELENA_ANSWERED_NOTIFICATION_BODY)
    assert.equal(answered.isRead, false)
    assert.equal(answered.targetUrl, '/portal/leads/lead-synthetic?tab=activity')
    assert.equal(answered.metadata.elenaAnswered, true)
    const missed = values[0].find((item) => item.id === 'call_missed')
    assert.equal(missed.title, 'Missed call from Other Caller')
    assert.equal(missed.subtitle, 'Phone: +15550004444')
    assert.equal(missed.targetUrl, '/portal/calls')
    assert.equal(missed.metadata.elenaAnswered, false)
    const failed = values[0].find((item) => item.id === 'call_service-failed')
    assert.equal(failed.title, 'Missed call from +15550003333')
    assert.equal(failed.isRead, false, 'Fallback speech ending the parent call must not hide a genuine missed caller')
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete global[key]; else global[key] = value }
  }
})
