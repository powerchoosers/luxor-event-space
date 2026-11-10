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
const model = load('src/lib/luxorInstallmentReminderCopy.ts'), design = load('src/lib/luxorEmailDesignSystem.ts')
let paid = 0, windowOpen = true, patch
const booking = { id: 'booking', inquiry_id: 'inquiry', invoice_id: 'master', status: 'confirmed', contract_status: 'signed', metadata: { deposit_paid_at: '2026-01-01' } }
const installment = { id: 'installment', invoice_id: 'master', label: 'Second payment', amount: 100, due_at: '2099-12-10', status: 'scheduled' }
const worker = load('src/lib/luxorEmailJobsServer.ts', {
  './luxorInstallmentReminderCopy': model, './luxorEmailDesignSystem': design,
  './supabaseRestServer': { supabaseRest: async (_query, options) => { patch = JSON.parse(options.body); return [patch] } },
  './luxorPaymentRemindersServer': { areLuxorFinalPaymentRemindersEnabled: async () => true },
  './luxorBookingsServer': { getLuxorBooking: async () => booking },
  './luxorInvoicesServer': { getInvoice: async () => ({ id: 'master', invoice_kind: 'event' }), getInvoiceByBookingAndKind: async () => ({ id: 'final', total: 100 }), listPaidPaymentsByInvoice: async () => [], listInvoicesByBooking: async () => [] },
  './luxorInquiriesServer': { getLuxorInquiry: async () => ({ id: 'inquiry', full_name: 'Sample Guest', email: 'sample@example.invalid', status: 'booked', is_test: false }) },
  './luxorPaymentInstallmentsServer': { listLuxorPaymentInstallments: async () => [installment] },
  './luxorProposalTerms': { validCalendarDate: () => true, luxorCalendarDate: () => '2099-12-03' },
  './luxorPaymentDashboardModel': { isBookingPaymentMilestone: () => false, isFinalPaymentMilestone: () => false, installmentReminderWindowIsCurrent: () => windowOpen, installmentPaidAmount: () => paid },
})
const job = { id: 'job', booking_id: 'booking', inquiry_id: 'inquiry', recipient_email: 'sample@example.invalid' }
const copy = { ...model.INSTALLMENT_REMINDER_DEFAULTS.installment_7_days_before, body: 'Saved wording for {{first_name}}' }
const metadata = { installment_id: 'installment', milestone: 'installment_7_days_before', installment_copy_snapshot: copy }
test('worker retains the queued wording while refreshing the actual balance', async () => {
  const prior = process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY; process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = 'true'
  try {
    paid = 40; windowOpen = true; patch = null
    const result = await worker.prepareInstallmentPaymentReminder(job, metadata)
    assert.match(result.body, /Saved wording for Sample/); assert.match(result.body, /\$60\.00/)
    assert.deepEqual(result.metadata.installment_copy_snapshot, copy); assert.equal(patch.metadata.balance_due, 60)
    paid = 100; patch = null
    assert.equal(await worker.prepareInstallmentPaymentReminder(job, metadata), null)
    assert.equal(patch.status, 'cancelled'); assert.match(patch.last_error, /already been paid/)
  } finally { if (prior === undefined) delete process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY; else process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = prior }
})
test('worker cancels outside the approved reminder window', async () => {
  const prior = process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY; process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = 'true'
  try { paid = 0; windowOpen = false; patch = null; assert.equal(await worker.prepareInstallmentPaymentReminder(job, metadata), null); assert.match(patch.last_error, /approved date or daytime window/) }
  finally { if (prior === undefined) delete process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY; else process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = prior }
})
