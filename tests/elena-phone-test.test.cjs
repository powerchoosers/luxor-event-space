/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { createHmac } = require('node:crypto')
const { EventEmitter } = require('node:events')

const root = path.resolve(__dirname, '..')
const callSid = `CA${'1'.repeat(32)}`, otherCallSid = `CA${'2'.repeat(32)}`
const trunkSid = `TK${'3'.repeat(32)}`, accountSid = `AC${'4'.repeat(32)}`
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const testNumber = '+18176630380', publicNumber = '+19563652037', transferTarget = '+15550009999'
let state

function matches(row, query) {
  if (!row) return false
  const params = new URLSearchParams(query.split('?')[1])
  for (const [key, condition] of params) {
    if (['select', 'limit', 'order', 'on_conflict'].includes(key)) continue
    const value = key.startsWith('metadata->>') ? row.metadata[key.slice('metadata->>'.length)] : row[key]
    if (condition === 'is.null' && value !== null && value !== undefined) return false
    if (condition.startsWith('eq.') && String(value) !== condition.slice(3)) return false
    if (condition.startsWith('in.(') && !condition.slice(4, -1).split(',').includes(String(value))) return false
    if (condition.startsWith('not.in.(') && condition.slice(8, -1).split(',').includes(String(value))) return false
  }
  return true
}

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
const client = { incomingPhoneNumbers, calls: (sid) => ({
  fetch: async () => { state.carrierFetches.push(sid); return { ...state.carrierCall } },
  update: async (input) => { state.carrierUpdates.push({ sid, input }); return { sid, ...input } },
}) }
const syntheticTwilio = () => client
syntheticTwilio.twiml = require('twilio').twiml
const ingressProof = compile('src/lib/luxorElenaPhoneIngressProof.ts', {})
class SyntheticSocket extends EventEmitter {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  constructor() {
    super()
    if (!state.socketScenario) throw new Error('Unexpected socket: stale updates must not connect')
    this.readyState = SyntheticSocket.CONNECTING
    state.sockets.push(this)
    queueMicrotask(() => {
      if (state.socketScenario === 'handshake_error') {
        const error = new Error('SHOULD_NOT_BE_LOGGED_PRIVATE_ERROR_DETAIL')
        error.code = 'ECONNRESET'
        this.emit('error', error)
        return
      }
      if (state.socketScenario === 'handshake_rejected') {
        this.emit('unexpected-response', {}, { statusCode: 401, resume: () => { state.handshakeBodyResumed = true } })
        return
      }
      this.readyState = SyntheticSocket.OPEN
      this.emit('open')
      state.socketSendsAtOpen = state.socketSends.length
      this.emit('message', Buffer.from(JSON.stringify({ type: 'session.started', session: { id: 'live_synthetic' } })))
    })
  }
  send(raw) {
    const event = JSON.parse(raw)
    state.socketSends.push(event)
    queueMicrotask(() => {
      if (state.socketScenario === 'command_error') {
        this.emit('message', Buffer.from(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_value', param: 'content', client_event_id: event.event_id, message: 'SHOULD_NOT_BE_LOGGED_PRIVATE_COMMAND_DETAIL' } })))
      } else {
        this.emit('message', Buffer.from(JSON.stringify({ type: 'session.commentary.appended', client_event_id: event.event_id, start_ms: 1, end_ms: 2 })))
        this.emit('message', Buffer.from(JSON.stringify({ type: 'session.input_audio.append', audio: 'SYNTHETIC_CALLER_AUDIO_DO_NOT_STORE' })))
        if (state.socketScenario !== 'no_output') {
          this.emit('message', Buffer.from(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'SHOULD_NOT_BE_LOGGED_PRIVATE_TRANSCRIPT' })))
          this.emit('message', Buffer.from(JSON.stringify({ type: 'session.output_audio.delta', delta: 'SYNTHETIC_AUDIO_DO_NOT_STORE' })))
        }
      }
      this.emit('close', 1000, Buffer.alloc(0))
    })
  }
  close() { this.readyState = SyntheticSocket.CLOSED }
  terminate() { this.readyState = SyntheticSocket.CLOSED }
}
const service = compile('src/lib/luxorElenaPhoneTestServer.ts', {
  'server-only': {}, twilio: syntheticTwilio,
  ws: SyntheticSocket,
  './supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
    state.database.push({ query, init })
    if (query.startsWith('luxor_phone_numbers?')) return state.selected
    if (!query.startsWith('luxor_calls?')) throw new Error('Unexpected database operation')
    if (!init.method) return matches(state.row, query) ? [structuredClone(state.row)] : []
    if (init.method === 'PATCH') {
      if (state.beforeNextPatch) { const callback = state.beforeNextPatch; state.beforeNextPatch = null; callback() }
      if (!matches(state.row, query)) return []
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
  './luxorElenaVoiceSandboxServer': { buildElenaVoiceInstructions: async () => state.instructions || 'Synthetic venue instructions.' },
  './luxorElenaVoiceTestSettingsServer': { getElenaPhoneTestVoice: async () => 'marin' },
  './luxorElenaPhoneIngressProof': ingressProof,
  './luxorTwilioServer': { createTwilioVoiceResponse: () => new syntheticTwilio.twiml.VoiceResponse() },
})

function reset() {
  state = {
    row: { id: 'synthetic-call', twilio_call_sid: callSid, status: 'in-progress', to_number: testNumber, from_number: '+15550001111', updated_at: new Date().toISOString(), metadata: { scope: 'elena_phone_test', ingress_mode: 'programmable_sip', openai_session_id: 'live_synthetic', accepted: true, transfer_state: 'none', rehearsal_only: true } },
    number: { phoneNumber: testNumber, accountSid, trunkSid: null, voiceApplicationSid: null, voiceUrl: 'https://www.luxoratlaspalmas.com/api/elena-phone-test/incoming', voiceMethod: 'POST', voiceFallbackUrl: 'https://www.luxoratlaspalmas.com/api/elena-phone-test/fallback' },
    carrierCall: { sid: callSid, accountSid, to: testNumber, from: '+15550001111', trunkSid, direction: 'inbound', status: 'in-progress', dateCreated: new Date() },
    selected: [{ phone_number: publicNumber, is_public: true }], target: transferTarget, ownedTargets: [], database: [], fetches: [], carrierUpdates: [], carrierFetches: [], sockets: [], socketSends: [],
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

function incomingEvent(token, sessionId = 'live_synthetic', extraHeaders = []) {
  return { id: 'evt_synthetic', type: 'live.transport.incoming', created_at: Math.floor(Date.now() / 1000), data: { type: 'sip', session_id: sessionId, sip_headers: [...(token ? [{ name: 'X-Luxor-Ingress', value: token }] : []), ...extraHeaders] } }
}

function unboundIngress() {
  reset()
  const token = ingressProof.deriveElenaIngressToken(callSid, secret)
  Object.assign(state.row.metadata, { openai_session_id: null, accepted: false, ingress_token_hash: ingressProof.hashElenaIngressToken(token, secret), ingress_expires_at: new Date(Date.now() + 120_000).toISOString() })
  return token
}

test('missing, forged, duplicated and expired ingress tickets fail before any OpenAI acceptance', async () => {
  const token = unboundIngress()
  await withConfiguration(async () => {
    for (const event of [incomingEvent(null), incomingEvent('x'.repeat(43)), incomingEvent(token, 'live_synthetic', [{ name: 'x-luxor-ingress', value: token }])]) {
      await assert.rejects(service.acceptElenaPhoneTestEvent(event), (error) => error.diagnostic === 'twilio_call_mismatch')
    }
    state.row.metadata.ingress_expires_at = new Date(Date.now() - 1).toISOString()
    await assert.rejects(service.acceptElenaPhoneTestEvent(incomingEvent(token)), (error) => error.diagnostic === 'twilio_call_mismatch')
    assert.equal(state.fetches.length, 0)
    assert.equal(state.database.filter(({ init }) => init.method).length, 0)
    assert.equal(state.carrierFetches.length, 0)
  })
})

test('a signed-ingress ticket binds one OpenAI session without depending on a live SIP Call resource', async () => {
  const token = unboundIngress()
  state.instructions = 'Synthetic verified venue context. ' + 'Long startup context. '.repeat(1000)
  await withConfiguration(async () => {
    const accepted = await service.acceptElenaPhoneTestEvent(incomingEvent(token))
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.callSid, callSid)
    assert.equal(state.row.metadata.openai_session_id, 'live_synthetic')
    assert.equal(state.row.metadata.accepted, true)
    assert.equal(state.fetches.length, 1)
    assert.match(state.fetches[0].url, /\/live\/sessions\/live_synthetic\/accept$/)
    const startup = JSON.parse(state.fetches[0].init.body).session
    assert.equal(startup.instructions, state.instructions)
    assert.doesNotMatch(startup.instructions, /remain silent|being verified|verification hold/i)
    assert.ok(startup.input.some((item) => item.role === 'developer' && item.content.some((part) => part.type === 'input_text' && /greeting.*Elena/i.test(part.text))))
    assert.equal(state.carrierFetches.length, 0)
    assert.equal((await service.acceptElenaPhoneTestEvent(incomingEvent(token))).duplicate, true)
    await assert.rejects(service.acceptElenaPhoneTestEvent(incomingEvent(token, 'live_attacker')), (error) => error.diagnostic === 'twilio_call_mismatch')
    assert.equal(state.fetches.length, 1)
    state.row.status = 'completed'
    await assert.rejects(service.acceptElenaPhoneTestEvent(incomingEvent(token)), (error) => error.diagnostic === 'twilio_call_mismatch')
    assert.equal(state.fetches.length, 1)
  })
})

test('concurrent ticket claiming cannot move authorization to another OpenAI session', async () => {
  const token = unboundIngress()
  await withConfiguration(async () => {
    state.beforeNextPatch = () => {
      state.row.metadata.openai_session_id = 'live_other_session'
      state.row.updated_at = new Date(Date.parse(state.row.updated_at) + 1).toISOString()
    }
    await assert.rejects(service.acceptElenaPhoneTestEvent(incomingEvent(token)), (error) => error.diagnostic === 'twilio_call_mismatch')
    assert.equal(state.row.metadata.openai_session_id, 'live_other_session')
    assert.equal(state.fetches.length, 0)
  })
})

test('phone tools reject another session and a parent completed by signed status', async () => {
  reset()
  await withConfiguration(async () => {
    let outcome = await tool('available_tour_times', {}, { sessionId: 'live_other' })
    assert.equal(outcome.result.isError, true)
    outcome = await tool('available_tour_times')
    assert.equal(outcome.result.isError, undefined)
    assert.equal(state.carrierFetches.length, 0)
    state.row.status = 'completed'
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
    assert.equal(state.fetches.length, 0)
    assert.equal(state.carrierUpdates.length, 1)
    assert.equal(state.carrierUpdates[0].sid, callSid)
    assert.match(state.carrierUpdates[0].input.twiml, new RegExp(`<Number[^>]*>\\${transferTarget}</Number>`))
    assert.match(state.carrierUpdates[0].input.twiml, /record="do-not-record"/)
    assert.doesNotMatch(state.carrierUpdates[0].input.twiml, /5558888888/)
    assert.equal((await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })).result.isError, true)
    assert.equal(state.carrierUpdates.length, 1)
    assert.ok(state.database.filter(({ init }) => init.method).every(({ query }) => query.startsWith('luxor_calls?')))
  })
})

test('transfer verifies the live PSTN parent rather than redirecting a wrong or completed leg', async () => {
  reset()
  await withConfiguration(async () => {
    const prepared = await tool('prepare_transfer')
    const original = { ...state.carrierCall }
    for (const invalid of [{ accountSid: `AC${'8'.repeat(32)}` }, { to: publicNumber }, { direction: 'outbound-dial' }, { status: 'completed' }]) {
      state.carrierCall = { ...original, ...invalid }
      const outcome = await tool('confirm_transfer', { token: prepared.output.token, spoken_confirmation: 'yes' })
      assert.equal(outcome.result.isError, true)
      assert.equal(state.row.metadata.transfer_state, 'prepared')
      assert.equal(state.carrierUpdates.length, 0)
    }
    assert.equal(state.fetches.length, 0)
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

async function captureWarnings(fn) {
  const warnings = [], original = console.warn
  console.warn = (...values) => warnings.push(values)
  try { await fn(warnings) } finally { console.warn = original }
}

test('phone greeting sends one short commentary on attach and observes ack, transcript and audio separately', async () => {
  reset(); state.socketScenario = 'success'; state.instructions = 'Long startup context. '.repeat(1000)
  await withConfiguration(async () => {
    await captureWarnings(async (warnings) => {
      await service.greetElenaPhoneTest('live_synthetic', callSid)
      assert.equal(state.socketSendsAtOpen, 1, 'Sideband must not wait for replay of session.started')
      assert.equal(state.socketSends.length, 1)
      const greeting = state.socketSends[0]
      assert.equal(greeting.type, 'session.commentary.append')
      assert.equal(greeting.delegation_id, null)
      assert.ok(greeting.content.length < 500, 'Only the short greeting belongs in an append; full context belongs at startup')
      assert.equal(state.row.metadata.greeting_sideband_connected, true)
      assert.equal(state.row.metadata.greeting_command_acknowledged, true)
      assert.equal(state.row.metadata.greeting_input_audio_observed, true)
      assert.equal(state.row.metadata.greeting_transcript_observed, true)
      assert.equal(state.row.metadata.greeting_audio_observed, true)
      assert.equal(state.row.metadata.greeting_playback_verified, false)
      assert.equal(state.row.metadata.greeting_control_failure, null)
      assert.equal(warnings.length, 0)
      assert.doesNotMatch(JSON.stringify(state.row.metadata), /SHOULD_NOT_BE_LOGGED|DO_NOT_STORE/)
    })
  })
})

test('a rejected greeting command records a safe failure instead of hiding the rejection', async () => {
  reset(); state.socketScenario = 'command_error'
  await withConfiguration(async () => captureWarnings(async (warnings) => {
    await service.greetElenaPhoneTest('live_synthetic', callSid)
    assert.equal(state.row.metadata.greeting_sideband_connected, true)
    assert.equal(state.row.metadata.greeting_control_failure, 'command_rejected')
    assert.equal(state.row.metadata.greeting_command_acknowledged, false)
    assert.equal(state.row.metadata.greeting_transcript_observed, false)
    assert.equal(state.row.metadata.greeting_audio_observed, false)
    assert.equal(warnings[0][1].kind, 'command_rejected')
    assert.doesNotMatch(JSON.stringify({ metadata: state.row.metadata, warnings }), /SHOULD_NOT_BE_LOGGED|DO_NOT_STORE/)
  }))
})

test('greeting transport and rejected handshakes have independent safe diagnostics', async () => {
  for (const scenario of ['handshake_error', 'handshake_rejected']) {
    reset(); state.socketScenario = scenario
    await withConfiguration(async () => captureWarnings(async (warnings) => {
      await service.greetElenaPhoneTest('live_synthetic', callSid)
      assert.equal(state.socketSends.length, 0)
      assert.equal(state.row.metadata.greeting_sideband_connected, false)
      assert.equal(state.row.metadata.greeting_control_failure, scenario === 'handshake_error' ? 'socket_error' : 'handshake_rejected')
      assert.equal(state.row.metadata.greeting_provider_status, scenario === 'handshake_rejected' ? 401 : null)
      if (scenario === 'handshake_rejected') assert.equal(state.handshakeBodyResumed, true)
      assert.equal(warnings.length, 1)
      assert.doesNotMatch(JSON.stringify({ metadata: state.row.metadata, warnings }), /SHOULD_NOT_BE_LOGGED|DO_NOT_STORE/)
    }))
  }
})

test('a greeting acknowledgement alone does not count as observed speech or playback', async () => {
  reset(); state.socketScenario = 'no_output'
  await withConfiguration(async () => captureWarnings(async (warnings) => {
    await service.greetElenaPhoneTest('live_synthetic', callSid)
    assert.equal(state.row.metadata.greeting_command_acknowledged, true)
    assert.equal(state.row.metadata.greeting_audio_observed, false)
    assert.equal(state.row.metadata.greeting_transcript_observed, false)
    assert.equal(state.row.metadata.greeting_playback_verified, false)
    assert.equal(warnings[0][1].kind, 'no_output_observed')
  }))
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
    const callback = (value) => ({ form: value, url: 'https://synthetic.invalid/api/elena-phone-test/status' })
    validSignature = false
    assert.equal((await statusRoute.POST(callback(form))).status, 403)
    validSignature = true
    assert.equal((await statusRoute.POST(callback({ ...form, To: publicNumber }))).status, 403)
    assert.equal((await statusRoute.POST(callback({ ...form, AccountSid: 'unrelated-account' }))).status, 403)
    assert.equal(writes.length, 0)
    assert.equal((await (await statusRoute.POST(callback({ ...form, CallStatus: 'in-progress' }))).json()).ignored, true)
    assert.equal(writes.length, 0)
    assert.equal((await statusRoute.POST(callback(form))).status, 200)
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

test('test call completion retries a concurrent update and stays bounded', async () => {
  reset()
  let reads = 0, patches = 0, alwaysConflict = false
  const route = compile('src/app/api/elena-phone-test/status/route.ts', {
    '@/lib/luxorElenaPhoneTestServer': { ELENA_PHONE_TEST_NUMBER: testNumber },
    '@/lib/luxorTwilioServer': { readTwilioForm: async (request) => request.form, validateTwilioWebhook: () => true,
      normalizeTwilioCallStatus: (value) => value, parseTwilioInteger: (value) => Number(value) },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (_query, init = {}) => {
      if (!init.method) { reads += 1; return [{ updated_at: new Date(1_000_000 + reads * 1000).toISOString() }] }
      patches += 1; return alwaysConflict || patches === 1 ? [] : [{ twilio_call_sid: callSid }]
    } },
  })
  await withConfiguration(async () => {
    const callback = { form: { CallSid: callSid, AccountSid: accountSid, To: testNumber, CallStatus: 'completed', CallDuration: '9' }, url: 'https://synthetic.invalid/api/elena-phone-test/status' }
    assert.equal((await route.POST(callback)).status, 200)
    assert.equal(reads, 2); assert.equal(patches, 2)
    reads = 0; patches = 0; alwaysConflict = true
    assert.equal((await route.POST(callback)).status, 503)
    assert.equal(reads, 3); assert.equal(patches, 3)
  })
})

test('transfer callbacks require an authorized parent and preserve answer evidence across late events', async () => {
  reset()
  const writes = []
  const statusRoute = compile('src/app/api/elena-phone-test/status/route.ts', {
    '@/lib/luxorElenaPhoneTestServer': { ELENA_PHONE_TEST_NUMBER: testNumber },
    '@/lib/luxorTwilioServer': {
      readTwilioForm: async (request) => request.form,
      validateTwilioWebhook: () => true,
      normalizeTwilioCallStatus: (value) => value === 'answered' ? 'in-progress' : value,
      parseTwilioInteger: (value) => Number(value),
    },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
      writes.push({ query, init })
      if (!matches(state.row, query)) return []
      if (init.method === 'PATCH') state.row = { ...state.row, ...JSON.parse(init.body) }
      return [structuredClone(state.row)]
    } },
  })
  await withConfiguration(async () => {
    const base = { CallSid: otherCallSid, ParentCallSid: callSid, AccountSid: accountSid, To: transferTarget, CallStatus: 'ringing', SequenceNumber: '1' }
    const callback = (overrides = {}, parent = callSid) => ({ form: { ...base, ...overrides }, url: `https://synthetic.invalid/api/elena-phone-test/status?leg=transfer&parentCallSid=${parent}` })
    assert.equal((await statusRoute.POST(callback({ ParentCallSid: otherCallSid }))).status, 403)
    assert.equal((await statusRoute.POST(callback({ CallSid: callSid }))).status, 403)
    assert.equal((await statusRoute.POST(callback())).status, 403)
    assert.equal(writes.filter(({ init }) => init.method).length, 0)
    state.row.metadata.transfer_state = 'attempted'
    assert.equal((await statusRoute.POST(callback())).status, 200)
    assert.equal(state.row.metadata.transfer_answered, false)
    assert.equal((await statusRoute.POST(callback({ CallStatus: 'answered', SequenceNumber: '2' }))).status, 200)
    assert.equal(state.row.metadata.transfer_answered, true)
    assert.equal(state.row.metadata.transfer_status, 'in-progress')
    assert.equal((await statusRoute.POST(callback({ CallStatus: 'completed', SequenceNumber: '3' }))).status, 200)
    assert.equal((await statusRoute.POST(callback({ CallStatus: 'ringing', SequenceNumber: '1' }))).status, 200)
    assert.equal(state.row.metadata.transfer_status, 'completed')
    assert.equal(state.row.metadata.transfer_answered, true)
    assert.equal(state.row.metadata.transfer_last_sequence, 3)
    assert.equal(state.row.status, 'in-progress')
    assert.equal(state.row.metadata.openai_session_id, 'live_synthetic')
    assert.ok(writes.filter(({ init }) => init.method).every(({ init }) => JSON.parse(init.body).status === undefined))
  })
})
