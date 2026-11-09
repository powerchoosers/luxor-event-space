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
const { getInvoiceCollectionDisplayState, installmentPaidAmount, installmentReminderAutomationKey, installmentReminderMilestone, installmentReminderWindowIsCurrent, isBookingPaymentMilestone, isFinalPaymentMilestone, isLuxorReminderDaytime, paidOnInvoice, paymentDisplayReceivedDate, paymentReminderJobsForEvent } = loaded.exports

const bookingPayment = { id: 'booking-row', label: 'Booking Payment', installment_order: 1, amount: 750, status: 'paid', metadata: {}, due_at: '2026-11-01', paid_at: '2026-11-01' }
const monthly = { id: 'monthly-row', label: 'Payment 2 — Venue Services', installment_order: 2, amount: 750, status: 'scheduled', metadata: {}, due_at: '2026-12-01', paid_at: null }
const payment = (id, invoiceId, amount, metadata = {}) => ({ id, invoice_id: invoiceId, amount, status: 'paid', metadata })

test('booking payment schedule row is not repeated in monthly milestones', () => {
  assert.equal(isBookingPaymentMilestone(bookingPayment), true)
  assert.equal(isBookingPaymentMilestone(monthly), false)
})

test('invoice collection state is shared, keeps stored lifecycle separate, and uses saved overdue remainder', () => {
  const acceptedMaster = {
    id: 'accepted-master', status: 'sent', invoice_kind: 'event', proposal_accepted_at: '2026-10-01T12:00:00Z',
    total: 1961.49, line_items: [], due_date: '2026-12-01', payment_requested_at: '2026-10-01T12:00:00Z',
  }
  const depositChild = { id: 'deposit-child', status: 'sent', invoice_kind: 'deposit', parent_invoice_id: acceptedMaster.id, total: 500 }
  const invoices = [acceptedMaster, depositChild]
  const payment = {
    id: 'receipt-500', invoice_id: depositChild.id, amount: 500, status: 'paid',
    metadata: { installment_allocations: [{ installment_id: 'booking-installment', amount: 500 }] },
  }
  const installment = {
    id: 'booking-installment', invoice_id: acceptedMaster.id, booking_id: 'booking', label: 'Booking Payment',
    installment_order: 1, amount: 1000, status: 'scheduled', due_at: '2026-10-13T12:00:00Z', metadata: {},
  }
  const now = new Date('2026-11-02T18:00:00Z')
  const booking = { status: 'confirmed', contract_status: 'signed', contract_signed_at: '2026-10-01T12:00:00Z' }
  const invoiceScreen = getInvoiceCollectionDisplayState(acceptedMaster, invoices, [payment], [installment], now, undefined, booking)
  const leadPaymentsScreen = getInvoiceCollectionDisplayState(acceptedMaster, invoices, [payment], [installment], now, undefined, booking)

  assert.equal(acceptedMaster.status, 'sent')
  assert.equal(invoiceScreen.collectionStatus, 'Overdue')
  assert.deepEqual(leadPaymentsScreen, invoiceScreen)
  assert.equal(invoiceScreen.paidAmount, 500)
  assert.equal(invoiceScreen.totalDue, 1961.49)
  assert.equal(invoiceScreen.balanceDue, 1461.49)
})

test('draft, cancelled, unaccepted, and superseded invoices do not create collection obligations', () => {
  const draft = { id: 'draft', status: 'draft', invoice_kind: 'event', total: 1000 }
  const cancelled = { id: 'cancelled', status: 'cancelled', invoice_kind: 'event', total: 1000, proposal_accepted_at: '2026-10-01' }
  const unaccepted = { id: 'unaccepted', status: 'sent', invoice_kind: 'event', total: 1000 }
  const prior = { id: 'prior', status: 'sent', invoice_kind: 'event', total: 1000, proposal_accepted_at: '2026-10-01' }
  const replacement = { id: 'replacement', status: 'sent', invoice_kind: 'event', total: 1100, proposal_accepted_at: '2026-10-02', supersedes_invoice_id: prior.id }
  assert.equal(getInvoiceCollectionDisplayState(draft, [draft], [], [], new Date('2026-11-02T18:00:00Z')).collectionStatus, null)
  assert.equal(getInvoiceCollectionDisplayState(cancelled, [cancelled], [], [], new Date('2026-11-02T18:00:00Z')).collectionStatus, null)
  assert.equal(getInvoiceCollectionDisplayState(unaccepted, [unaccepted], [], [], new Date('2026-11-02T18:00:00Z')).collectionStatus, null)
  assert.equal(getInvoiceCollectionDisplayState(prior, [prior, replacement], [], [], new Date('2026-11-02T18:00:00Z')).collectionStatus, null)
})

test('Invoices and Lead Payments both render lifecycle and collection labels through the shared model', () => {
  const invoicesPage = fs.readFileSync(path.join(repo, 'src/app/(portal)/portal/invoices/page.tsx'), 'utf8')
  const leadPaymentsPage = fs.readFileSync(path.join(repo, 'src/components/portal/LeadPaymentsDashboard.tsx'), 'utf8')
  for (const source of [invoicesPage, leadPaymentsPage]) {
    assert.match(source, /getInvoiceCollectionDisplayState/)
    assert.match(source, /Stored lifecycle/)
    assert.match(source, /Collection:/)
  }
})

test('payment display received date prefers corrected date-only value and falls back to paid or created timestamp', () => {
  const corrected = { received_date: '2026-10-31', paid_at: '2026-11-01T12:00:00Z', created_at: '2026-11-02T12:00:00Z' }
  assert.equal(paymentDisplayReceivedDate(corrected), '2026-10-31')
  assert.equal(paymentDisplayReceivedDate({ received_date: null, paid_at: '2026-11-01T12:00:00Z', created_at: '2026-11-02T12:00:00Z' }), '2026-11-01T12:00:00Z')
  assert.equal(paymentDisplayReceivedDate({ received_date: null, paid_at: null, created_at: '2026-11-02T12:00:00Z' }), '2026-11-02T12:00:00Z')
  assert.equal(paymentDisplayReceivedDate(corrected, '2026-10-30'), '2026-10-30')
  const source = fs.readFileSync(path.join(repo, 'src/components/portal/LeadPaymentsDashboard.tsx'), 'utf8')
  assert.match(source, /Received \$\{formatDate\(displayReceivedDate\(lastDeposit\)\)\}/)
})

test('final payment installment remains on the existing final-balance reminder cadence', () => {
  assert.equal(isFinalPaymentMilestone({ id: 'final-row', label: 'Final Payment', installment_order: 9, amount: 3000, status: 'scheduled', metadata: {} }), true)
  assert.equal(isFinalPaymentMilestone(monthly), false)
})

test('installment reminders use only the confirmed dates and daytime sending window', () => {
  assert.equal(installmentReminderMilestone('2026-12-08', '2026-12-01'), 'installment_7_days_before')
  assert.equal(installmentReminderMilestone('2026-12-08', '2026-12-09'), 'installment_1_day_overdue')
  assert.equal(installmentReminderMilestone('2026-12-08', '2026-12-08'), null)
  assert.equal(installmentReminderMilestone('2026-12-08', '2026-12-10'), null)
  assert.equal(installmentReminderMilestone('bad-date', '2026-12-01'), null)
  assert.equal(isLuxorReminderDaytime(new Date('2026-12-01T16:00:00.000Z')), true)
  assert.equal(isLuxorReminderDaytime(new Date('2026-07-01T15:00:00.000Z')), true)
  assert.equal(isLuxorReminderDaytime(new Date('2026-12-01T17:00:00.000Z')), false)
  assert.equal(installmentReminderWindowIsCurrent('2026-12-08', '2026-12-01', 'installment_7_days_before', new Date('2026-12-01T16:00:00.000Z')), true)
  assert.equal(installmentReminderWindowIsCurrent('2026-12-09', '2026-12-01', 'installment_7_days_before', new Date('2026-12-01T16:00:00.000Z')), false)
  assert.equal(installmentReminderWindowIsCurrent('2026-12-08', '2026-12-02', 'installment_7_days_before', new Date('2026-12-02T17:00:00.000Z')), false)
  assert.notEqual(installmentReminderAutomationKey('booking', 'installment', '2026-12-08', 'installment_7_days_before'), installmentReminderAutomationKey('booking', 'installment', '2026-12-09', 'installment_7_days_before'))
})

test('installment paid amount reconciles allocation and canonical legacy status', () => {
  assert.equal(installmentPaidAmount(monthly, [payment('p1', 'master', 250, { installment_allocations: [{ installment_id: monthly.id, amount: 250 }] })]), 250)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'paid', paid_at: '2026-11-01' }, []), 750)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'partial' }, []), 0)
  assert.equal(installmentPaidAmount({ ...monthly, status: 'partial', metadata: { paid_amount: 125 } }, []), 125)
  assert.equal(installmentPaidAmount(monthly, [{ ...payment('pending', 'master', 750, { installment_allocations: [{ installment_id: monthly.id, amount: 750 }] }), status: 'pending' }]), 0)
})

test('frozen legacy balance adds to new allocations without double counting', () => {
  const legacyPartial = { ...monthly, status: 'partial', metadata: { paid_amount: 250, installment_allocation_legacy_baseline: 250 } }
  const allocatedPayment = payment('new-payment', 'final', 250, { installment_allocations: [{ installment_id: monthly.id, amount: 250 }] })
  assert.equal(installmentPaidAmount(legacyPartial, [allocatedPayment]), 500)
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
    job('installment', 'installment_payment_reminder', 'booking-1', 'invoice-1'),
    job('same-invoice', 'unpaid_invoice_reminder', null, 'invoice-1'),
    job('other-event', 'final_payment_reminder', 'booking-2', 'invoice-2'),
    job('tour', 'tour_reminder', 'booking-1', 'invoice-1'),
  ], 'booking-1', new Set(['invoice-1']))
  assert.deepEqual(rows.map((row) => row.id).sort(), ['installment', 'same-booking', 'same-invoice'])
})
