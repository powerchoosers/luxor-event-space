/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/expenses/templates/[id]/profile/route.ts')
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { profile: null, writes: [], bill: null, summary: null }
  class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  class RestError extends Error {}
  const stubs = {
    '@/lib/supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (url, options = {}) => {
      if (url.startsWith('luxor_expense_templates?')) return [{ id: 'schedule' }]
      if (url === 'rpc/luxor_recurring_profile_valid_summary') return state.summary ? [state.summary] : []
      if (url === 'rpc/luxor_recurring_profile_latest_bill') return state.bill ? [state.bill] : []
      if (url.startsWith('luxor_recurring_cost_profiles?')) {
        if (options.method === 'POST' || options.method === 'PATCH') { const body = JSON.parse(options.body); state.writes.push(body); state.profile = { ...state.profile, ...body }; return [state.profile] }
        return state.profile ? [state.profile] : []
      }
      throw Error(`Unexpected query ${url}`)
    } },
    '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => ({ session: { email: 'owner@example.invalid' } }), isExpenseUuid: value => value === 'schedule', LuxorExpenseRequestError: RequestError, toExpenseErrorResponse: error => ({ status: error.status || 500, message: error.message }) },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(compiled, filename) } finally { Module._load = original }
  return { ...loaded.exports, state }
}
const context = { params: Promise.resolve({ id: 'schedule' }) }
function request(body) { return new Request('http://localhost/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }

test('profile edits reject stale changes and unsafe websites before writing', async () => {
  const { PATCH, state } = fixture()
  state.profile = { updated_at: 'old', phone: '123' }
  assert.equal((await PATCH(request({ expected_updated_at: 'stale', phone: '456' }), context)).status, 409)
  assert.equal((await PATCH(request({ expected_updated_at: 'old', website: 'javascript:alert(1)' }), context)).status, 400)
  assert.equal(state.writes.length, 0)
  assert.equal((await PATCH(request({ expected_updated_at: 'old', phone: '456' }), context)).status, 200)
  assert.equal(state.writes[0].phone, '456')
})

test('bill contact candidates remain separate from owner-entered fields', async () => {
  const { GET, state } = fixture()
  state.profile = { updated_at: 'old', phone: 'existing' }
  state.bill = { source_bill_id: 'bill', extracted_fields: { vendor_phone: '210-555-0100', vendor_email: 'billing@example.com', vendor_website: 'javascript:alert(1)' } }
  const result = await (await GET(new Request('http://localhost/profile'), context)).json()
  assert.equal(result.profile.phone, 'existing')
  assert.equal(result.suggested_contacts.phone, '210-555-0100')
  assert.equal(result.suggested_contacts.website, null)
  assert.equal(state.writes.length, 0)
})
