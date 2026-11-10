/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { createHmac } = require('node:crypto')

const root = path.resolve(__dirname, '..')
const callSid = `CA${'1'.repeat(32)}`, otherCallSid = `CA${'2'.repeat(32)}`
const trunkSid = `TK${'3'.repeat(32)}`, accountSid = `AC${'4'.repeat(32)}`
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const testNumber = '+18176630380', publicNumber = '+19563652037', transferTarget = '+15550009999'
let state

function compile(relative, stubs) {
  const filename = path.join(root, relative)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
  loaded._compile(source, filename)
  return loaded.exports
}

const incomingPhoneNumbers = () => ({ fetch: async () => ({ ...state.number }) })
incomingPhoneNumbers.list = async ({ phoneNumber }) => state.ownedTargets.includes(phoneNumber) ? [{ phoneNumber }] : []
const client = { incomingPhoneNumbers, calls: () => ({ fetch: async () => ({ ...state.carrierCall }) }) }
const service = compile('src/lib/luxorElenaPhoneTestServer.ts', {
  'server-only': {}, twilio: () => client,
  ws: class SyntheticSocket { constructor() { throw new Error('Unexpected socket: stale updates must not connect') } },
  './supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
    state.database.push({ query, init })
    if (query.startsWith('luxor_phone_numbers?')) return state.selected
    if (!query.startsWith('luxor_calls?')) throw new Error('Unexpected database operation')
    const requestedSid = new URLSearchParams(query.split('?')[1]).get('twilio_call_sid')?.replace(/^eq\./, '')
    if (!init.method) return requestedSid === state.row?.twilio_call_sid ? [structuredClone(state.row)] : []
    if (init.method === 'PATCH') {
      if (state.beforeNextPatch) { const callback = state.beforeNextPatch; state.beforeNextPatch = null; callback() }
      if (requestedSid !== state.row?.twilio_call_sid) return []
      const params = new URLSearchParams(query.split('?')[1])
      const expected = params.get('metadata->>transfer_state')?.replace(/^eq\./, '')
      if (expected && expected !== state.row.metadata.transfer_state) return []
      const expectedUpdated = params.get('updated_at')?.replace(/^eq\./, '')
      if (expectedUpdated && expectedUpdated !== state.row.updated_at) return []
      const expectedMetadata = params.get('metadata')?.replace(/^eq\./, '')
      if (expectedMetadata && JSON.stringify(JSON.parse(expectedMetadata)) !== JSON.stringify(state.row.metadata)) return []
      state.row = { ...state.row, ...JSON.parse(init.body) }
      return [structuredClone(state.row)]
    }
    if (init.method === 'POST') {
      if (!state.row) state.row = { id: 'synthetic-call', ...JSON.parse(init.body) }
      return null
    }
    throw new Error('Unexpected mutation')
  } },
  './luxorPhoneRoutingServer': { getLuxorPhoneRoutingSettings: async () => ({ ring_to_number: state.target }) },
  './luxorTourSlotsServer': { listAvailableLuxorTourSlots: async () => [{ id: 'synthetic-slot', date: '2099-11-11', label: '5:00 PM' }] },
  './luxorElenaVoiceSandboxServer': { buildElenaVoiceInstructions: async () => 'Synthetic venue instructions.' },
  './luxorElenaVoiceTestSettingsServer': { getElenaPhoneTestVoice: async () => 'marin' },
})

function reset() {
  state = {
    row: { id: 'synthetic-call', twilio_call_sid: callSid, updated_at: new Date().toISOString(), metadata: { scope: 'elena_phone_test', openai_session_id: 'live_synthetic', accepted: true, transfer_state: 'none', rehearsal_only: true } },
    number: { phoneNumber: testNumber, accountSid, trunkSid },
    carrierCall: { sid: callSid, accountSid, to: testNumber, from: '+15550001111', trunkSid, direction: 'inbound', status: 'in-progress', dateCreated: new Date() },
    selected: [{ phone_number: publicNumber, is_public: true }], target: transferTarget, ownedTargets: [], database: [], fetches: [],
  }
}

async function withConfiguration(fn) {
  const values = {
    LUXOR_ELENA_PHONE_TEST_ENABLED: 'true', LUXOR_ELENA_TEST_NUMBER: testNumber,
    OPENAI_PROJECT_ID: 'proj_synthetic', LUXOR_ELENA_TEST_TRUNK_SID: trunkSid,
    OPENAI_VOICE_WEBHOOK_SECRET: secret, OPENAI_API_KEY: 'synthetic-provider-key',
    LUXOR_TWILIO_ACCOUNT_SID: accountSid, LUXOR_TWILIO_AUTH_TOKEN: 'synthetic-carrier-token',
  }
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]])), priorFetch = global.fetch
  Object.assign(process.env, values)
  global.fetch = async (url, init) => { state.fetches.push({ url, init }); return new Response(null, { status: 200 }) }
  try { await fn() } finally {
    global.fetch = priorFetch
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
}

function rpc(name, args = {}, overrides = {}) {
  const claim = { kind: 'call', sessionId: 'live_synthetic', callSid, exp: Math.floor(Date.now() / 1000) + 1200, ...overrides }
  return new Request('https://synthetic.invalid/api/elena-phone-test/mcp', {
    method: 'POST', headers: { Authorization: `Bearer ${service.signElenaPhoneToken(claim, secret)}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
}

async function tool(name, args = {}, overrides) {
  const response = await service.handleElenaPhoneMcp(rpc(name, args, overrides))
  const data = await response.json()
  return { response, rpc: data, result: data.result, output: data.result && !data.result.isError ? JSON.parse(data.result.content[0].text) : null }
}

test('OpenAI webhook signature binds payload, delivery ID and timestamp with bounded replay', () => {
  const now = Date.now(), timestamp = String(Math.floor(now / 1000)), id = 'evt_synthetic', payload = '{"test":true}'
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${payload}`).digest('base64')
  const headers = new Headers({ 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` })
  assert.equal(service.verifyOpenAiVoiceSignature(payload, headers, secret, now), true)
  assert.equal(service.verifyOpenAiVoiceSignature(payload + ' ', headers, secret, now), false)
  assert.equal(service.verifyOpenAiVoiceSignature(payload, headers, secret, now + 301_000), false)
  assert.equal(service.verifyOpenAiVoiceSignature(payload, headers, secret, now - 301_000), false)
  headers.set('webhook-id', 'evt_other')
  assert.equal(service.verifyOpenAiVoiceSignature(payload, headers, secret, now), false)
  assert.equal(service.verifyOpenAiVoiceSignature(payload, new Headers(), secret, now), false)
})

test('phone tokens reject tampering, expiry, wrong domain secret and invalid scope identifiers', () => {
  const now = Date.now(), claim = { kind: 'call', sessionId: 'live_synthetic', callSid, exp: Math.floor(now / 1000) + 1200 }
  const token = service.signElenaPhoneToken(claim, secret)
  assert.deepEqual(service.verifyElenaPhoneToken(token, secret, now), claim)
  assert.equal(service.verifyElenaPhoneToken(token + '.extra', secret, now), null)
  assert.equal(service.verifyElenaPhoneToken(token, secret + 'x', now), null)
  assert.equal(service.verifyElenaPhoneToken(token, secret, now + 1200_000), null)
  const [content, signature] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ ...claim, callSid: otherCallSid })).toString('base64url')
  assert.equal(service.verifyElenaPhoneToken(`${forged}.${signature}`, secret, now), null)
  assert.equal(service.verifyElenaPhoneToken(`${content}.x`, secret, now), null)
  for (const invalid of [{ ...claim, sessionId: 'outside/scope' }, { ...claim, callSid: 'invalid' }, { ...claim, kind: 'admin' }, { ...claim, exp: Math.floor(now / 1000) + 1801 }]) {
    assert.equal(service.verifyElenaPhoneToken(service.signElenaPhoneToken(invalid, secret), secret, now), null)
  }
})

test('phone test fails closed unless enabled and bound to the approved test number', async () => {
  reset()
  await withConfiguration(async () => {
    assert.equal(service.elenaPhoneTestReady(), true)
    process.env.LUXOR_ELENA_PHONE_TEST_ENABLED = 'false'
    assert.equal(service.elenaPhoneTestReady(), false)
    process.env.LUXOR_ELENA_PHONE_TEST_ENABLED = 'true'
    process.env.LUXOR_ELENA_TEST_NUMBER = publicNumber
    assert.equal(service.elenaPhoneTestReady(), false)
    assert.equal(state.database.length, 0)
    assert.equal(state.fetches.length, 0)
  })
})

test('carrier verification rejects calls to the public line before OpenAI acceptance', async () => {
  reset(); state.row = null; state.carrierCall.to = publicNumber
  await withConfiguration(async () => {
    await assert.rejects(service.acceptElenaPhoneTestEvent({ id: 'evt_synthetic', type: 'live.transport.incoming', created_at: Math.floor(Date.now() / 1000), data: { type: 'sip', session_id: 'live_synthetic', sip_headers: [{ name: 'X-Twilio-CallSid', value: callSid }] } }), /outside the authorized phone test/)
    assert.equal(state.fetches.length, 0)
    assert.equal(state.database.filter(({ init }) => init.method).length, 0)
  })
})

test('phone tools reject a token for another session or inactive carrier call', async () => {
  reset()
  await withConfiguration(async () => {
    let outcome = await tool('available_tour_times', {}, { sessionId: 'live_other' })
    assert.equal(outcome.result.isError, true)
    state.carrierCall.status = 'completed'
    outcome = await tool('available_tour_times')
    assert.equal(outcome.result.isError, true)
    assert.equal(state.fetches.length, 0)
  })
})

test('phone booking tool only rehearses a fresh published slot and never creates a booking', async () => {
  reset()
  await withConfiguration(async () => {
    assert.equal((await tool('rehearse_booking', { slot_id: 'synthetic-slot', confirmed: false })).result.isError, true)
    assert.equal((await tool('rehearse_booking', { slot_id: 'invented-slot', confirmed: true })).result.isError, true)
    const outcome = await tool('rehearse_booking', { slot_id: 'synthetic-slot', confirmed: true, full_name: 'Synthetic Caller', email: 'caller@example.invalid', callback_number: '+15550001111' })
    assert.equal(outcome.output.rehearsal_only, true)
    assert.equal(outcome.output.booked, false)
    assert.match(outcome.output.message, /No real tour was reserved/)
    assert.equal(state.database.filter(({ init }) => init.method).length, 0)
    assert.equal(state.fetches.length, 0)
  })
})

test('transfer rejects protected, owned, changed and caller-supplied destinations', async () => {
  reset()
  await withConfiguration(async () => {
    for (const target of [publicNumber, testNumber]) {
      state.target = target
      assert.equal((await tool('prepare_transfer', { target: transferTarget })).result.isError, true)
    }
    state.target = transferTarget; state.ownedTargets = [transferTarget]
    assert.equal((await tool('prepare_transfer')).result.isError, true)
    state.ownedTargets = []
    const prepared = await tool('prepare_transfer', { target: '+15558888888' })
    assert.equal(prepared.result.isError, undefined)
    const tokenPayload = JSON.parse(Buffer.from(prepared.output.token.split('.')[0], 'base64url').toString('utf8'))
    assert.equal(tokenPayload.target, undefined)
    assert.doesNotMatch(JSON.stringify(tokenPayload), new RegExp(transferTarget.replace('+', '\\+')))
    assert.match(tokenPayload.targetHash, /^[0-9a-f]{64}$/)
    state.target = '+15557777777'
    assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).result.isError, true)
    assert.equal(state.fetches.length, 0)
  })
})

test('real transfer requires current approval and is attempted at most once', async () => {
  reset()
  await withConfiguration(async () => {
    assert.equal((await tool('confirm_transfer', { spoken_confirmation: 'yes' })).result.isError, true)
    const prepared = await tool('prepare_transfer')
    assert.equal((await tool('prepare_transfer')).result.isError, true)
    assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes, but not now' })).result.isError, true)
    assert.equal(state.fetches.length, 0)
    const outcome = await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'Yes, please.' })
    assert.equal(outcome.output.requested, true)
    assert.equal(outcome.output.answered, false)
    assert.equal(state.fetches.length, 1)
    assert.deepEqual(JSON.parse(state.fetches[0].init.body), { target_uri: `tel:${transferTarget}` })
    assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).result.isError, true)
    assert.equal(state.fetches.length, 1)
    assert.ok(state.database.filter(({ init }) => init.method).every(({ query }) => query.startsWith('luxor_calls?')))
  })
})

test('a stale greeting update cannot undo a concurrent transfer attempt', async () => {
  reset()
  await withConfiguration(async () => {
    state.beforeNextPatch = () => {
      state.row.metadata.transfer_state = 'attempted'
      state.row.metadata.transfer_nonce = 'synthetic-concurrent-transfer'
      state.row.updated_at = new Date(Date.parse(state.row.updated_at) + 1).toISOString()
    }
    await service.greetElenaPhoneTest('live_synthetic', callSid)
    assert.equal(state.row.metadata.transfer_state, 'attempted')
    assert.equal(state.row.metadata.transfer_nonce, 'synthetic-concurrent-transfer')
    assert.equal(state.row.metadata.greeting_requested, undefined)
    assert.equal(state.fetches.length, 0)
  })
})

test('completion callback verifies carrier and test destination and never starts recording or messaging', async () => {
  reset()
  let validSignature = true
  const writes = []
  const statusRoute = compile('src/app/api/elena-phone-test/status/route.ts', {
    '@/lib/luxorElenaPhoneTestServer': { ELENA_PHONE_TEST_NUMBER: testNumber },
    '@/lib/luxorTwilioServer': {
      readTwilioForm: async (request) => request.form,
      validateTwilioWebhook: () => validSignature,
      normalizeTwilioCallStatus: (value) => value,
      parseTwilioInteger: (value) => Number(value),
    },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
      writes.push({ query, init })
      return init.method ? [{ twilio_call_sid: callSid }] : [{ updated_at: state.row.updated_at }]
    } },
  })
  await withConfiguration(async () => {
    const form = { CallSid: callSid, AccountSid: accountSid, To: testNumber, CallStatus: 'completed', CallDuration: '37' }
    validSignature = false
    assert.equal((await statusRoute.POST({ form })).status, 403)
    validSignature = true
    assert.equal((await statusRoute.POST({ form: { ...form, To: publicNumber } })).status, 403)
    assert.equal((await statusRoute.POST({ form: { ...form, AccountSid: 'unrelated-account' } })).status, 403)
    assert.equal(writes.length, 0)
    assert.equal((await (await statusRoute.POST({ form: { ...form, CallStatus: 'in-progress' } })).json()).ignored, true)
    assert.equal(writes.length, 0)
    assert.equal((await statusRoute.POST({ form })).status, 200)
    assert.equal(writes.length, 2)
    assert.ok(writes.every(({ query }) => query.includes('metadata->>scope=eq.elena_phone_test')))
    const patch = JSON.parse(writes[1].init.body)
    assert.equal(patch.status, 'completed')
    assert.equal(patch.duration_seconds, 37)
    assert.equal(patch.metadata, undefined)
    assert.equal(patch.recording_consent_status, undefined)
    assert.equal(patch.transcription_status, undefined)
    assert.equal(state.fetches.length, 0)
  })
})
