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
const expensePath = path.join(repo, 'src/lib/luxorExpenseAmount.ts')
const expenseLoaded = new Module(expensePath, module)
expenseLoaded.filename = expensePath
expenseLoaded._compile(ts.transpileModule(require('node:fs').readFileSync(expensePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: expensePath }).outputText, expensePath)
const dashboardPath = path.join(repo, 'src/lib/luxorPaymentDashboardModel.ts')
const dashboardLoaded = new Module(dashboardPath, module)
dashboardLoaded.filename = dashboardPath
dashboardLoaded.paths = Module._nodeModulePaths(path.dirname(dashboardPath))
dashboardLoaded._compile(ts.transpileModule(require('node:fs').readFileSync(dashboardPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: dashboardPath,
}).outputText, dashboardPath)
const { attachLuxorBookingPaymentTotals, getInvoiceCollectionDisplayState } = dashboardLoaded.exports
Module._load = function(request, parent, isMain) {
  if (parent?.filename === sourcePath && request === './luxorExpenseAmount') return expenseLoaded.exports
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
const revenuePath = path.join(repo, 'src/lib/luxorRevenueCollectionsModel.ts')
const revenueLoaded = new Module(revenuePath, module)
revenueLoaded.filename = revenuePath
revenueLoaded.paths = Module._nodeModulePaths(path.dirname(revenuePath))
Module._load = function(request, parent, isMain) {
  if (parent?.filename === revenuePath && request === './luxorFinanceReporting') return loaded.exports
  if (parent?.filename === revenuePath && request === './luxorPaymentDashboardModel') return dashboardLoaded.exports
  return originalLoad.call(this, request, parent, isMain)
}
revenueLoaded._compile(ts.transpileModule(require('node:fs').readFileSync(revenuePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: revenuePath,
}).outputText, revenuePath)
Module._load = originalLoad
const { getLuxorBusinessFinanceRows, getLuxorBusinessInquiries, getLuxorFinanceOverview, getLuxorInvoiceFinancialSummary, getLuxorRecordedFinanceExpenses, inspectLuxorFinanceOverviewSources } = loaded.exports
const { getLuxorRevenueCollectionsModel } = revenueLoaded.exports

const invoice = (id, extra = {}) => ({ id, invoice_kind: 'event', proposal_accepted_at: '2026-01-01T00:00:00Z', total: 1000, status: 'overdue', booking_id: 'booking', ...extra })
const installment = (id, amount, due_at, extra = {}) => ({ id, booking_id: 'booking', invoice_id: 'master', inquiry_id: null, label: id, installment_order: 1, amount, due_at, status: 'scheduled', metadata: {}, ...extra })
const payment = (id, amount, metadata = {}, extra = {}) => ({ id, amount, status: 'paid', paid_at: null, invoice_id: 'master', inquiry_id: null, booking_id: 'booking', metadata, ...extra })

test('corrected manual receipts retain allocations without inflating collections', () => {
  const row = installment('monthly', 500, '2026-11-30', { installment_order: 2, metadata: { installment_allocation_legacy_baseline: 0, paid_amount: 0 } })
  const receipt = payment('corrected', 500, { manual_correction: true, installment_allocations: [{ installment_id: 'monthly', amount: 500 }] }, { status: 'void' })
  const input = { invoices: [invoice('master')], installments: [row], payments: [receipt], allocations: [{ payment_id: 'corrected', installment_id: 'monthly', amount: 500 }] }
  assert.deepEqual(inspectLuxorFinanceOverviewSources(input).issues, [])
  assert.equal(dashboardLoaded.exports.installmentPaidAmount(row, [receipt]), 0)
  const unverified = { ...input, payments: [{ ...receipt, metadata: {} }] }
  assert.ok(inspectLuxorFinanceOverviewSources(unverified).issues.includes('Invalid allocation table row'))
})

