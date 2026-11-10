'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const model = load('src/lib/luxorFinalPaymentReminderCopy.ts'), design = load('src/lib/luxorEmailDesignSystem.ts')
const offerModel = load('src/lib/luxorOfferReminderCopy.ts', { './luxorFinalPaymentReminderCopy': model })
const paymentModel = load('src/lib/luxorPaymentRequestReminderCopy.ts', { './luxorFinalPaymentReminderCopy': model })
const lifecycle = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorFinalPaymentReminderCopy': model, './luxorEmailDesignSystem': design })
let paid, enabled, signed, patch, checkoutCalls, paymentReadFails
const invoice = { id: 'invoice', invoice_kind: 'final_balance', booking_id: 'booking', inquiry_id: 'inquiry', total: 100, line_items: [] }
const copy = { ...model.FINAL_PAYMENT_REMINDER_DEFAULT, body: 'Saved wording for {{first_name}}' }
const job = { id: 'job', job_type: 'final_payment_reminder', booking_id: 'booking', inquiry_id: 'inquiry', recipient_email: 'sample@example.invalid', metadata: { invoice_id: 'invoice', milestone: '14_days', final_payment_copy_snapshot: copy } }
const worker = load('src/lib/luxorEmailJobsServer.ts', {
  './luxorFinalPaymentReminderCopy': model, './luxorOfferReminderCopy': offerModel, './luxorPaymentRequestReminderCopy': paymentModel, './luxorLifecycleEmailsServer': lifecycle,
  './supabaseRestServer': { supabaseRest: async (_query, options) => { patch = JSON.parse(options.body); return [patch] } },
  './luxorPaymentRemindersServer': { areLuxorFinalPaymentRemindersEnabled: async () => enabled },
  './luxorBookingsServer': { getLuxorBooking: async () => ({ id: 'booking', inquiry_id: 'inquiry', contract_status: signed ? 'signed' : 'draft', final_payment_due_date: '2099-12-10' }) },
  './luxorInvoicesServer': { getInvoice: async () => invoice, listPaidPaymentsByInvoice: async () => { if (paymentReadFails) throw new Error('payments unavailable'); return paid ? [{ amount: paid }] : [] } },
  './luxorInquiriesServer': { getLuxorInquiry: async () => ({ id: 'inquiry', full_name: 'Sample Guest', email: 'sample@example.invalid', status: 'booked' }) },
  './luxorStripeCheckoutServer': { createLuxorPostContractCheckout: async () => { checkoutCalls++; return { checkoutUrl: 'https://example.invalid/fresh-checkout', checkoutId: 'fresh', paymentAmount: 100 - paid } }, prepareLuxorDepositPaymentLink: async () => { checkoutCalls++; return 'https://example.invalid/fresh-deposit' } },
})
function reset() { paid = 40; enabled = true; signed = true; patch = null; checkoutCalls = 0; paymentReadFails = false }
test('worker refreshes balance and payment link while preserving the saved wording', async () => {
  reset(); const result = await worker.preparePostContractPaymentReminder(job)
  assert.match(result.body, /Saved wording for Sample/); assert.match(result.body, /\$60\.00/); assert.match(result.body, /example\.invalid\/fresh-checkout/)
  assert.equal(result.metadata.checkout_session_id, 'fresh'); assert.deepEqual(result.metadata.final_payment_copy_snapshot, copy); assert.equal(patch.metadata.balance_due, 60)
})
test('worker cancels paid, unsigned and paused reminders without generating a checkout', async () => {
  reset(); paid = 100; assert.equal(await worker.preparePostContractPaymentReminder(job), null); assert.match(patch.last_error, /fully paid/); assert.equal(checkoutCalls, 0)
  reset(); signed = false; assert.equal(await worker.preparePostContractPaymentReminder(job), null); assert.match(patch.last_error, /signed/); assert.equal(checkoutCalls, 0)
  reset(); enabled = false; assert.equal(await worker.preparePostContractPaymentReminder(job), null); assert.match(patch.last_error, /paused/); assert.equal(checkoutCalls, 0)
})
test('worker does not treat a failed payment read as an unpaid balance', async () => {
  reset(); paymentReadFails = true
  await assert.rejects(worker.preparePostContractPaymentReminder(job), /payments unavailable/)
  assert.equal(checkoutCalls, 0); assert.equal(patch, null)
})
test('deposit offer keeps its saved wording when the worker refreshes payment details', async () => {
  reset(); invoice.invoice_kind = 'deposit'
  const offerCopy = { ...offerModel.OFFER_REMINDER_EDIT_STARTER, body: 'Saved offer wording for {{first_name}}' }
  try {
    const result = await worker.preparePostContractPaymentReminder({ ...job, job_type: 'proposal_payment_reminder', metadata: { invoice_id: 'invoice', offer_reminder: true, offer_copy_snapshot: offerCopy } })
    assert.match(result.body, /Saved offer wording for Sample/); assert.match(result.body, /\$60\.00/); assert.match(result.body, /example\.invalid\/fresh-deposit/)
    assert.deepEqual(result.metadata.offer_copy_snapshot, offerCopy)
    reset(); signed = false
    assert.equal(await worker.preparePostContractPaymentReminder({ ...job, job_type: 'proposal_payment_reminder', metadata: { invoice_id: 'invoice', offer_reminder: true, offer_copy_snapshot: offerCopy } }), null)
    assert.equal(checkoutCalls, 0)
  } finally { invoice.invoice_kind = 'final_balance' }
})
test('payment-request wording survives a deposit reminder refresh without weakening eligibility', async () => {
  reset(); invoice.invoice_kind = 'deposit'
  const paymentCopy = { ...paymentModel.PAYMENT_REQUEST_REMINDER_EDIT_STARTER, body: 'Payment wording for {{first_name}}' }
  const paymentJob = { ...job, job_type: 'proposal_payment_reminder', metadata: { invoice_id: 'invoice', payment_request_reminder: true, payment_request_copy_snapshot: paymentCopy } }
  try {
    const result = await worker.preparePostContractPaymentReminder(paymentJob)
    assert.match(result.body, /Payment wording for Sample/); assert.match(result.body, /\$60\.00/); assert.match(result.body, /example\.invalid\/fresh-deposit/)
    reset(); signed = false; assert.equal(await worker.preparePostContractPaymentReminder(paymentJob), null); assert.equal(checkoutCalls, 0)
  } finally { invoice.invoice_kind = 'final_balance' }
})
