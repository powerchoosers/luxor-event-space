'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const repo = path.resolve(__dirname, '..')
const sourcePath = path.join(repo, 'src/lib/luxorFinanceReporting.ts')
const originalLoad = Module._load
const dashboardPath = path.join(repo, 'src/lib/luxorPaymentDashboardModel.ts')
const dashboardLoaded = new Module(dashboardPath, module)
dashboardLoaded.filename = dashboardPath
dashboardLoaded.paths = Module._nodeModulePaths(path.dirname(dashboardPath))
dashboardLoaded._compile(ts.transpileModule(require('node:fs').readFileSync(dashboardPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: dashboardPath,
}).outputText, dashboardPath)
const { attachLuxorBookingPaymentTotals } = dashboardLoaded.exports
Module._load = function(request, parent, isMain) {
  if (parent?.filename === sourcePath && request === './luxorAvailability') return {
    isLuxorTestAvailabilityBooking: (booking) => booking.is_test === true || booking.inquiry_id === 'permanent-test' || booking.metadata?.is_test_record === true,
  }
  if (parent?.filename === sourcePath && request === './luxorTestLeadPolicy') return { LUXOR_PERMANENT_TEST_LEAD_ID: 'permanent-test' }
  if (parent?.filename === sourcePath && request === './luxorPaymentDashboardModel') return dashboardLoaded.exports
  return originalLoad.call(this, request, parent, isMain)
}
const compiled = ts.transpileModule(require('node:fs').readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: sourcePath,
}).outputText
const loaded = new Module(sourcePath, module)
loaded.filename = sourcePath
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath))
loaded._compile(compiled, sourcePath)
Module._load = originalLoad
const { getLuxorBusinessFinanceRows, getLuxorBusinessInquiries, getLuxorInvoiceFinancialSummary, getLuxorRecordedFinanceExpenses } = loaded.exports

const invoice = (id, extra = {}) => ({ id, invoice_kind: 'event', proposal_accepted_at: '2026-01-01T00:00:00Z', total: 1000, status: 'overdue', booking_id: 'booking', ...extra })
const installment = (id, amount, due_at, extra = {}) => ({ id, booking_id: 'booking', invoice_id: 'master', inquiry_id: null, label: id, installment_order: 1, amount, due_at, status: 'scheduled', metadata: {}, ...extra })
const payment = (id, amount, metadata = {}, extra = {}) => ({ id, amount, status: 'paid', paid_at: null, invoice_id: 'master', inquiry_id: null, booking_id: 'booking', metadata, ...extra })

test('verified business row scope closes over orphan test bookings and explicit test expenses', () => {
  const rows = getLuxorBusinessFinanceRows({
    invoices: [invoice('test-invoice', { booking_id: 'orphan-test-booking' })],
    bookings: [{ id: 'orphan-test-booking', inquiry_id: null, metadata: { is_test_record: true } }, { id: 'live-booking', inquiry_id: null, metadata: {} }],
    expenses: [{ id: 'test-expense', booking_id: null, metadata: { is_test_record: true } }, { id: 'live-expense', booking_id: null, metadata: {} }],
    testInquiryIds: new Set(), testBookingIds: new Set(),
  })
  assert.deepEqual(rows.testBookingIds, new Set(['orphan-test-booking']))
  assert.deepEqual(rows.invoices, [])
  assert.deepEqual(rows.bookings.map((row) => row.id), ['live-booking'])
  assert.deepEqual(rows.expenses.map((row) => row.id), ['live-expense'])
})

test('payment linked only to a locally flagged test booking is excluded from ledger and allocation', () => {
  const rows = getLuxorBusinessFinanceRows({ invoices: [invoice('master', { booking_id: 'orphan-test-booking' })], bookings: [{ id: 'orphan-test-booking', inquiry_id: null, metadata: { is_test_record: true } }], expenses: [], testInquiryIds: new Set(), testBookingIds: new Set() })
  const summary = getLuxorInvoiceFinancialSummary(rows.invoices, [payment('test-payment', 100, {}, { booking_id: 'orphan-test-booking' })], rows.testInquiryIds, rows.testBookingIds)
  assert.equal(summary.knownPaidCashTotal, 0)
  assert.equal(summary.unallocatedPayments, 0)
})

test('test invoice exclusion IDs survive prefiltering and exclude invoice-only linked payments', () => {
  const testInvoice = invoice('test-master', { proposal_context: { is_test_record: true } })
  const rows = getLuxorBusinessFinanceRows({ invoices: [testInvoice], bookings: [], expenses: [], testInquiryIds: new Set(), testBookingIds: new Set() })
  assert.deepEqual(rows.invoices, [])
  assert.deepEqual(rows.testInvoiceIds, new Set(['test-master']))
  const summary = getLuxorInvoiceFinancialSummary([testInvoice], [payment('invoice-only-test-payment', 100, {}, { invoice_id: 'test-master', booking_id: null })], new Set(), new Set(), [], new Date(), rows.testInvoiceIds)
  assert.equal(summary.knownPaidCashTotal, 0)
  assert.equal(summary.unallocatedPayments, 0)
})

test('test invoice lineage excludes unflagged multi-level descendants and their invoice-only payments', () => {
  const testMaster = invoice('test-master', { proposal_context: { is_test_record: true } })
  const child = invoice('test-child', { parent_invoice_id: 'test-master', invoice_kind: 'deposit', proposal_context: {} })
  const grandchild = invoice('test-grandchild', { parent_invoice_id: 'test-child', invoice_kind: 'final_balance', proposal_context: {} })
  const liveMaster = invoice('live-master', { booking_id: 'live-booking' })
  const liveChild = invoice('live-child', { parent_invoice_id: 'live-master', invoice_kind: 'deposit', booking_id: 'live-booking' })
  const invoices = [testMaster, child, grandchild, liveMaster, liveChild]
  const rows = getLuxorBusinessFinanceRows({ invoices, bookings: [], expenses: [], testInquiryIds: new Set(), testBookingIds: new Set() })
  assert.deepEqual(rows.testInvoiceIds, new Set(['test-master', 'test-child', 'test-grandchild']))
  assert.deepEqual(rows.invoices.map((row) => row.id), ['live-master', 'live-child'])
  const summary = getLuxorInvoiceFinancialSummary(invoices, [
    payment('child-receipt', 60, {}, { invoice_id: 'test-child', booking_id: null }),
    payment('grandchild-receipt', 40, {}, { invoice_id: 'test-grandchild', booking_id: null }),
    payment('live-receipt', 25, {}, { invoice_id: 'live-master', booking_id: 'live-booking' }),
  ], new Set(), new Set(), [], new Date(), rows.testInvoiceIds)
  assert.equal(summary.knownPaidCashTotal, 25)
  assert.equal(summary.unallocatedPayments, 0)
})

test('test invoice exclusion follows multilevel child lineage without excluding unrelated descendants', () => {
  const testRoot = invoice('test-root', { proposal_context: { is_test_record: true } })
  const testChild = invoice('test-child', { parent_invoice_id: 'test-root', invoice_kind: 'deposit' })
  const testGrandchild = invoice('test-grandchild', { parent_invoice_id: 'test-child', invoice_kind: 'final_balance' })
  const liveRoot = invoice('live-root', { booking_id: 'live-booking' })
  const liveChild = invoice('live-child', { parent_invoice_id: 'live-root', invoice_kind: 'deposit', booking_id: 'live-booking' })
  const allInvoices = [testRoot, testChild, testGrandchild, liveRoot, liveChild]
  const rows = getLuxorBusinessFinanceRows({ invoices: allInvoices, bookings: [], expenses: [], testInquiryIds: new Set(), testBookingIds: new Set() })
  assert.deepEqual(rows.testInvoiceIds, new Set(['test-root', 'test-child', 'test-grandchild']))
  assert.deepEqual(rows.invoices.map((row) => row.id), ['live-root', 'live-child'])
  const summary = getLuxorInvoiceFinancialSummary(allInvoices, [
    payment('child-test-payment', 60, {}, { invoice_id: 'test-child', booking_id: null }),
    payment('grandchild-test-payment', 40, {}, { invoice_id: 'test-grandchild', booking_id: null }),
    payment('live-payment', 25, {}, { invoice_id: 'live-root', booking_id: 'live-booking' }),
  ], new Set(), new Set(), [], new Date(), rows.testInvoiceIds)
  assert.equal(summary.knownPaidCashTotal, 25)
  assert.equal(summary.unallocatedPayments, 0)
})

test('standalone inquiries with explicit local test flags are excluded without name-based heuristics', () => {
  const inquiries = [
    { id: 'local-flag', full_name: 'Real Guest', is_test: true, metadata: {} },
    { id: 'metadata-flag', full_name: 'Another Guest', is_test: false, metadata: { is_test_record: true } },
    { id: 'same-name-real', full_name: 'Test Guest', is_test: false, metadata: {} },
  ]
  assert.deepEqual(getLuxorBusinessInquiries(inquiries, new Set()).map((inquiry) => inquiry.id), ['same-name-real'])
})

test('cancelled expense rows are excluded from finance and report totals consistently', () => {
  const expenses = [
    { id: 'paid', amount: 125, status: 'paid', booking_id: null, metadata: {} },
    { id: 'cancelled', amount: 800, status: 'cancelled', booking_id: null, metadata: {} },
  ]
  assert.deepEqual(getLuxorRecordedFinanceExpenses(expenses).map((expense) => expense.id), ['paid'])
})

test('strict booking metrics keep the event-page enriched-row contract for non-empty responses', () => {
  const booking = { id: 'event-1', inquiry_id: null, metadata: {}, client_name: 'Guest', status: 'confirmed', event_type: 'Wedding', contract_total: 600, deposit_required: 100 }
  const payments = [{ id: 'receipt-1', booking_id: booking.id, invoice_id: null, inquiry_id: null, amount: 175, status: 'paid', payment_method: 'card', paid_at: '2026-11-01T12:00:00Z', notes: null, metadata: {} }]
  const [row] = attachLuxorBookingPaymentTotals([booking], payments)
  const hasEventPageContract = Object.hasOwn(row, 'inquiry_id') && Object.hasOwn(row, 'metadata')
    && typeof row.id === 'string' && typeof row.client_name === 'string'
    && ['draft', 'tentative', 'confirmed', 'completed', 'cancelled'].includes(row.status)
    && Number.isFinite(Number(row.contract_total)) && Number.isFinite(Number(row.deposit_required))
    && Number.isFinite(Number(row.paid_total)) && Number.isFinite(Number(row.balance_due))
    && Array.isArray(row.payments) && row.payments[0]?.id === 'receipt-1'
  assert.equal(hasEventPageContract, true)
  assert.equal(row.paid_total, 175)
  assert.equal(row.balance_due, 425)
  const routeSource = require('node:fs').readFileSync(path.join(repo, 'src/app/api/bookings/route.ts'), 'utf8')
  assert.match(routeSource, /strictMetrics\s*&&\s*financeRowsOnly[\s\S]*?listLuxorBookings\(1000,\s*true\)/)
  assert.match(routeSource, /listLuxorBookingsWithPayments\(1000,\s*strictMetrics\)/)
  const consumerUrls = [
    require('node:fs').readFileSync(path.join(repo, 'src/app/(portal)/portal/events/page.tsx'), 'utf8'),
    require('node:fs').readFileSync(path.join(repo, 'src/app/(portal)/portal/finances/page.tsx'), 'utf8'),
    require('node:fs').readFileSync(path.join(repo, 'src/app/(portal)/portal/reports/page.tsx'), 'utf8'),
  ]
  assert.ok(consumerUrls[0].includes("fetch('/api/bookings?strictMetrics=1')"))
  assert.ok(consumerUrls[1].includes('strictMetrics=1&financeRowsOnly=1'))
  assert.ok(consumerUrls[2].includes('strictMetrics=1&financeRowsOnly=1'))
})

test('overdue receivable is only the overdue installment remainder after saved payment allocations', () => {
  const due = installment('due', 500, '2026-11-01', { metadata: { payment_bucket: 'event' } })
  const future = installment('future', 400, '2026-12-01', { metadata: { payment_bucket: 'event' } })
  const partial = payment('partial', 200, { installment_allocations: [{ installment_id: 'due', amount: 200 }] })
  const summary = getLuxorInvoiceFinancialSummary([invoice('master')], [partial], new Set(), new Set(), [due, future], new Date('2026-11-02T18:00:00.000Z'))
  assert.equal(summary.overdueEventReceivable, 300)
})

test('overdue installment date uses the America/Chicago calendar boundary', () => {
  const due = installment('due', 500, '2026-11-01', { metadata: { payment_bucket: 'event' } })
  const beforeChicagoMidnight = getLuxorInvoiceFinancialSummary([invoice('master')], [], new Set(), new Set(), [due], new Date('2026-11-02T05:59:00.000Z'))
  const afterChicagoMidnight = getLuxorInvoiceFinancialSummary([invoice('master')], [], new Set(), new Set(), [due], new Date('2026-11-02T06:01:00.000Z'))
  assert.equal(beforeChicagoMidnight.overdueEventReceivable, 0)
  assert.equal(afterChicagoMidnight.overdueEventReceivable, 500)
})

test('master overdue status cannot make the entire balance overdue without a saved overdue installment', () => {
  const summary = getLuxorInvoiceFinancialSummary([invoice('master')], [], new Set(), new Set(), [], new Date('2026-11-02T18:00:00.000Z'))
  const voided = installment('voided', 500, '2026-10-01', { status: 'void' })
  const withVoidedRow = getLuxorInvoiceFinancialSummary([invoice('master')], [], new Set(), new Set(), [voided], new Date('2026-11-02T18:00:00.000Z'))
  assert.equal(summary.overdueEventReceivable, 0)
  assert.equal(withVoidedRow.overdueEventReceivable, 0)
})

test('receipt on a superseded accepted master is credited to its unique replacement', () => {
  const predecessor = invoice('old-master', { proposal_accepted_at: '2025-01-01T00:00:00Z', total: 1000 })
  const replacement = invoice('new-master', { total: 1200, supersedes_invoice_id: 'old-master' })
  const summary = getLuxorInvoiceFinancialSummary([predecessor, replacement], [payment('old-receipt', 200, {}, { invoice_id: 'old-master' })])
  assert.equal(summary.eventPaymentsReceived, 200)
  assert.equal(summary.unallocatedPayments, 0)
  assert.equal(summary.outstandingEventReceivable, 1000)
})

test('payment on a child of a superseded master resolves through its parent chain', () => {
  const predecessor = invoice('old-master', { proposal_accepted_at: '2025-01-01T00:00:00Z', total: 1000 })
  const child = { ...invoice('old-child', { proposal_accepted_at: null, total: 400 }), parent_invoice_id: 'old-master', invoice_kind: 'deposit' }
  const replacement = invoice('new-master', { total: 1200, supersedes_invoice_id: 'old-master' })
  const summary = getLuxorInvoiceFinancialSummary([predecessor, child, replacement], [payment('old-child-receipt', 100, {}, { invoice_id: 'old-child', booking_id: null })])
  assert.equal(summary.eventPaymentsReceived, 100)
  assert.equal(summary.unallocatedPayments, 0)
  assert.equal(summary.outstandingEventReceivable, 1100)
})

test('branching supersession history leaves predecessor payment unallocated', () => {
  const predecessor = invoice('old-master', { proposal_accepted_at: '2025-01-01T00:00:00Z', total: 1000 })
  const replacementA = invoice('new-a', { total: 1200, supersedes_invoice_id: 'old-master' })
  const replacementB = invoice('new-b', { total: 1300, supersedes_invoice_id: 'old-master' })
  const summary = getLuxorInvoiceFinancialSummary([predecessor, replacementA, replacementB], [payment('old-receipt', 200, {}, { invoice_id: 'old-master' })])
  assert.equal(summary.unallocatedPayments, 200)
  assert.equal(summary.outstandingEventReceivable, 2500)
})

test('refund-status records remain separate and mark paid-only finance figures unreconciled', () => {
  const refund = payment('refund', 125, {}, { status: 'refunded' })
  const summary = getLuxorInvoiceFinancialSummary([invoice('master')], [payment('original', 500), refund])
  assert.equal(summary.knownPaidCashTotal, 500)
  assert.equal(summary.refundRecordCount, 1)
  assert.equal(summary.refundRecordAmount, 125)
  assert.equal(summary.refundReconciliationRequired, true)
  assert.equal(summary.eventPaymentsReceived, 500)
})
