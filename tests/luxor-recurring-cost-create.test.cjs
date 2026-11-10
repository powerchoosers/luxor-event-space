/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/expenses/templates/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { rows: [], generationFails: false, generationCalls: 0 }
  class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  class RestError extends Error { constructor(code) { super(code); this.code = code } }
  const stubs = {
    '@/lib/supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (url, options) => {
      if (url.startsWith('luxor_vendors?')) return [{ id: '11111111-1111-4111-8111-111111111111', name: 'Sample Water', archived_at: null }]
      if (url.includes('client_request_id=eq.')) { const id = decodeURIComponent(url.split('client_request_id=eq.')[1].split('&')[0]); return state.rows.filter((row) => row.client_request_id === id) }
      if (options?.method === 'POST') { const row = JSON.parse(options.body); if (state.rows.some((item) => item.client_request_id && item.client_request_id === row.client_request_id)) throw new RestError('23505'); row.id = `template-${state.rows.length + 1}`; state.rows.push(row); return [row] }
      throw new Error(`Unexpected query ${url}`)
    } },
    '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => ({ session: { email: 'owner@example.invalid' } }), getLuxorExpenseCategoryByName: async () => ({ id: 'category' }), isExpenseUuid: (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v), isDateKey: (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v), LUXOR_EXPENSE_PAYMENT_METHODS: [], LuxorExpenseRequestError: RequestError, toExpenseErrorResponse: (e) => ({ status: e.status || 500, message: e.message }), generateLuxorExpenseOccurrences: async () => { state.generationCalls++; if (state.generationFails) throw new Error('generator unavailable'); return { inserted: 1 } } },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { POST: loaded.exports.POST, state }
}

test('a standalone recurring cost is saved once and retries preserve request identity', async () => {
  const { POST, state } = fixture()
  const body = { client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Water', category: 'Utilities', vendor_name: 'Sample Water', expected_amount: 75, is_variable: false, frequency: 'monthly', first_due_date: '2026-11-15', start_date: '2026-11-01' }
  const request = (payload) => new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  state.generationFails = true
  const first = await POST(request(body)), firstBody = await first.json()
  assert.equal(first.status, 201)
  assert.equal(firstBody.generation_pending, true)
  assert.equal(state.rows.length, 1)
  assert.equal(state.rows[0].vendor_id, undefined)
  state.generationFails = false
  const retry = await POST(request(body)), retryBody = await retry.json()
  assert.equal(retry.status, 201)
  assert.equal(retryBody.template.id, firstBody.template.id)
  assert.equal(retryBody.generation_pending, false)
  assert.equal(state.rows.length, 1)
  assert.equal((await POST(request({ ...body, expected_amount: 100 }))).status, 409)
  assert.equal(state.rows.length, 1)
})

test('concurrent identical requests resolve to the same recurring cost', async () => {
  const { POST, state } = fixture()
  const body = { client_request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Phone', category: 'Utilities', vendor_name: 'Sample Water', expected_amount: 50, is_variable: false, frequency: 'monthly', first_due_date: '2026-11-15', start_date: '2026-11-01' }
  const request = () => new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const responses = await Promise.all([POST(request()), POST(request())])
  const results = await Promise.all(responses.map((response) => response.json()))
  assert.deepEqual(responses.map((response) => response.status), [201, 201])
  assert.equal(state.rows.length, 1)
  assert.equal(results[0].template.id, results[1].template.id)
})

test('a variable recurring cost keeps the amount unknown until an actual bill arrives', async () => {
  const { POST, state } = fixture()
  const body = { client_request_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Water', category: 'Utilities', is_variable: true, expected_amount: null, frequency: 'monthly', first_due_date: '2026-11-15', start_date: '2026-11-01' }
  const response = await POST(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal(response.status, 201)
  assert.equal(state.rows[0].expected_amount, null)
  assert.equal(state.rows[0].is_variable, true)
  assert.equal(state.rows[0].vendor_id, undefined)
})


test('a new recurring cost cannot be linked to an event vendor', async () => {
  const { POST, state } = fixture()
  const body = { name: 'Water', category: 'Utilities', vendor_id: '11111111-1111-4111-8111-111111111111', expected_amount: 75, is_variable: false, frequency: 'monthly', first_due_date: '2026-11-15', start_date: '2026-11-01' }
  const response = await POST(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal(response.status, 400)
  assert.equal(state.rows.length, 0)
  assert.equal(state.generationCalls, 0)
})
