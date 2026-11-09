/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relativePath, filename, stubs = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request]
    const mapped = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : null
    if (mapped) {
      const tsPath = mapped.endsWith('.ts') ? mapped : `${mapped}.ts`
      if (fs.existsSync(tsPath)) return compile(path.relative(root, tsPath), tsPath + '.synthetic.cjs', stubs)
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    loaded._compile(js, filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

const billBalances = compile('src/lib/luxorBillBalances.ts', path.join(root, 'luxor-bill-balances.synthetic.cjs'))
const paymentModel = compile('src/lib/luxorPaymentDashboardModel.ts', path.join(root, 'luxor-payment-dashboard-model.synthetic.cjs'))
const financeStubs = {
  getLuxorFinanceOverview: () => ({
    issues: [],
    unallocatedPayments: 0,
    allocationExceptions: [],
  }),
}
const revenueStubs = {
  getLuxorRevenueCollectionsModel: () => ({
    receivables: [],
    kpis: { outstandingBalance: 0 },
    availability: { outstanding: true },
  }),
}
const booksHealth = compile('src/lib/luxorBooksHealth.ts', path.join(root, 'luxor-books-health.synthetic.cjs'), {
  '@/lib/luxorBillBalances': billBalances,
  '@/lib/luxorFinanceReporting': financeStubs,
  '@/lib/luxorRevenueCollectionsModel': revenueStubs,
  '@/lib/luxorPaymentDashboardModel': paymentModel,
})
const referenceCoa = compile('src/lib/luxorReferenceChartOfAccounts.ts', path.join(root, 'luxor-reference-coa.synthetic.cjs'))

const { buildLuxorBooksHealth, buildReceivableAging, buildPayableAging } = booksHealth
const { suggestReferenceExpenseAccount } = referenceCoa

const emptySets = { testInquiryIds: new Set(), testBookingIds: new Set(), testInvoiceIds: new Set() }

test('clean books health with empty ledgers', () => {
  const health = buildLuxorBooksHealth({
    bookings: [],
    invoices: [],
    payments: [],
    installments: [],
    refunds: [],
    allocations: [],
    expenses: [],
    bills: [],
    ...emptySets,
    expenseExportsVerified: true,
    clientExportsVerified: true,
  })
  assert.equal(health.status, 'clean')
  assert.equal(health.issueCount, 0)
  assert.equal(health.exports.expenseExportsVerified, true)
})

test('receivable aging buckets known balances', () => {
  const today = '2026-11-08'
  const aging = buildReceivableAging([
    { remainingBalance: 100, status: 'overdue', nextPaymentDue: '2026-10-01' },
    { remainingBalance: 50, status: 'upcoming', nextPaymentDue: '2026-12-01' },
    { remainingBalance: null, status: 'needs_review', nextPaymentDue: null },
  ], today)
  assert.ok(aging)
  assert.equal(aging.rowCount, 2)
  assert.ok(aging.d31_60 >= 99)
  assert.ok(aging.current >= 49)
})

test('payable aging ignores unverified bills', () => {
  const today = '2026-11-08'
  const aging = buildPayableAging(
    [{ id: 'b1', amount: 200, amount_state: 'known', currency: 'USD', status: 'unpaid', due_date: '2026-10-01', extraction_status: 'ready', payment_ready_at: '2026-01-01' }],
    [],
    today,
  )
  assert.equal(aging, null)
})

test('suggestReferenceExpenseAccount maps utilities', () => {
  assert.equal(suggestReferenceExpenseAccount('Electric Utilities'), 'Utilities')
})
