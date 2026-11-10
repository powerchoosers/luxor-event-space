/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/operations/bills/[id]/website-suggestion/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { session: true, finance: true, bill: { provider: 'Sample Water', vendor_id: null, bill_category: 'Utilities', service: 'Water', extracted_fields: {} }, searches: [], writes: 0 }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.session ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => state.finance },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (_url, options) => { if (options) state.writes++; return state.bill ? [state.bill] : [] } },
    '@/lib/luxorRecurringBillSuggestion': { suggestsRecurringBill: (bill) => bill.service === 'Water' },
    '@/lib/luxorProviderWebsiteServer': { findProviderWebsite: async (name, category) => { state.searches.push({ name, category }); return { website: 'https://example.com', source: 'https://example.com/about' } } },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { POST: loaded.exports.POST, state }
}
const context = { params: Promise.resolve({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }) }

test('unlinked recurring bill searches only its business name and category, with access controls', async () => {
  const { POST, state } = fixture(), oldKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'test-key'
  try {
    state.finance = false
    assert.equal((await POST(new Request('http://localhost'), context)).status, 403)
    state.finance = true
    assert.equal((await (await POST(new Request('http://localhost'), context)).json()).website, 'https://example.com')
    assert.deepEqual(state.searches, [{ name: 'Sample Water', category: 'Utilities' }])
    state.bill.provider = 'billing@example.invalid'
    assert.equal((await (await POST(new Request('http://localhost'), context)).json()).website, null)
    state.bill.provider = 'Sample Water'; state.bill.vendor_id = 'already-linked'
    assert.equal((await POST(new Request('http://localhost'), context)).status, 404)
    assert.equal(state.searches.length, 1)
    assert.equal(state.writes, 0)
  } finally { if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})
