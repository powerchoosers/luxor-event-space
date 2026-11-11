/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { twiml } = require('twilio')

const root = path.resolve(__dirname, '..')
const accountSid = `AC${'4'.repeat(32)}`, callSid = `CA${'1'.repeat(32)}`, childSid = `CA${'2'.repeat(32)}`
const testNumber = '+18176630380', publicNumber = '+19563652037'
const secret = `whsec_${Buffer.alloc(32, 9).toString('base64')}`
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

const proof = compile('src/lib/luxorElenaPhoneIngressProof.ts', {})
const service = compile('src/lib/luxorElenaPhoneIngressServer.ts', {
  'server-only': {},
  './luxorCallsServer': { normalizePhoneNumber: (value) => /^\+1\d{10}$/.test(String(value || '')) ? value : null },
  './luxorElenaPhoneTestServer': { ELENA_PHONE_TEST_NUMBER: testNumber },
  './luxorElenaPhoneIngressProof': proof,
  './supabaseRestServer': { supabaseRestStrict: async (query, init = {}) => {
    state.requests.push({ query, init })
    if (query.startsWith('luxor_phone_numbers?')) return state.managed
    assert.ok(query.startsWith('luxor_calls?'), 'Ingress must only access its call history and number protection')
    const params = new URLSearchParams(query.split('?')[1])
    if (!init.method) return state.row && params.get('twilio_call_sid') === `eq.${state.row.twilio_call_sid}` ? [structuredClone(state.row)] : []
    if (init.method === 'POST') {
      assert.match(init.headers.Prefer, /resolution=ignore-duplicates/)
      if (!state.row) state.row = { id: 'synthetic-call', ...JSON.parse(init.body) }
      return null
    }
    assert.equal(init.method, 'PATCH')
    if (!state.row || params.get('updated_at') !== `eq.${state.row.updated_at}`
      || params.get('metadata->>scope') !== `eq.${state.row.metadata.scope}`
      || params.get('metadata->>ingress_mode') !== `eq.${state.row.metadata.ingress_mode}`) return []
    state.row = { ...state.row, ...JSON.parse(init.body) }
    return [structuredClone(state.row)]
  } },
  './luxorTwilioServer': {
    getLuxorTwilioConfig: () => ({ accountSid }),
    readTwilioForm: async (request) => request.form,
    validateTwilioWebhook: () => state.validSignature,
    createTwilioVoiceResponse: () => new twiml.VoiceResponse(),
    forbiddenTwimlResponse: () => new Response('<Response><Hangup/></Response>', { status: 403 }),
    twimlResponse: (response) => new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } }),
  },
})

function reset() {
  state = { validSignature: true, managed: [{ phone_number: publicNumber, is_public: true, is_active: true }], row: null, requests: [] }
}

function incoming(overrides = {}) {
  return { form: { AccountSid: accountSid, CallSid: callSid, To: testNumber, From: '+15550001111', Direction: 'inbound', ...overrides } }
}

async function configured(fn) {
  const values = { LUXOR_ELENA_PHONE_TEST_ENABLED: 'true', LUXOR_ELENA_TEST_NUMBER: testNumber, OPENAI_PROJECT_ID: 'proj_synthetic', OPENAI_VOICE_WEBHOOK_SECRET: secret }
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]])), priorFetch = global.fetch
  Object.assign(process.env, values)
  global.fetch = async () => { throw new Error('Ingress tests must never contact a live provider') }
  try { await fn() } finally {
    global.fetch = priorFetch
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
}

test('signed ingress rejects invalid signature, account, destination, direction and caller metadata before issuing SIP', async () => {
  reset()
  await configured(async () => {
    state.validSignature = false
    assert.equal((await service.handleElenaPhoneIncoming(incoming())).status, 403)
    state.validSignature = true
    for (const overrides of [{ AccountSid: `AC${'7'.repeat(32)}` }, { To: publicNumber }, { Direction: 'outbound-api' }, { CallSid: 'not-a-call' }]) {
      assert.equal((await service.handleElenaPhoneIncoming(incoming(overrides))).status, 403)
    }
    assert.equal(state.requests.length, 0)
    assert.equal((await service.handleElenaPhoneIncoming(incoming({ From: 'untrusted-destination' }))).status, 403)
    assert.equal(state.row, null)
  })
})

test('ingress protects a public Luxor line while allowing the explicitly selected nonpublic number', async () => {
  reset()
  await configured(async () => {
    state.managed = [{ phone_number: testNumber, is_public: true, is_active: false }]
    const response = await service.handleElenaPhoneIncoming(incoming()), xml = await response.text()
    assert.match(xml, /<Hangup\s*\/>/)
    assert.doesNotMatch(xml, /<Sip>/)
    assert.equal(state.row, null)
    assert.equal(state.requests.filter(({ init }) => init.method).length, 0)
    state.managed = [{ phone_number: testNumber, is_public: false, is_active: true }]
    assert.match(await (await service.handleElenaPhoneIncoming(incoming())).text(), /<Sip>/)
  })
})

test('ingress retries preserve one call-bound ticket, expiry and an already claimed session', async () => {
  reset()
  await configured(async () => {
    const first = await service.handleElenaPhoneIncoming(incoming()), xml = await first.text()
    assert.match(xml, /;transport=tls;secure=true\?X-Luxor-Ingress=/)
    assert.match(xml, /answerOnBridge="true"/)
    const token = xml.match(/X-Luxor-Ingress=([A-Za-z0-9_-]{43})/)?.[1]
    assert.equal(token, proof.deriveElenaIngressToken(callSid, secret))
    assert.equal(state.row.metadata.ingress_token_hash, proof.hashElenaIngressToken(token, secret))
    assert.equal(state.row.recording_consent_status, 'not_requested')
    assert.equal(state.row.transcription_status, 'not_requested')
    assert.ok(!JSON.stringify(state.row).includes(token), 'Raw ticket must not be persisted')
    const expiry = state.row.metadata.ingress_expires_at
    const retry = await (await service.handleElenaPhoneIncoming(incoming())).text()
    assert.equal(retry.match(/X-Luxor-Ingress=([A-Za-z0-9_-]{43})/)?.[1], token)
    state.row.metadata.openai_session_id = 'live_already_claimed'; state.row.metadata.accepted = true
    const claimedRetry = await (await service.handleElenaPhoneIncoming(incoming())).text()
    assert.doesNotMatch(claimedRetry, /<Sip>/)
    assert.equal(state.row.metadata.ingress_expires_at, expiry)
    assert.equal(state.row.metadata.openai_session_id, 'live_already_claimed')
    assert.equal(state.row.metadata.accepted, true)
    assert.equal(state.requests.filter(({ init }) => init.method === 'PATCH').length, 0)
  })
})

test('ticket derivation is bound to parent and secret and uses a separate stored digest', () => {
  const token = proof.deriveElenaIngressToken(callSid, secret)
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(token, proof.deriveElenaIngressToken(childSid, secret))
  assert.notEqual(token, proof.deriveElenaIngressToken(callSid, secret + 'different'))
  assert.match(proof.hashElenaIngressToken(token, secret), /^[0-9a-f]{64}$/)
  assert.notEqual(proof.hashElenaIngressToken(token, secret), proof.hashElenaIngressToken(token, secret + 'different'))
  assert.throws(() => proof.deriveElenaIngressToken('not-a-call', secret))
  assert.throws(() => proof.hashElenaIngressToken(token + 'extra', secret))
})

test('an expired ticket or a conflicting existing call cannot be refreshed by an incoming retry', async () => {
  reset()
  await configured(async () => {
    await service.handleElenaPhoneIncoming(incoming())
    state.row.metadata.ingress_expires_at = new Date(Date.now() - 1000).toISOString()
    const expired = await (await service.handleElenaPhoneIncoming(incoming())).text()
    assert.doesNotMatch(expired, /<Sip>/)
    assert.ok(Date.parse(state.row.metadata.ingress_expires_at) < Date.now())
    state.row.metadata.scope = 'unrelated_call'
    const conflicting = await (await service.handleElenaPhoneIncoming(incoming())).text()
    assert.doesNotMatch(conflicting, /<Sip>/)
    assert.equal(state.row.metadata.scope, 'unrelated_call')
  })
})

test('signed SIP completion retains parent status, session and transfer claim without side effects', async () => {
  reset()
  await configured(async () => {
    await service.handleElenaPhoneIncoming(incoming())
    state.row.status = 'in-progress'; state.row.metadata.openai_session_id = 'live_synthetic'; state.row.metadata.accepted = true; state.row.metadata.transfer_state = 'attempted'
    state.validSignature = false
    assert.equal((await service.handleElenaPhoneComplete(incoming())).status, 403)
    state.validSignature = true
    assert.equal((await service.handleElenaPhoneComplete(incoming({ To: publicNumber }))).status, 403)
    const response = await service.handleElenaPhoneComplete(incoming({ DialCallSid: childSid, DialCallStatus: 'completed', DialCallDuration: '12' }))
    assert.equal(response.status, 200)
    assert.equal(state.row.metadata.sip_child_call_sid, childSid)
    assert.equal(state.row.metadata.sip_dial_duration_seconds, 12)
    assert.equal(state.row.metadata.transfer_state, 'attempted')
    assert.equal(state.row.metadata.openai_session_id, 'live_synthetic')
    assert.equal(state.row.status, 'in-progress')
    assert.equal(state.row.recording_consent_status, 'not_requested')
    const patch = state.requests.filter(({ init }) => init.method === 'PATCH').at(-1)
    assert.equal(JSON.parse(patch.init.body).status, undefined)
  })
})

test('fallback requires the same signed test destination and performs no database writes', async () => {
  reset()
  await configured(async () => {
    assert.equal((await service.handleElenaPhoneFallback(incoming({ To: publicNumber }))).status, 403)
    state.validSignature = false
    assert.equal((await service.handleElenaPhoneFallback(incoming())).status, 403)
    state.validSignature = true
    assert.match(await (await service.handleElenaPhoneFallback(incoming())).text(), /<Hangup\s*\/>/)
    assert.equal(state.requests.length, 0)
  })
})
