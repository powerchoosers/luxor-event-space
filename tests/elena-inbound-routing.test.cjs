/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/app/api/twilio/incoming/route.ts')
let liveCalls = 0, legacyCalls = 0
const stubs = {
  'next/server': { after: () => {} },
  '@/lib/luxorCallsServer': { createOrUpdateLuxorCall: async () => { legacyCalls += 1 }, findLuxorInquiryByPhone: async () => null, normalizePhoneNumber: (v) => typeof v === 'string' && /^\+1\d{10}$/.test(v) ? v : null },
  '@/lib/luxorTwilioServer': {
    buildTwilioCallbackUrl: (p) => `https://example.invalid${p}`,
    createTwilioVoiceResponse: () => ({ say() { this.said = true }, hangup() { this.ended = true }, dial() { return { client() {}, number() {} } } }),
    forbiddenTwimlResponse: () => new Response('forbidden', { status: 403 }),
    getLuxorTwilioConfig: () => ({ phoneNumber: '+15550001111' }),
    readTwilioForm: async (request) => Object.fromEntries(await request.formData()),
    twimlResponse: (r) => Response.json({ legacy: true, said: Boolean(r.said), ended: Boolean(r.ended) }),
    validateTwilioWebhook: (request) => request.headers.get('x-twilio-signature') === 'valid',
  },
  '@/lib/luxorPhoneRoutingServer': { getLuxorPhoneRoutingSettings: async () => ({ ring_browser: false, ring_phone: false }) },
  '@/lib/luxorWebPushServer': { sendLuxorWebPush: async () => {} },
  '@/lib/luxorElenaInboundServer': { handleElenaLiveIncoming: async (request) => { liveCalls += 1; const form = await request.formData(); return Response.json({ live: true, to: form.get('To') }) } },
}
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
const original = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
loaded._compile(js, filename); const route = loaded.exports
const request = (to, signature = 'valid') => new Request('https://example.invalid/api/twilio/incoming', { method: 'POST', headers: { 'x-twilio-signature': signature }, body: new URLSearchParams({ To: to, From: '+15550002222', CallSid: `CA${'a'.repeat(32)}` }) })

test('the live gate routes only verified calls to the selected number; legacy calls remain intact', async () => {
  const oldGate = process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED, oldNumber = process.env.LUXOR_ELENA_LIVE_NUMBER
  try {
    process.env.LUXOR_ELENA_LIVE_NUMBER = '+15550001111'; process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'false'
    let response = await route.POST(request('+15550001111')); assert.equal((await response.json()).legacy, true); assert.equal(legacyCalls, 1); assert.equal(liveCalls, 0)
    process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = 'true'
    response = await route.POST(request('+15550001111', 'invalid')); assert.equal(response.status, 403); assert.equal(liveCalls, 0)
    response = await route.POST(request('+15550001111')); assert.deepEqual(await response.json(), { live: true, to: '+15550001111' }); assert.equal(liveCalls, 1)
    response = await route.POST(request('+15550003333')); assert.equal((await response.json()).legacy, true); assert.equal(legacyCalls, 2)
    process.env.LUXOR_ELENA_LIVE_NUMBER = 'invalid'; response = await route.POST(request('+15550001111'))
    assert.deepEqual(await response.json(), { legacy: true, said: true, ended: true }); assert.equal(legacyCalls, 2)
  } finally {
    if (oldGate === undefined) delete process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED; else process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED = oldGate
    if (oldNumber === undefined) delete process.env.LUXOR_ELENA_LIVE_NUMBER; else process.env.LUXOR_ELENA_LIVE_NUMBER = oldNumber
  }
})
