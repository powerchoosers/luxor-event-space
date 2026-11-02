'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const repo = path.resolve(__dirname, '..')
const sourcePath = path.join(repo, 'src/lib/luxorPaymentDashboardModel.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: sourcePath,
}).outputText
const loaded = new Module(sourcePath, module)
loaded.filename = sourcePath
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath))
loaded._compile(compiled, sourcePath)
const { installmentPaidAmount, isBookingPaymentMilestone, paidOnInvoice, paymentReminderJobsForEvent } = loaded.exports

const bookingPayment = { id: 'booking-row', label: 'Booking Payment', installment_order: 1, amount: 750, status: 'paid', metadata: {}, due_at: '2026-11-01', paid_at: '2026-11-01' }
const monthly = { id: 'monthly-row', label: 'Payment 2 — Venue Services', installment_order: 2, amount: 750, status: 'scheduled', metadata: {}, due_at: '2026-12-01', paid_at: null }
const payment = (id, invoiceId, amount, metadata = {}) => ({ id, invoice_id: invoiceId, amount, status: 'paid', metadata })

test('booking payment schedule row is not repeated in monthly milestones', () => {
  assert.equal(isBookingPaymentMilestone(bookingPayment), true)
  assert.equal(isBookingPaymentMilestone(monthly), false)
})

test('installment paid amount reconciles allocation and canonical legacy status', () => {
  assert.equal(installmentPaidAmount(monthly, [payment('p1', 'master', 250, { installment_allocations: [{ installment_id: monthly.id, amount: 250 }] })]), 250)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'paid', paid_at: '2026-11-01' }, []), 750)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'partial' }, []), 0)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'partial', metadata: { paid_amount: 125 } }, []), 125)
  assert.equal(installmentPaidAmount(monthly, [{ ...payment('pending', 'master', 750, { installment_allocations: [{ installment_id: monthly.id, amount: 750 }] }), status: 'pending' }]), 0)
})

test('master event invoice rolls up paid child invoices but excludes refundable security deposit', () => {
  const master = { id: 'master', invoice_kind: 'event', total: 4000 }
  const deposit = { id: 'deposit', parent_invoice_id: 'master', invoice_kind: 'deposit', total: 1000 }
  const finalBalance = { id: 'final', parent_invoice_id: 'master', invoice_kind: 'final_balance', total: 3000 }
  const security = { id: 'security', parent_invoice_id: 'master', invoice_kind: 'security_deposit', total: 750 }
  const payments = [payment('p0', 'master', 500), payment('p1', 'deposit', 1000), payment('p2', 'final', 200), payment('p3', 'security', 750)]
  assert.equal(paidOnInvoice(master, [master, deposit, finalBalance, security], payments), 1700)
  assert.equal(paidOnInvoice(finalBalance, [master, deposit, finalBalance, security], payments), 200)
})

test('legacy combined booking receipt credits only its event-payment portion to the master invoice', () => {
  const master = { id: 'legacy-master', invoice_kind: 'event', total: 5000 }
  const deposit = { id: 'legacy-deposit', parent_invoice_id: master.id, invoice_kind: 'deposit', total: 1750 }
  const combinedReceipt = payment('legacy-combined', deposit.id, 1750, { payment_kind: 'deposit', initial_booking_payment: 1000, refundable_security_deposit: 750 })
  assert.equal(paidOnInvoice(master, [master, deposit], [combinedReceipt]), 1000)
})

test('reminder history only includes the selected event and payment reminder kinds', () => {
  const job = (id, type, bookingId, invoiceId) => ({ id, job_type: type, booking_id: bookingId, metadata: { invoice_id: invoiceId } })
  const rows = paymentReminderJobsForEvent([
    job('same-booking', 'final_payment_reminder', 'booking-1', null),
    job('same-invoice', 'unpaid_invoice_reminder', null, 'invoice-1'),
    job('other-event', 'final_payment_reminder', 'booking-2', 'invoice-2'),
    job('tour', 'tour_reminder', 'booking-1', 'invoice-1'),
  ], 'booking-1', new Set(['invoice-1']))
  assert.deepEqual(rows.map((row) => row.id).sort(), ['same-booking', 'same-invoice'])
})
