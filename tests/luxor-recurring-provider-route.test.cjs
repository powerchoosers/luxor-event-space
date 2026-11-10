/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function routeFixture() {
  const filename = path.resolve('src/app/api/expenses/templates/[id]/route.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { current: { id: 'template', vendor_id: null, vendor_name: 'Previous name', is_active: true, updated_at: '2026-11-09T12:00:00Z' }, writes: [], generated: 0 }
  class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  class RestError extends Error {}
  const stubs = {
    '@/lib/supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (url, options) => {
      if (url.startsWith('luxor_vendors')) return [{ id: 'provider', name: 'Utility', archived_at: null }]
      if (options?.method === 'PATCH') { state.writes.push({ url, body: JSON.parse(options.body) }); return [{ ...state.current, ...JSON.parse(options.body) }] }
      return [state.current]
    } },
    '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => ({ session: { email: 'owner@example.invalid' } }), generateLuxorExpenseOccurrences: async () => { state.generated++; return { inserted: 1 } }, isExpenseUuid: (value) => typeof value === 'string' && Boolean(value), LuxorExpenseRequestError: RequestError, toExpenseErrorResponse: (error) => ({ status: error.status || 500, message: error.message }) },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(compiled, filename) } finally { Module._load = original }
  return { PATCH: loaded.exports.PATCH, state }
}

function request(body) { return new Request('http://localhost/api/expenses/templates/template', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
const context = { params: Promise.resolve({ id: 'template' }) }

test('linking a reviewed schedule fences its version and does not generate expenses', async () => {
  const { PATCH, state } = routeFixture()
  const response = await PATCH(request({ vendor_id: 'provider', expected_updated_at: state.current.updated_at }), context)
  assert.equal(response.status, 200)
  assert.equal(state.generated, 0)
  assert.equal(state.writes.length, 1)
  assert.match(state.writes[0].url, /vendor_id=is\.null/)
  assert.match(state.writes[0].url, /updated_at=eq\./)
  assert.equal(state.writes[0].body.vendor_id, 'provider')
  assert.equal(state.writes[0].body.vendor_name, 'Utility')
})

test('stale schedule links and provider reassignment fail before writing', async () => {
  const { PATCH, state } = routeFixture()
  assert.equal((await PATCH(request({ vendor_id: 'provider', expected_updated_at: 'stale' }), context)).status, 409)
  state.current.vendor_id = 'other-provider'
  assert.equal((await PATCH(request({ vendor_id: 'provider' }), context)).status, 409)
  assert.equal(state.writes.length, 0)
  assert.equal(state.generated, 0)
})

test('a confirmed provider correction is fenced to the reviewed schedule', async () => {
  const { PATCH, state } = routeFixture()
  state.current.vendor_id = 'other-provider'
  const response = await PATCH(request({ vendor_id: 'provider', expected_updated_at: state.current.updated_at, confirm_provider_change: true }), context)
  assert.equal(response.status, 200)
  assert.match(state.writes[0].url, /vendor_id=eq\.other-provider/)
  assert.match(state.writes[0].url, /updated_at=eq\./)
  assert.equal(state.generated, 0)
})

function occurrenceFixture() {
  const filename = path.resolve('src/app/api/expenses/[id]/route.ts')
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { expense: { id: 'occurrence', updated_at: '2026-11-09T12:00:00Z', amount: 0, status: 'planned', paid_amount: null, source_bill_id: null, recurring_template_id: 'template', payments: [], metadata: { amount_state: 'variable' } }, bill: { extraction_status: 'ready', payment_ready_at: '2026-11-09T12:00:00Z', status: 'unpaid', amount_state: 'known', currency: 'USD', amount: 125 }, writes: [] }
  class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  class RestError extends Error {}
  const stubs = {
    '@/lib/supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (url, options) => { state.writes.push({ url, body: JSON.parse(options.body) }); return {} } },
    '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => ({ session: { email: 'owner@example.invalid' } }), getExpenseRecordWithHistory: async () => state.expense, validateExpenseBill: async () => state.bill, findExpenseBySourceBill: async () => null, isExpenseUuid: (value) => typeof value === 'string' && Boolean(value), isDateKey: (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value), LuxorExpenseRequestError: RequestError, toExpenseErrorResponse: (error) => ({ status: error.status || 500, message: error.message }) },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(compiled, filename) } finally { Module._load = original }
  return { PATCH: loaded.exports.PATCH, state }
}
function matchRequest(body) { return new Request('http://localhost/api/expenses/occurrence', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
const occurrenceContext = { params: Promise.resolve({ id: 'occurrence' }) }

test('matching an unknown period records reviewed amount on the existing expense', async () => {
  const { PATCH, state } = occurrenceFixture()
  const response = await PATCH(matchRequest({ source_bill_id: 'bill', confirm_source_bill: true, expected_updated_at: state.expense.updated_at, amount: 125, due_date: '2026-11-15' }), occurrenceContext)
  assert.equal(response.status, 200)
  assert.equal(state.writes.length, 1)
  const update = state.writes[0].body
  assert.equal(state.writes[0].url, 'rpc/luxor_update_expense_safely')
  assert.equal(update.p_expense_id, 'occurrence')
  assert.equal(update.p_changes.source_bill_id, 'bill')
  assert.equal(update.p_changes.amount, 125)
  assert.equal(update.p_changes.metadata.amount_confirmation_source, 'reviewed_source_bill')
  assert.equal(update.p_changes.status, 'incurred')
})

test('matching rejects stale periods, existing payments, and an unreviewed bill', async () => {
  const { PATCH, state } = occurrenceFixture()
  const body = { source_bill_id: 'bill', confirm_source_bill: true, expected_updated_at: 'stale', amount: 125 }
  assert.equal((await PATCH(matchRequest(body), occurrenceContext)).status, 409)
  body.expected_updated_at = state.expense.updated_at
  state.expense.payments = [{ id: 'payment' }]
  assert.equal((await PATCH(matchRequest(body), occurrenceContext)).status, 409)
  state.expense.payments = []
  state.bill.payment_ready_at = null
  assert.equal((await PATCH(matchRequest(body), occurrenceContext)).status, 400)
  assert.equal(state.writes.length, 0)
})

function reconciliationFixture() {
  const filename = path.resolve('src/app/api/expenses/reconcile-bill/route.ts')
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { operations: true, writes: [] }
  class RestError extends Error {}
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.operations ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => ({ session: { email: 'owner@example.invalid' } }), isExpenseUuid: (value) => typeof value === 'string' && Boolean(value), toExpenseErrorResponse: () => ({ status: 500, message: 'Unavailable' }) },
    '@/lib/supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (url, options) => { state.writes.push({ url, body: JSON.parse(options.body) }); return { replayed: false } } },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(compiled, filename) } finally { Module._load = original }
  return { POST: loaded.exports.POST, state }
}
function reconcileRequest(body) { return new Request('http://localhost/api/expenses/reconcile-bill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
test('reconciliation requires explicit confirmation and operations access', async () => {
  const { POST, state } = reconciliationFixture()
  const body = { bill_id: 'bill', occurrence_id: 'period', expense_id: 'expense', occurrence_updated_at: '2026-11-09T12:00:00Z', expense_updated_at: '2026-11-09T12:00:00Z', confirmed: false }
  assert.equal((await POST(reconcileRequest(body))).status, 400)
  body.confirmed = true; state.operations = false
  assert.equal((await POST(reconcileRequest(body))).status, 403)
  state.operations = true
  assert.equal((await POST(reconcileRequest(body))).status, 200)
  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].url, 'rpc/luxor_reconcile_bill_occurrence')
  assert.equal(state.writes[0].body.p_actor, 'owner@example.invalid')
  assert.equal(state.writes[0].body.p_bill_expense_id, 'expense')
})
