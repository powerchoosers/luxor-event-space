'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const model = load('src/lib/luxorInquiryEmailCopy.ts')
const types = load('src/lib/luxorInquiryTypes.ts')
function makeHarness(readSetting, readReceipt = async () => ({ setting: { copy_override: null } })) {
  let queued, processed = false
  const email = {
    createLuxorEmailJob: async (job) => { queued = job; return { id: 'synthetic-job' } },
    createPublicToken: () => 'synthetic-token',
    buildTourRequestReceivedEmailHtml: (_, token, override) => `${token}:${override ? 'custom tour receipt' : 'default tour receipt'}`,
    buildNewsletterConfirmationEmailHtml: (_, override) => override ? 'custom newsletter' : 'newsletter',
    buildStandardInquiryEmailHtml: (_, override) => override ? 'custom receipt' : 'default receipt',
    listQueuedLuxorEmailJobsByIds: async () => [{ id: 'synthetic-job' }],
    processLuxorEmailJobs: async () => { processed = true },
  }
  const service = load('src/lib/luxorInquiriesServer.ts', {
    'server-only': {}, './luxorInquiryTypes': types, './luxorEmailJobsServer': email,
    './luxorInquiryEmailCopyServer': { readInquiryEmailCopySetting: readSetting }, './luxorInquiryEmailCopy': model,
    './luxorReceiptEmailCopyServer': { readReceiptEmailCopy: readReceipt },
    './supabaseRestServer': { supabaseRest: async (_url, init) => [{ id: 'synthetic-inquiry', ...JSON.parse(init.body) }] },
    './luxorTourMetrics': {}, './luxorTextAutomationsServer': {}, './luxorTourSlotsServer': {}, './luxorTourSlots': {}, './luxorCalendarServer': {}, './luxorTourPlanningServer': {}, './luxorPhoneNumbersServer': {}, './luxorInquiryDuplicateMatch': {},
  })
  return { service, result: () => ({ queued, processed }) }
}
const inquiry = { fullName: 'Sample Guest', email: 'sample@example.invalid', eventType: 'Wedding', flow: 'contact' }
test('queues customized inquiry copy and snapshots its subject', async () => {
  const custom = { ...model.INQUIRY_EMAIL_DEFAULT, subject: 'Hello {{first_name}}' }
  const h = makeHarness(async () => ({ setting: { copy_override: custom } }))
  await h.service.createLuxorInquiry(inquiry)
  const { queued, processed } = h.result()
  assert.equal(queued.subject, 'Hello Sample'); assert.equal(queued.body, 'custom receipt'); assert.equal(processed, true)
  assert.equal(queued.metadata.source, 'inquiry_acknowledgment'); assert.equal(queued.metadata.ignore_suppressions, true)
})
test('settings outage queues the original receipt and records the fallback', async () => {
  const h = makeHarness(async () => { throw new Error('synthetic settings outage') })
  const previous = console.error; console.error = () => {}
  try { await h.service.createLuxorInquiry(inquiry) } finally { console.error = previous }
  const { queued, processed } = h.result()
  assert.equal(queued.body, 'default receipt'); assert.equal(queued.metadata.copy_settings_unavailable, true); assert.equal(processed, true)
})
test('newsletter receipts do not depend on inquiry copy settings', async () => {
  const h = makeHarness(async () => { throw new Error('must not be called') })
  await h.service.createLuxorInquiry({ ...inquiry, flow: 'newsletter_signup' })
  const { queued } = h.result()
  assert.equal(queued.body, 'newsletter'); assert.equal(queued.metadata.source, 'newsletter_confirmation')
  assert.equal(queued.metadata.copy_settings_unavailable, undefined)
})
test('newsletter receipts snapshot their own copy and preserve receipt suppression behavior', async () => {
  const custom = { ...model.INQUIRY_EMAIL_DEFAULT, subject: 'Welcome {{first_name}}' }
  const h = makeHarness(async () => { throw new Error('wrong settings') }, async (key) => { assert.equal(key, 'newsletter_confirmation'); return { setting: { copy_override: custom } } })
  await h.service.createLuxorInquiry({ ...inquiry, flow: 'newsletter_signup' })
  const { queued } = h.result()
  assert.equal(queued.subject, 'Welcome Sample'); assert.equal(queued.body, 'custom newsletter')
  assert.equal(queued.metadata.source, 'newsletter_confirmation'); assert.equal(queued.metadata.ignore_suppressions, true)
})
test('tour request receipts use their own copy and preserve the recorded request source', async () => {
  const custom = { ...model.RECEIPT_EMAIL_DEFAULTS.tour_request_received, subject: 'Tour request for {{first_name}}' }
  const h = makeHarness(async () => { throw new Error('wrong settings') }, async (key) => { assert.equal(key, 'tour_request_received'); return { setting: { copy_override: custom } } })
  await h.service.createLuxorInquiry({ ...inquiry, preferredTourDate: '2099-12-10', preferredTourTime: '11:00 AM' })
  const { queued, processed } = h.result()
  assert.equal(queued.subject, 'Tour request for Sample'); assert.equal(queued.body, 'synthetic-token:custom tour receipt')
  assert.equal(queued.jobType, 'tour_confirmation'); assert.equal(queued.metadata.source, 'tour_request_received'); assert.equal(processed, true)
})
