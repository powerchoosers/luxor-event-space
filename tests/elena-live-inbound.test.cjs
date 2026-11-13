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
const callSid = `CA${'1'.repeat(32)}`, otherSid = `CA${'2'.repeat(32)}`, childSid = `CA${'3'.repeat(32)}`
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
    send() { if (state.socketSendError) throw new Error('Synthetic WebSocket send failure'); state.greetingSends += 1; setImmediate(() => this.emit('close')) }
    close() { this.readyState = 3 }
    terminate() { this.readyState = 3 }
  },
  './supabaseRestServer': { SupabaseRestError, supabaseRestStrict: database },
  './luxorAiContextServer': { getLuxorAiVenueContext: async () => 'Verified venue reference.' },
  './luxorPhoneRoutingServer': { getLuxorPhoneRoutingSettings: async () => ({ ring_to_number: state.target }) },
  './luxorElenaInboundSettingsServer': { getElenaInboundSettings: async () => ({ voice: 'brise', ariannaAvailable: state.available }) },
  './luxorElenaInboundNotificationServer': { notifyElenaInboundAnswered: async (input) => { state.notices.push(input) } },
  './luxorElenaInboundRecordingServer': { prepareElenaRecording: async () => ({ nonce: '77777777-7777-4777-8777-777777777777', expiresAt: new Date(Date.now() + 120_000).toISOString(), question: 'May I record and transcribe?' }), confirmElenaRecording: async (_call, _session, _nonce, consented) => { state.recordings.push(consented); return { consented } }, startAutomaticElenaRecording: async (call, session) => { state.automaticStarts.push({ call, session }); return { automatic: true, recordingStarted: true } }, stopElenaRecording: async () => ({ stopped: true }) },
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
const status = compile('src/app/api/elena-inbound/status/route.ts', {
  '@/lib/supabaseRestServer': integrations['./supabaseRestServer'],
  '@/lib/luxorElenaInboundNotificationServer': integrations['./luxorElenaInboundNotificationServer'],
  '@/lib/luxorElenaInboundRecordingServer': integrations['./luxorElenaInboundRecordingServer'],
  '@/lib/luxorTwilioServer': { ...integrations['./luxorTwilioServer'], normalizeTwilioCallStatus: (value) => value === 'answered' ? 'in-progress' : value, parseTwilioInteger: (value) => /^\d+$/.test(value || '') ? Number(value) : null },
})
test.beforeEach(() => {
  Object.assign(process.env, { LUXOR_ELENA_LIVE_INBOUND_ENABLED: 'true', LUXOR_ELENA_LIVE_NUMBER: number, LUXOR_ELENA_LIVE_NUMBER_SID: numberSid,
    OPENAI_PROJECT_ID: 'proj_synthetic', OPENAI_VOICE_WEBHOOK_SECRET: secret, OPENAI_API_KEY: 'synthetic-do-not-call', LUXOR_TWILIO_ACCOUNT_SID: accountSid, LUXOR_TWILIO_AUTH_TOKEN: 'synthetic' })
  state = { available: true, target, owned: [], operations: [], captures: [], transfers: [], bookings: [], recordings: [], automaticStarts: [], leadUpdates: [], emails: [], notices: [], greetingSends: 0, signed: true,
    row: { id: 'call', twilio_call_sid: callSid, direction: 'inbound', to_number: number, status: 'in-progress', updated_at: '2026-11-11T12:00:00.000Z', metadata: { scope: 'elena_live_inbound', ingress_mode: 'programmable_sip', accepted: true, rehearsal_only: false, openai_session_id: 'live_synthetic', transfer_state: 'none' } } }
  global.fetch = async (url) => { assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/live\/sessions\/live_synthetic\/accept$/); if (state.onAccept) state.onAccept(); return Response.json({}) }
})
const claim = () => ({ kind: 'call', callSid, sessionId: 'live_synthetic', exp: Math.floor(Date.now() / 1000) + 600 })
async function tool(name, args = {}) {
  const request = new Request('https://luxor.invalid/api/elena-inbound/mcp', { method: 'POST', headers: { authorization: `Bearer ${service.signElenaLiveClaim(claim(), secret)}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
  const response = await service.handleElenaLiveMcp(request)
  const result = (await response.json()).result
  return { error: result.isError === true, output: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) }
}
const contact = { full_name: 'Synthetic Caller', phone: '(555) 123-4567', purpose: 'transfer' }
test('opening greeting retries a concurrent call metadata update', async () => {
  state.beforePatch = () => { state.row.updated_at = '2026-11-11T12:00:01.000Z' }
  await service.greetElenaLiveCall('live_synthetic', callSid)
  assert.equal(state.row.metadata.greeting_requested, true)
  assert.equal(state.greetingSends, 1)
  await service.greetElenaLiveCall('live_synthetic', callSid)
  assert.equal(state.greetingSends, 1)
})
test('opening greeting send failure completes without claiming verified playback', async () => {
  state.socketSendError = true
  await service.greetElenaLiveCall('live_synthetic', callSid)
  assert.equal(state.row.metadata.greeting_requested, true)
  assert.equal(state.row.metadata.greeting_playback_verified, false)
  assert.equal(state.greetingSends, 0)
})
test('new live sessions do not offer recording permission tools', () => {
  const names = service.ELENA_LIVE_TOOLS.map((entry) => entry.name)
  assert.equal(names.includes('prepare_recording'), false)
  assert.equal(names.includes('confirm_recording'), false)
  assert.equal(names.includes('recording_status'), true)
  assert.equal(names.includes('stop_recording'), true)
})
test('recording, lead changes and emails require their own explicit caller decisions', async () => {
  const recording = (await tool('prepare_recording')).output.token
  const update = (await tool('prepare_lead_update', { notes: 'Interested in a tour' })).output.token
  const email = (await tool('prepare_call_email', { subject: 'Tour', body: 'Tour information' })).output.token
  assert.equal((await tool('confirm_call_email', { token: update, spoken_confirmation: 'yes' })).error, true)
  assert.equal((await tool('confirm_lead_update', { token: update, spoken_confirmation: 'no' })).error, true)
  assert.equal((await tool('confirm_recording', { token: recording, spoken_confirmation: 'no' })).output.consented, false)
  assert.equal((await tool('stop_recording', { spoken_request: 'please stop recording' })).output.stopped, true)
  assert.equal((await tool('confirm_lead_update', { token: update, spoken_confirmation: 'yes' })).output.saved, true)
  assert.equal((await tool('confirm_call_email', { token: email, spoken_confirmation: 'yes' })).output.queued, true)
  assert.deepEqual(state.recordings, [false]); assert.equal(state.leadUpdates.length, 1); assert.equal(state.emails.length, 1)
})
test('disabled live config and the rehearsal number fail closed', () => {
  process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'false'; assert.equal(service.elenaLiveInboundReady(), false)
  process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'true'; process.env.LUXOR_ELENA_LIVE_NUMBER = '+18176630380'; assert.equal(service.elenaLiveInboundReady(), false)
})
test('call claims reject tampering, expiry and wrong domain', () => {
  const token = service.signElenaLiveClaim(claim(), secret)
  assert.equal(service.verifyElenaLiveClaim(token, secret).callSid, callSid)
  assert.equal(service.verifyElenaLiveClaim(token + 'x', secret), null)
  assert.equal(service.verifyElenaLiveClaim(token, secret, Date.now() + 700_000), null)
})
test('rehearsal scope and another live session cannot call capture or transfer', async () => {
  state.row.metadata.scope = 'elena_phone_test'; assert.equal((await tool('prepare_contact_capture', contact)).error, true)
  state.row.metadata.scope = 'elena_live_inbound'; state.row.metadata.openai_session_id = 'live_other'; assert.equal((await tool('prepare_transfer')).error, true)
  assert.equal(state.captures.length, 0); assert.equal(state.transfers.length, 0)
})
test('contact preparation issues capture kind without PII and waits for a later affirmative', async () => {
  const prepared = await tool('prepare_contact_capture', contact)
  assert.equal(prepared.error, false)
  const decoded = service.verifyElenaLiveClaim(prepared.output.token, secret)
  assert.equal(decoded.kind, 'capture'); assert.equal(decoded.phone, undefined)
  assert.equal(state.captures.length, 0)
  assert.equal((await tool('confirm_contact_capture', { token: prepared.output.token, spoken_confirmation: 'no, wait' })).error, true)
  assert.equal(state.captures.length, 0)
  const confirmed = await tool('confirm_contact_capture', { token: prepared.output.token, spoken_confirmation: 'yes, correct' })
  assert.equal(confirmed.output.saved, true); assert.equal(state.captures.length, 1)
  assert.equal(state.captures[0].p_nonce, decoded.nonce)
})
test('protected test contact gives a safe next step without exposing internals', async () => {
  const prepared = await tool('prepare_contact_capture', { ...contact, purpose: 'tour', email: 'synthetic@example.invalid' })
  state.captureError = new SupabaseRestError('Test identifiers cannot be captured as customers', 400, '22023')
  const refused = await tool('confirm_contact_capture', { token: prepared.output.token, spoken_confirmation: 'yes' })
  assert.equal(refused.error, true)
  assert.match(refused.output, /different callback number or, when applicable, email address/i)
  assert.match(refused.output, /Do not retry unchanged details/i)
  assert.match(refused.output, /No tour was booked/i)
  assert.doesNotMatch(refused.output, /test identifiers|synthetic@example|555/i)
  assert.equal(state.captures.length, 0)
  state.captureError = new SupabaseRestError('Unrelated database error', 400, '22023')
  const other = await tool('confirm_contact_capture', { token: prepared.output.token, spoken_confirmation: 'yes' })
  assert.equal(other.error, true)
  assert.match(other.output, /could not be verified/i)
  assert.doesNotMatch(other.output, /Unrelated database error/i)
})
test('protected contact guidance remains appropriate for a transfer', async () => {
  const prepared = await tool('prepare_contact_capture', contact)
  state.captureError = new SupabaseRestError('Test identifiers cannot be captured as customers', 400, '22023')
  const refused = await tool('confirm_contact_capture', { token: prepared.output.token, spoken_confirmation: 'yes' })
  assert.equal(refused.error, true)
  assert.match(refused.output, /different callback number/i)
  assert.doesNotMatch(refused.output, /tour was booked|cannot be saved for a booking/i)
  assert.equal(state.transfers.length, 0)
})
test('callback details require best time plus email or explicit refusal', () => {
  assert.throws(() => service.parseElenaLiveContact({ ...contact, purpose: 'callback' }))
  assert.throws(() => service.parseElenaLiveContact({ ...contact, purpose: 'callback', best_callback_time: 'Tomorrow afternoon' }))
  assert.equal(service.parseElenaLiveContact({ ...contact, purpose: 'callback', best_callback_time: 'Tomorrow afternoon', email_declined: true }).email, null)
})
test('transfer requires saved confirmed contact and checks human availability twice', async () => {
  assert.equal((await tool('prepare_transfer')).error, true)
  state.row.metadata.inbound_capture = { confirmed: true, full_name: contact.full_name, phone: '+15551234567' }
  state.available = false; assert.equal((await tool('prepare_transfer')).error, true)
  state.available = true; const prepared = await tool('prepare_transfer'); assert.equal(prepared.error, false)
  const decoded = JSON.parse(Buffer.from(prepared.output.token.split('.')[0], 'base64url'))
  assert.equal(decoded.target, undefined); assert.equal(typeof decoded.targetHash, 'string')
  state.available = false; assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).error, true)
  assert.equal(state.transfers.length, 0)
  state.available = true; assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).error, false)
  assert.equal(state.transfers.length, 1)
  assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).error, true)
  assert.equal(state.transfers.length, 1)
})
test('saved transfer loops and stale races cannot trigger a paid attempt', async () => {
  state.row.metadata.inbound_capture = { confirmed: true, full_name: contact.full_name, phone: '+15551234567' }
  state.target = number; assert.equal((await tool('prepare_transfer')).error, true)
  state.target = target; state.owned = [target]; assert.equal((await tool('prepare_transfer')).error, true)
  state.owned = []; const prepared = await tool('prepare_transfer')
  state.beforePatch = () => { state.row.updated_at = new Date().toISOString(); state.row.metadata.transfer_state = 'attempted' }
  assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).error, true)
  assert.equal(state.transfers.length, 0)
})
function callback(body, query = '') { return new Request(`https://luxor.invalid/api/elena-inbound/status${query}`, { method: 'POST', body: new URLSearchParams({ AccountSid: accountSid, CallSid: childSid, ParentCallSid: callSid, CallStatus: 'in-progress', ...body }) }) }
test('signed SIP progress binds distinct child and proves answered before owner notice', async () => {
  state.row.status = 'ringing'
  const response = await status.POST(callback({}, `?parentCallSid=${callSid}&leg=elena`))
  assert.equal(response.status, 200); assert.equal(state.row.metadata.sip_answered, true)
  assert.deepEqual(state.automaticStarts, [{ call: callSid, session: 'live_synthetic' }])
  assert.equal(state.row.metadata.sip_child_call_sid, childSid); assert.equal(state.notices.length, 1)
  assert.equal(state.row.status, 'in-progress')
})
test('invalid SIP parent, transfer before preparation and unsigned status are rejected', async () => {
  assert.equal((await status.POST(callback({ ParentCallSid: otherSid }, `?parentCallSid=${callSid}&leg=elena`))).status, 403)
  assert.equal((await status.POST(callback({}, `?parentCallSid=${callSid}&leg=transfer`))).status, 403)
  state.signed = false; assert.equal((await status.POST(callback({}, `?parentCallSid=${callSid}&leg=elena`))).status, 403)
  assert.equal(state.notices.length, 0)
})
test('terminal child callbacks never terminate the parent and preserve answered proof', async () => {
  await status.POST(callback({}, `?parentCallSid=${callSid}&leg=elena`))
  await status.POST(callback({ CallStatus: 'completed', SequenceNumber: '3' }, `?parentCallSid=${callSid}&leg=elena`))
  await status.POST(callback({ CallStatus: 'ringing', SequenceNumber: '1' }, `?parentCallSid=${callSid}&leg=elena`))
  assert.equal(state.row.status, 'in-progress'); assert.equal(state.row.metadata.sip_status, 'completed'); assert.equal(state.row.metadata.sip_answered, true)
})
test('a late answered SIP callback does not reopen a completed parent', async () => {
  state.row.status = 'completed'
  await status.POST(callback({}, `?parentCallSid=${callSid}&leg=elena`))
  assert.equal(state.row.status, 'completed')
  assert.equal(state.row.metadata.sip_answered, true)
})
test('an older answered SIP callback does not mark a ringing parent active after the SIP leg ended', async () => {
  state.row.status = 'ringing'
  await status.POST(callback({ CallStatus: 'completed', SequenceNumber: '3' }, `?parentCallSid=${callSid}&leg=elena`))
  await status.POST(callback({ CallStatus: 'in-progress', SequenceNumber: '1' }, `?parentCallSid=${callSid}&leg=elena`))
  assert.equal(state.row.status, 'ringing')
  assert.equal(state.row.metadata.sip_status, 'completed')
})
test('public terminal callbacks record call end while disabled and ignore pre-cutover calls', async () => {
  process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'false'
  assert.equal((await status.POST(callback({ CallSid: callSid, To: number, CallStatus: 'completed', CallDuration: '21' }))).status, 200)
  assert.equal(state.row.status, 'completed'); assert.equal(state.row.duration_seconds, 21)
  state.row.metadata.scope = 'legacy'; assert.equal((await status.POST(callback({ CallSid: callSid, To: number, CallStatus: 'completed' }))).status, 200)
})
test('missed terminal callback becomes unread once and late signed answered proof clears missed outcome', async () => {
  state.row.is_read = true
  const terminal = () => status.POST(callback({ CallSid: callSid, To: number, CallStatus: 'completed' }))
  await terminal(); assert.equal(state.row.outcome, 'missed'); assert.equal(state.row.is_read, false)
  state.row.is_read = true; await terminal(); assert.equal(state.row.is_read, true)
  await status.POST(callback({}, `?parentCallSid=${callSid}&leg=elena`))
  assert.equal(state.row.outcome, null); assert.equal(state.row.metadata.sip_answered, true)
  state.row.is_read = true; await terminal(); assert.equal(state.row.is_read, true)
})
function completion(leg, sid = childSid, result = 'completed') {
  return new Request(`https://luxor.invalid/api/elena-inbound/complete?parentCallSid=${callSid}&leg=${leg}`, { method: 'POST', body: new URLSearchParams({ AccountSid: accountSid, CallSid: callSid, To: number, DialCallSid: sid, DialCallStatus: result }) })
}
test('late SIP completion never replaces the separately bound human call leg', async () => {
  state.row.metadata.transfer_state = 'attempted'
  state.row.metadata.transfer_call_sid = otherSid
  state.row.metadata.sip_child_call_sid = childSid
  assert.equal((await service.handleElenaLiveComplete(completion('elena'))).status, 200)
  assert.equal(state.row.metadata.transfer_call_sid, otherSid)
  assert.equal(state.row.metadata.sip_child_call_sid, childSid)
  assert.equal((await service.handleElenaLiveComplete(completion('transfer', childSid))).status, 403)
})
test('unanswered transfer retains confirmed callback and gives truthful follow-up fallback', async () => {
  state.row.metadata.transfer_state = 'attempted'
  state.row.metadata.inbound_capture = { confirmed: true, full_name: contact.full_name, phone: '+15551234567' }
  state.row.notes = 'Owner note that must survive.'
  const response = await service.handleElenaLiveComplete(completion('transfer', otherSid, 'no-answer'))
  assert.equal(response.status, 200); assert.equal(state.row.metadata.callback_needed, true)
  assert.equal(state.row.metadata.inbound_capture.confirmed, true)
  assert.match(state.row.notes, /^Owner note that must survive\./); assert.match(state.row.notes, /Arianna could not be reached/)
  assert.match(await response.text(), /name and callback number are saved/)
})
test('real tour confirmation uses a booking-specific token and later explicit affirmative', async () => {
  const prepared = await tool('prepare_tour_booking', { slot_id: '88888888-8888-4888-8888-888888888888', send_invite: true })
  assert.equal(prepared.error, false)
  assert.equal(service.verifyElenaLiveClaim(prepared.output.token, secret).kind, 'booking')
  assert.equal((await tool('confirm_tour_booking', { token: prepared.output.token, spoken_confirmation: 'no' })).error, true)
  assert.equal(state.bookings.length, 0)
  assert.equal((await tool('confirm_tour_booking', { token: prepared.output.token, spoken_confirmation: 'yes, book it' })).output.booked, true)
  assert.equal(state.bookings.length, 1)
})
test('signed ingress inserts a read call and binds proof-specific SIP callbacks', async () => {
  state.row = null
  const request = new Request('https://luxor.invalid/api/elena-inbound/incoming', { method: 'POST', body: new URLSearchParams({ AccountSid: accountSid, CallSid: callSid, To: number, From: '+15551234567', Direction: 'inbound' }) })
  const response = await service.handleElenaLiveIncoming(request)
  assert.equal(response.status, 200); const xml = await response.text()
  assert.match(xml, /X-Luxor-Live-Ingress=/); assert.match(xml, /leg=elena/); assert.match(xml, /statusCallbackEvent="initiated ringing answered completed"/)
  assert.equal(state.row.is_read, true); assert.equal(state.row.metadata.rehearsal_only, false)
  assert.equal(state.notices.length, 0)
})
test('successful provider acceptance persists on a short ended parent and notices proven answer', async () => {
  const proof = integrations['./luxorElenaPhoneIngressProof']
  const ingress = proof.deriveElenaIngressToken(callSid, secret)
  state.row.metadata.accepted = false; state.row.metadata.openai_session_id = null
  state.row.metadata.ingress_token_hash = proof.hashElenaIngressToken(ingress, secret)
  state.row.metadata.ingress_expires_at = new Date(Date.now() + 120_000).toISOString()
  state.row.metadata.sip_answered = true
  state.onAccept = () => { state.row.status = 'completed'; state.row.updated_at = new Date().toISOString() }
  const result = await service.acceptElenaLiveEvent({ id: 'event_synthetic', type: 'live.transport.incoming', created_at: Math.floor(Date.now() / 1000), data: { type: 'sip', session_id: 'live_synthetic', sip_headers: [{ name: 'X-Luxor-Live-Ingress', value: ingress }] } })
  assert.equal(result.accepted, true); assert.equal(state.row.metadata.accepted, true); assert.equal(state.row.status, 'completed')
  assert.equal(state.notices.length, 0)
  await assert.rejects(service.greetElenaLiveCall('live_synthetic', callSid), /not authorized/)
  assert.equal(state.notices.length, 1)
  assert.equal((await tool('prepare_transfer')).error, true)
})
test('provider configuration failure keeps signed caller history for terminal missed status', async () => {
  state.row = null
  state.signed = true
  // A database failure during the owned-number check occurs after durable ingress.
  state.beforeOwnership = true
  const request = new Request('https://luxor.invalid/api/elena-inbound/incoming', { method: 'POST', body: new URLSearchParams({ AccountSid: accountSid, CallSid: callSid, To: number, From: '+15551234567', Direction: 'inbound' }) })
  const response = await service.handleElenaLiveIncoming(request)
  assert.ok(state.row); const xml = await response.text(); assert.match(xml, /temporarily unavailable/); assert.doesNotMatch(xml, /<Sip/)
  await status.POST(callback({ CallSid: callSid, To: number, CallStatus: 'completed' }))
  assert.equal(state.row.outcome, 'missed'); assert.equal(state.row.is_read, false)
})
test('signed terminal callback recovers a missing ingress row after database outage', async () => {
  state.row = null
  const response = await status.POST(callback({ CallSid: callSid, To: number, From: '+15551234567', Direction: 'inbound', CallStatus: 'completed', CallDuration: '5' }))
  assert.equal(response.status, 200); assert.equal(state.row.outcome, 'missed'); assert.equal(state.row.is_read, false)
  assert.equal(state.row.metadata.ingress_recovery, true); assert.equal(state.row.metadata.accepted, false)
  assert.equal(state.notices.length, 0)
})
