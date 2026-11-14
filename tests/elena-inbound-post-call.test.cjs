/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function compile(relative, stubs = {}) {
  const filename = path.join(root, relative)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => (Object.hasOwn(stubs, name) ? stubs[name] : original(name))
  loaded._compile(source, filename)
  return loaded.exports
}

const postCall = compile('src/lib/luxorElenaInboundPostCallServer.ts', {
  'server-only': {},
  './luxorCallsServer': {
    normalizePhoneNumber: (value) => {
      const digits = String(value || '').replace(/\D/g, '')
      return digits.length === 10 ? '+1' + digits : digits.length === 11 && digits[0] === '1' ? '+' + digits : null
    },
  },
  './luxorCallTypes': {},
  './supabaseRestServer': {},
  './luxorElenaCallerEventType': compile('src/lib/luxorElenaCallerEventType.ts', { './luxorInquiryTypes': { filterLuxorEventTypes: (v) => (/\bquince/i.test(v) ? ['Quinceañera'] : []), normalizeLuxorEventType: () => null } }),
  './luxorBrochureDeliveryQueue': {},
  './luxorInquiryTypes': {},
  './luxorElenaInboundServer': { ELENA_LIVE_SCOPE: 'elena_live_inbound' },
})

test('parseElenaInboundPostCallExtract reads summary facts for a quince inquiry', () => {
  const summary = `Caller Maria Lopez planned a quinceañera on 2027-05-22 for about 150 guests. Email maria@example.com. Elena promised to email package details.`
  const extract = postCall.parseElenaInboundPostCallExtract(summary, '+15551234567')
  assert.equal(extract.full_name, 'Maria Lopez')
  assert.equal(extract.phone, '+15551234567')
  assert.equal(extract.email, 'maria@example.com')
  assert.equal(extract.target_date, '2027-05-22')
  assert.equal(extract.guest_count, 150)
  assert.equal(extract.event_type, 'Quinceañera')
  assert.equal(extract.package_email_promised, true)
})

test('parseElenaInboundPostCallExtract returns null without a name', () => {
  assert.equal(postCall.parseElenaInboundPostCallExtract('General venue question only.', '+15551234567'), null)
})

test('reconcile skips when call already has inquiry_id', async () => {
  const reconcile = compile('src/lib/luxorElenaInboundPostCallServer.ts', {
    'server-only': {},
    './luxorCallsServer': {
      normalizePhoneNumber: (value) => {
        const digits = String(value || '').replace(/\D/g, '')
        return digits.length === 10 ? '+1' + digits : null
      },
      getLuxorCallBySid: async () => ({
        id: 'call', inquiry_id: 'ed4e8c25-0000-4000-8000-000000000000',
        summary_status: 'completed', summary_text: 'Caller Maria Lopez', metadata: { scope: 'elena_live_inbound', accepted: true },
      }),
      getLuxorTranscriptSegments: async () => [],
    },
    './luxorCallTypes': compile('src/lib/luxorCallTypes.ts', {}),
    './supabaseRestServer': {},
    './luxorElenaCallerEventType': compile('src/lib/luxorElenaCallerEventType.ts', { './luxorInquiryTypes': { filterLuxorEventTypes: () => [], normalizeLuxorEventType: () => null } }),
    './luxorBrochureDeliveryQueue': {},
    './luxorInquiryTypes': {},
    './luxorElenaInboundServer': { ELENA_LIVE_SCOPE: 'elena_live_inbound' },
  })
  const result = await reconcile.reconcileElenaInboundAfterSummary('CA' + '1'.repeat(32))
  assert.equal(result.status, 'skipped')
  assert.equal(result.reason, 'inquiry_linked')
})