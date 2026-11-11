/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function compile(relative, stubs) {
  const filename = path.join(root, relative)
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
  loaded._compile(js, filename); return loaded.exports
}
let owner, row, writes, dbFails
const settings = compile('src/lib/luxorElenaInboundSettingsServer.ts', {
  'server-only': {}, './supabaseRestServer': { supabaseRestStrict: async (_path, init) => {
    if (dbFails) throw new Error('Database unavailable')
    if (init?.method === 'PATCH') { const patch = JSON.parse(init.body); writes.push(patch); row = { ...row, ...patch } }
    return row ? [row] : []
  } },
})
const route = compile('src/app/api/portal/elena-inbound-settings/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/luxorElenaVoiceSandboxServer': { requireElenaVoiceManager: async () => owner ? { session: { email: 'OWNER@example.invalid' } } : { error: Response.json({ error: 'Unauthorized' }, { status: 403 }) } },
  '@/lib/luxorElenaInboundSettingsServer': settings,
  '@/lib/luxorElenaInboundRoutingServer': { getElenaInboundRouting: async () => ({ status: 'planned' }) },
})
const request = (body) => new Request('https://example.invalid/api/portal/elena-inbound-settings', { method: 'PATCH', body: JSON.stringify(body) })
function reset() { owner = true; row = { voice: 'brise', arianna_available: false }; writes = []; dbFails = false }

test('inbound settings require an authorized settings manager', async () => {
  reset(); owner = false
  assert.equal((await route.GET()).status, 403)
  assert.equal((await route.PATCH(request({ ariannaAvailable: true }))).status, 403)
  assert.equal(writes.length, 0)
})

test('only Brise or Nira and a boolean availability are accepted', async () => {
  reset()
  for (const input of [{}, null, [], { voice: 'marin' }, { ariannaAvailable: 'yes' }, { actor: 'forged' }, { voice: 'brise', extra: true }]) assert.equal((await route.PATCH(request(input))).status, 400)
  assert.equal(writes.length, 0)
})

test('partial updates preserve the other setting and use the signed-in actor', async () => {
  reset()
  let response = await route.PATCH(request({ voice: 'nira' }))
  assert.deepEqual(await response.json(), { voice: 'nira', ariannaAvailable: false })
  assert.equal(writes[0].updated_by, 'owner@example.invalid')
  response = await route.PATCH(request({ ariannaAvailable: true }))
  assert.deepEqual(await response.json(), { voice: 'nira', ariannaAvailable: true })
  assert.equal('voice' in writes[1], false)
})

test('missing or invalid stored configuration fails closed', async () => {
  reset(); row = null; assert.equal((await route.GET()).status, 503)
  row = { voice: 'other', arianna_available: false }; assert.equal((await route.GET()).status, 503)
  dbFails = true; assert.equal((await route.PATCH(request({ ariannaAvailable: true }))).status, 503)
})

test('live status requires the gate, selected public number, and matching Twilio routing', async () => {
  const keys = ['LUXOR_ELENA_LIVE_INBOUND_ENABLED', 'LUXOR_ELENA_LIVE_NUMBER', 'LUXOR_ELENA_LIVE_NUMBER_SID', 'LUXOR_TWILIO_ACCOUNT_SID', 'LUXOR_TWILIO_AUTH_TOKEN', 'OPENAI_API_KEY', 'OPENAI_PROJECT_ID', 'OPENAI_VOICE_WEBHOOK_SECRET']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const account = `AC${'a'.repeat(32)}`, sid = `PN${'b'.repeat(32)}`, phone = '+15550001111'
  let selected = [{ phone_number: phone, twilio_number_sid: sid }]
  let number = { accountSid: account, phoneNumber: phone, trunkSid: null, voiceApplicationSid: null, voiceUrl: 'https://www.luxoratlaspalmas.com/api/twilio/incoming', voiceMethod: 'POST', statusCallback: 'https://www.luxoratlaspalmas.com/api/elena-inbound/status', statusCallbackMethod: 'POST' }
  const routing = compile('src/lib/luxorElenaInboundRoutingServer.ts', {
    'server-only': {}, twilio: () => ({ incomingPhoneNumbers: () => ({ fetch: async () => number }) }),
    './supabaseRestServer': { supabaseRestStrict: async () => selected },
  })
  try {
    process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'false'
    assert.equal((await routing.getElenaInboundRouting()).status, 'planned')
    Object.assign(process.env, { LUXOR_ELENA_LIVE_INBOUND_ENABLED: 'true', LUXOR_ELENA_LIVE_NUMBER: phone, LUXOR_ELENA_LIVE_NUMBER_SID: sid, LUXOR_TWILIO_ACCOUNT_SID: account, LUXOR_TWILIO_AUTH_TOKEN: 'synthetic', OPENAI_API_KEY: 'synthetic', OPENAI_PROJECT_ID: 'synthetic', OPENAI_VOICE_WEBHOOK_SECRET: 'synthetic' })
    assert.equal((await routing.getElenaInboundRouting()).status, 'active')
    selected = []; assert.equal((await routing.getElenaInboundRouting()).status, 'unverified')
    selected = [{ phone_number: phone, twilio_number_sid: sid }]; number = { ...number, statusCallback: null }
    assert.equal((await routing.getElenaInboundRouting()).status, 'unverified')
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] } }
})
