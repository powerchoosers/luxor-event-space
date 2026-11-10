/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/operations/bills/[id]/paid-provider/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { session: true, finance: true, calls: [] }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.session ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => state.finance },
    '@/lib/luxorTimestamp': { luxorTimestampIsKnown: (value) => Number.isFinite(Date.parse(value)) },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (url, options) => { state.calls.push({ url, body: JSON.parse(options.body) }); return { bill: {}, vendor: {} } } },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { POST: loaded.exports.POST, state }
}
const billId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const vendorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const context = { params: Promise.resolve({ id: billId }) }
const request = (body) => new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('paid provider link requires finance access and explicit confirmation, and uses the session actor', async () => {
  const { POST, state } = fixture()
  const body = { vendorId, expectedUpdatedAt: '2026-01-01T00:00:00Z', actor: 'forged@example.invalid' }
  state.finance = false
  assert.equal((await POST(request({ ...body, confirmed: true }), context)).status, 403)
  state.finance = true
  assert.equal((await POST(request(body), context)).status, 400)
  assert.equal(state.calls.length, 0)
  assert.equal((await POST(request({ ...body, confirmed: true }), context)).status, 200)
  assert.deepEqual(state.calls, [{ url: 'rpc/luxor_link_paid_bill_provider', body: { p_bill_id: billId, p_vendor_id: vendorId, p_expected_updated_at: body.expectedUpdatedAt, p_actor_email: 'owner@example.invalid' } }])
})
