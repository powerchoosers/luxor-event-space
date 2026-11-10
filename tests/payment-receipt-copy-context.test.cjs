'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/lib', file)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  return mod.exports
}
const copy = load('luxorPaidInvoiceEmailCopy.ts')
let override = null
const payment = { id: '11111111-1111-4111-8111-111111111111', status: 'paid', amount: 250, created_at: '2026-11-01T12:00:00Z', payment_method: 'Zelle', inquiry_id: 'inquiry' }
const context = load('luxorPaymentReceiptEmailServer.ts', {
  'server-only': {},
  './luxorBookingsServer': { getLuxorBooking: async () => null },
  './luxorInquiriesServer': { getLuxorInquiry: async () => ({ full_name: '<Alex>', email: 'alex@example.invalid' }) },
  './luxorInvoicesServer': { getInvoice: async () => null },
  './supabaseRestServer': { supabaseRest: async () => [payment] },
  './luxorPaymentReceiptPdf': { buildLuxorPaymentReceiptPdf: async () => new Uint8Array([1, 2, 3]) },
  './luxorMailConfig': { luxorMailAddress: value => value },
  './luxorPaymentReceiptCopyServer': { readPaymentReceiptCopySetting: async () => ({ setting: { copy_override: override } }) },
  './luxorPaidInvoiceEmailCopy': copy,
})
test('receipt copy is escaped and fingerprinted while payment details and PDF remain intact', async () => {
  override = null
  const original = await context.getLuxorPaymentReceiptEmailContext(payment.id)
  override = { subject: 'Receipt for {{first_name}}', greeting: 'Hello {{first_name}},', closing: '<Thanks>\nSee you soon.' }
  const changed = await context.getLuxorPaymentReceiptEmailContext(payment.id)
  assert.equal(changed.subject, 'Receipt for <Alex>')
  assert.match(changed.html, /Hello &lt;Alex&gt;,/)
  assert.match(changed.html, /&lt;Thanks&gt;<br \/>See you soon/)
  assert.match(changed.html, /\$250\.00/)
  assert.equal(changed.pdfSha256, original.pdfSha256)
  assert.notEqual(changed.fingerprint, original.fingerprint)
  override = null
  const restored = await context.getLuxorPaymentReceiptEmailContext(payment.id)
  assert.equal(restored.fingerprint, original.fingerprint)
  assert.equal(restored.html, original.html)
})
