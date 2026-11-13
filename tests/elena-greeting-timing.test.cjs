/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { EventEmitter } = require('node:events')
const root = path.resolve(__dirname, '..')
const callSid = `CA${'1'.repeat(32)}`
const numberSid = `PN${'4'.repeat(32)}`, accountSid = `AC${'5'.repeat(32)}`
const number = '+19563652037', target = '+15550001111', secret = `whsec_${Buffer.alloc(32, 8).toString('base64')}`
let state
const originalFetch = global.fetch
test.after(() => { global.fetch = originalFetch })
function compile(relative, stubs) {
  const filename = path.join(root, relative)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
  loaded._compile(source, filename); return loaded.exports
}
function matches(query) {
  for (const [key, condition] of new URLSearchParams(query.split('?')[1])) {
    if (['select', 'limit', 'on_conflict'].includes(key)) continue
    const value = key.startsWith('metadata->>') ? state.row?.metadata[key.slice(11)] : state.row?.[key]
    if (condition === 'is.null' && value !== null && value !== undefined) return false
    if (condition.startsWith('eq.') && String(value) !== condition.slice(3)) return false
  }
  return Boolean(state.row)
}
async function database(query, init = {}) {
  state.operations.push({ query, init })
  if (query.startsWith('luxor_phone_numbers?')) { if (state.beforeOwnership) { state.beforeOwnership = false; throw new Error('Synthetic ownership lookup failure') }; return [{ phone_number: number, twilio_number_sid: numberSid, is_public: true }] }
  if (query.startsWith('rpc/')) {
    if (state.captureError) throw state.captureError
    state.captures.push(JSON.parse(init.body)); return { saved: true, linked: true }
  }
  assert.ok(query.startsWith('luxor_calls?'))
  if (!init.method) return matches(query) ? [structuredClone(state.row)] : []
  if (init.method === 'POST') { if (!state.row) state.row = { id: 'call', ...JSON.parse(init.body) }; return null }
  if (state.beforePatch) { const callback = state.beforePatch; state.beforePatch = null; callback() }
  if (!matches(query)) return []
  state.row = { ...state.row, ...JSON.parse(init.body) }; return [structuredClone(state.row)]
}
const twiml = require('twilio').twiml
class SupabaseRestError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code }
}
const numbers = () => ({ fetch: async () => ({ phoneNumber: number, accountSid, trunkSid: '', voiceApplicationSid: '' }) })
numbers.list = async ({ phoneNumber }) => state.owned.includes(phoneNumber) ? [{ phoneNumber }] : []
const client = { incomingPhoneNumbers: numbers, calls: () => ({ fetch: async () => ({ accountSid, to: number, direction: 'inbound', status: 'in-progress' }), update: async (input) => { state.transfers.push(input); return {} } }) }
const carrier = () => client
const integrations = {
  'server-only': {}, twilio: carrier, ws: class extends EventEmitter {
    static OPEN = 1
    constructor() { super(); this.readyState = 1; setImmediate(() => this.emit('open')) }
    send() { if (state.socketSendError) throw new Error('Synthetic WebSocket send failure'); state.greetingSends += 1; setImmediate(() => { for (const event of state.socketEvents || []) this.emit('message', Buffer.from(JSON.stringify(event))); this.emit('close') }) }
    close() { this.readyState = 3 }
    terminate() { this.readyState = 3 }
  },
  './supabaseRestServer': { SupabaseRestError, supabaseRestStrict: database },
  './luxorAiContextServer': { getLuxorAiVenueContext: async () => 'Verified venue reference.' },
  './luxorPhoneRoutingServer': { getLuxorPhoneRoutingSettings: async () => ({ ring_to_number: state.target }) },
  './luxorElenaInboundSettingsServer': { getElenaInboundSettings: async () => ({ voice: 'brise', ariannaAvailable: state.available }) },
  './luxorElenaInboundNotificationServer': { notifyElenaInboundAnswered: async (input) => { state.notices.push(input); if (state.notificationGate) await state.notificationGate } },
  './luxorElenaInboundRecordingServer': { prepareElenaRecording: async () => ({ nonce: '77777777-7777-4777-8777-777777777777', expiresAt: new Date(Date.now() + 120_000).toISOString(), question: 'May I record and transcribe?' }), confirmElenaRecording: async (_call, _session, _nonce, consented) => { state.recordings.push(consented); return { consented } }, startAutomaticElenaRecording: async (call, session) => { state.automaticStarts.push({ call, session }); if (state.recordingGate) await state.recordingGate; return { automatic: true, recordingStarted: true } }, stopElenaRecording: async () => ({ stopped: true }) },
  './luxorElenaInboundLeadServer': { ElenaLeadUpdateError: class extends Error {}, prepareElenaLeadUpdate: async () => ({ nonce: '66666666-6666-4666-8666-666666666666', expiresAt: new Date(Date.now() + 120_000).toISOString(), question: 'May I save this?' }), confirmElenaLeadUpdate: async () => { state.leadUpdates.push(true); return { saved: true } } },
  './luxorElenaCallEmailServer': { prepareElenaCallEmail: async () => ({ nonce: '55555555-5555-4555-8555-555555555555', expires_at: new Date(Date.now() + 120_000).toISOString(), question: 'May I send this email?' }), confirmElenaCallEmail: async () => { state.emails.push(true); return { queued: true } }, getElenaCallEmailStatus: async () => ({ status: 'pending' }) },
  './luxorElenaInboundToursServer': { ElenaInboundTourBookingError: class extends Error {},
    prepareElenaLiveTourBooking: async () => ({ nonce: '88888888-8888-4888-8888-888888888888', expiresAt: new Date(Date.now() + 180_000).toISOString(), question: 'Book this published venue tour?', slot: { date: '2099-01-01', time: '4 PM' } }),
    confirmElenaLiveTourBooking: async () => { state.bookings.push(true); return { booked: true, message: 'The venue tour is booked. No email or text was sent.' } } },
  './luxorTourSlotsServer': { listAvailableLuxorTourSlots: async () => [] },
  './luxorCallsServer': { normalizePhoneNumber: (value) => { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 10 ? '+1' + digits : digits.length === 11 && digits[0] === '1' ? '+' + digits : null } },
  './luxorElenaPhoneIngressProof': compile('src/lib/luxorElenaPhoneIngressProof.ts', {}),
  './luxorTwilioServer': { createTwilioVoiceResponse: () => new twiml.VoiceResponse(), forbiddenTwimlResponse: () => new Response('', { status: 403 }),
    getLuxorTwilioConfig: () => ({ accountSid }), readTwilioForm: async (request) => Object.fromEntries(new URLSearchParams(await request.text())),
    twimlResponse: (response) => new Response(response.toString()), validateTwilioWebhook: () => state.signed },
}
const service = compile('src/lib/luxorElenaInboundServer.ts', integrations)
test.beforeEach(() => {
  Object.assign(process.env, { LUXOR_ELENA_LIVE_INBOUND_ENABLED: 'true', LUXOR_ELENA_LIVE_NUMBER: number, LUXOR_ELENA_LIVE_NUMBER_SID: numberSid,
    OPENAI_PROJECT_ID: 'proj_synthetic', OPENAI_VOICE_WEBHOOK_SECRET: secret, OPENAI_API_KEY: 'synthetic-do-not-call', LUXOR_TWILIO_ACCOUNT_SID: accountSid, LUXOR_TWILIO_AUTH_TOKEN: 'synthetic' })
  state = { available: true, target, owned: [], operations: [], captures: [], transfers: [], bookings: [], recordings: [], automaticStarts: [], leadUpdates: [], emails: [], notices: [], greetingSends: 0, signed: true,
    row: { id: 'call', twilio_call_sid: callSid, direction: 'inbound', to_number: number, status: 'in-progress', updated_at: '2026-11-11T12:00:00.000Z', metadata: { scope: 'elena_live_inbound', ingress_mode: 'programmable_sip', accepted: true, rehearsal_only: false, openai_session_id: 'live_synthetic', transfer_state: 'none' } } }
  global.fetch = async (url) => { assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/live\/sessions\/live_synthetic\/accept$/); if (state.onAccept) state.onAccept(); return Response.json({}) }
})

const tick = () => new Promise((resolve) => setImmediate(resolve))
test('slow notification and recording cannot delay greeting, but remain awaited', async () => {
  let releaseNotice, releaseRecording
  state.notificationGate = new Promise((resolve) => { releaseNotice = resolve })
  state.recordingGate = new Promise((resolve) => { releaseRecording = resolve })
  let finished = false
  const work = service.greetElenaLiveCall('live_synthetic', callSid).then(() => { finished = true })
  await tick(); await tick()
  assert.equal(state.greetingSends, 1)
  assert.equal(state.notices.length, 1)
  assert.equal(finished, false)
  releaseNotice(); await tick()
  assert.equal(finished, false)
  releaseRecording(); await work
  assert.equal(finished, true)
  assert.equal(state.row.metadata.greeting_first_audio_latency_ms, null)
})
test('first audio diagnostics distinguish transcript from audio and never claim playback', async () => {
  state.socketEvents = [{ type: 'session.output_transcript.delta', delta: 'Synthetic transcript' }]
  await service.greetElenaLiveCall('live_synthetic', callSid)
  assert.equal(state.row.metadata.greeting_output_observed, true)
  assert.equal(state.row.metadata.greeting_first_audio_observed_at, null)
  delete state.row.metadata.greeting_requested
  state.socketEvents = [{ type: 'session.output_audio.delta', delta: 'synthetic-bytes' }]
  await service.greetElenaLiveCall('live_synthetic', callSid)
  assert.ok(state.row.metadata.greeting_first_audio_observed_at)
  assert.ok(state.row.metadata.greeting_first_audio_latency_ms >= 0)
  assert.equal(state.row.metadata.greeting_playback_verified, false)
  assert.doesNotMatch(JSON.stringify(state.row.metadata), /synthetic-bytes|Synthetic transcript/)
})
test('webhook acceptance does not await optional notifications and owns greeting with after', async () => {
  const proof = integrations['./luxorElenaPhoneIngressProof']
  const ingress = proof.deriveElenaIngressToken(callSid, secret)
  state.row.metadata.accepted = false; state.row.metadata.openai_session_id = null
  state.row.metadata.ingress_token_hash = proof.hashElenaIngressToken(ingress, secret)
  state.row.metadata.ingress_expires_at = new Date(Date.now() + 120_000).toISOString()
  const callbacks = []
  const route = compile('src/app/api/webhooks/openai-voice/route.ts', {
    'next/server': { after: (callback) => callbacks.push(callback) },
    '@/lib/luxorElenaInboundServer': service,
    '@/lib/luxorElenaPhoneTestServer': { elenaPhoneTestReady: () => false, verifyOpenAiVoiceSignature: () => true, ElenaPhoneTestDiagnosticError: class extends Error {} },
  })
  const event = { id: 'event_synthetic', type: 'live.transport.incoming', created_at: Math.floor(Date.now() / 1000), data: { type: 'sip', session_id: 'live_synthetic', sip_headers: [{ name: 'X-Luxor-Live-Ingress', value: ingress }] } }
  const result = await route.POST(new Request('https://luxor.invalid/api/webhooks/openai-voice', { method: 'POST', body: JSON.stringify(event) }))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).accepted, true)
  assert.equal(state.notices.length, 0)
  assert.equal(callbacks.length, 1)
  await callbacks[0]()
  assert.equal(state.greetingSends, 1)
  assert.equal(state.notices.length, 1)
})
