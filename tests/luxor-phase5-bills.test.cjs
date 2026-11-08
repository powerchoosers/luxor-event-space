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
    if (mapped && fs.existsSync(mapped + (mapped.endsWith('.ts') ? '' : '.ts'))) {
      return compile(path.relative(root, mapped), mapped + '.synthetic.cjs', stubs)
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

const categories = compile('src/lib/luxorBillCategories.ts', path.join(root, 'luxor-bill-categories.synthetic.cjs'))
const { parseManualBillCreate, manualBillFingerprint } = compile('src/lib/luxorManualBillCreate.ts', path.join(root, 'luxor-manual-bill.synthetic.cjs'), {
  '@/lib/luxorBillCategories': categories,
})
const { expenseAmountState } = compile('src/lib/luxorExpenseAmount.ts', path.join(root, 'luxor-expense-amount.synthetic.cjs'))
const { getBillBalance } = compile('src/lib/luxorBillBalances.ts', path.join(root, 'luxor-bill-balances.synthetic.cjs'))
class SupabaseRestError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}
const { postgrestSchemaUnavailable } = compile('src/lib/luxorPostgrestSchema.ts', path.join(root, 'luxor-postgrest-schema.synthetic.cjs'), {
  '@/lib/supabaseRestServer': { SupabaseRestError },
})

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('schema probe treats postgres missing-column errors as unavailable', () => {
  assert.equal(postgrestSchemaUnavailable(new SupabaseRestError('column luxor_vendors.contact_person does not exist', 400, '42703')), true)
  assert.equal(postgrestSchemaUnavailable(new SupabaseRestError('Could not find the table', 404, 'PGRST205')), true)
  assert.equal(postgrestSchemaUnavailable(new Error('network')), false)
})

test('manual bill save fingerprint is stable for the same request', () => {
  const body = {
    client_request_id: requestId,
    service: 'Electric',
    provider: 'TXU',
    bill_category: 'Utilities',
    amount_state: 'unknown',
    due_date: '2026-11-15',
    frequency: 'Monthly',
  }
  const first = parseManualBillCreate(body)
  const second = parseManualBillCreate(body)
  assert.equal(first.fingerprint, second.fingerprint)
  assert.equal(first.draft.amountState, 'unknown')
  assert.equal(first.draft.amountCents, null)
})

test('manual bill fingerprint changes when details change', () => {
  const base = {
    client_request_id: requestId,
    service: 'Electric',
    provider: 'TXU',
    bill_category: 'Utilities',
    amount_state: 'known',
    amount: 19.99,
    due_date: '2026-11-15',
    frequency: 'One-time',
  }
  const first = parseManualBillCreate(base)
  const second = parseManualBillCreate({ ...base, amount: 20 })
  assert.notEqual(first.fingerprint, second.fingerprint)
  assert.equal(manualBillFingerprint(first.draft), first.fingerprint)
})

test('unknown and variable amounts are not treated as known money', () => {
  assert.equal(expenseAmountState(0, { amount_state: 'unknown' }).known, false)
  assert.equal(expenseAmountState(0, { amount_state: 'variable' }).known, false)
  assert.equal(expenseAmountState(19.99, { amount_state: 'known' }).known, true)
})

test('unknown bill amount does not certify an original balance', () => {
  const bill = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    amount: 0,
    amount_state: 'unknown',
    currency: 'USD',
    due_date: '2026-11-01',
    extraction_status: 'ready',
    payment_ready_at: '2026-11-01T00:00:00Z',
    status: 'unpaid',
  }
  const expense = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    source_bill_id: bill.id,
    amount: 40,
    paid_amount: 0,
    remaining_balance: 40,
    status: 'incurred',
    due_date: '2026-11-01',
    payments: [],
    metadata: {},
  }
  const balance = getBillBalance(bill, [expense])
  assert.equal(balance.original, null)
  assert.equal(balance.remaining, null)
  assert.match(balance.reason || '', /amount/i)
})

test('invalid payment dates do not certify a balance', () => {
  const bill = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    amount: 40,
    amount_state: 'known',
    currency: 'USD',
    due_date: '2026-11-01',
    extraction_status: 'ready',
    payment_ready_at: '2026-11-01T00:00:00Z',
    status: 'partially_paid',
  }
  const expense = {
    id: '10101010-1010-4101-8101-101010101010',
    source_bill_id: bill.id,
    amount: 40,
    paid_amount: 20,
    remaining_balance: 20,
    status: 'incurred',
    due_date: '2026-11-01',
    payments: [{ id: '20202020-2020-4202-8202-202020202020', amount: 20, payment_date: '2026-02-31', payment_method: 'Bank Transfer', transaction_type: 'payment' }],
    metadata: {},
  }
  const balance = getBillBalance(bill, [expense])
  assert.equal(balance.remaining, null)
  assert.match(balance.reason || '', /payment history/i)
})

test('paid bill without payment lines does not certify a balance', () => {
  const bill = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    amount: 40,
    amount_state: 'known',
    currency: 'USD',
    due_date: '2026-11-01',
    extraction_status: 'ready',
    payment_ready_at: '2026-11-01T00:00:00Z',
    status: 'paid',
  }
  const expense = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    source_bill_id: bill.id,
    amount: 40,
    paid_amount: 40,
    remaining_balance: 0,
    status: 'paid',
    due_date: '2026-11-01',
    payments: [],
    metadata: {},
  }
  const balance = getBillBalance(bill, [expense])
  assert.equal(balance.remaining, null)
  assert.match(balance.reason || '', /reconciliation|review|history/i)
})

const { billReminders } = compile('src/lib/luxorBillReminders.ts', path.join(root, 'luxor-bill-reminders.synthetic.cjs'), {
  '@/lib/luxorBillBalances': { getBillBalance: (bill, expenses) => {
    const expense = (expenses || []).find((item) => item.source_bill_id === bill.id)
    if (!expense || expense.remaining_balance == null) return { remaining: null, reason: 'missing' }
    return { remaining: expense.remaining_balance, reason: '' }
  } },
  '@/lib/luxorInquiryTypes': {},
})

const { luxorTimestampIsKnown, luxorTimestampMs } = compile('src/lib/luxorTimestamp.ts', path.join(root, 'luxor-timestamp.synthetic.cjs'))

const vendorDocs = compile('src/lib/luxorVendorDocumentsServer.ts', path.join(root, 'luxor-vendor-docs.synthetic.cjs'), {
  'server-only': {},
  '@/lib/luxorOperationsAccess': {},
  '@/lib/luxorPortalAccess': {},
  '@/lib/luxorExpensesServer': { getLuxorExpenseStorageConfig: () => ({}) },
})

test('vendor storage treats supabase missing-object 400 as absent', async () => {
  const missing = new Response(JSON.stringify({ message: 'Object not found' }), { status: 400 })
  assert.equal(await vendorDocs.vendorStorageObjectMissing(missing), true)
  assert.equal(await vendorDocs.vendorStorageObjectMissing(new Response('', { status: 404 })), true)
  assert.equal(await vendorDocs.vendorStorageObjectMissing(new Response('', { status: 200 })), false)
})

test('postgrest updated_at strings parse for optimistic concurrency', () => {
  assert.equal(luxorTimestampIsKnown('2026-07-29T02:27:20.733Z'), true)
  assert.ok(luxorTimestampMs('2026-07-29 02:27:20.733+00'))
  assert.equal(luxorTimestampIsKnown('not-a-date'), false)
})

test('bill reminders omit bills without verified positive balance', () => {
  const bills = [
    { id: 'a', due_date: '2026-11-15', status: 'approved', extraction_status: 'ready', duplicate_of_bill_id: null },
    { id: 'b', due_date: '2026-11-15', status: 'approved', extraction_status: 'ready', duplicate_of_bill_id: null },
  ]
  const expenses = [
    { id: '1', source_bill_id: 'a', remaining_balance: 50, payments: [{ id: 'p1', amount: 10, payment_date: '2026-11-01', transaction_type: 'payment' }] },
    { id: '2', source_bill_id: 'b', remaining_balance: null, payments: [] },
  ]
  const prefs = [{ bill_id: 'a', seven_days: true, three_days: false, due_day: false, overdue: false }]
  const hits = billReminders(bills, expenses, prefs, '2026-11-10')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].bill.id, 'a')
})
