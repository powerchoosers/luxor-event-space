/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const recent = Array.from({ length: 100 }, (_, index) => ({ id: `recent-${index}`, status: 'ready', received_at: '2026-11-09T00:00:00Z' }))
  const attention = Array.from({ length: 501 }, (_, index) => ({ id: `issue-${index}`, status: index === 500 ? 'received' : 'failed', received_at: '2026-01-01T00:00:00Z' }))
  const state = { incomplete: false, attentionPath: '', dataReads: 0, writes: [], session: { email: 'owner@example.invalid' }, member: { email: 'owner@example.invalid', role: 'owner', status: 'active', permissions: [] } }
  const stubs = {
    'server-only': {},
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => state.session },
    '@/lib/luxorOperationsBillExpenses': { loadOperationsBillsWithExpenseLinks: async () => { state.dataReads++; return [] } },
    '@/lib/luxorBillCategories': {}, '@/lib/luxorManualBillAnalysisServer': {}, '@/lib/luxorManualBillCreate': {}, '@/lib/luxorTimestamp': {},
    '@/lib/supabaseRestServer': {
      supabaseRestCount: async (url) => { state.dataReads++; state.attentionPath = url; return attention.length },
      supabaseRest: async (url, init) => {
        if (url.startsWith('luxor_portal_members?')) return state.member ? [state.member] : []
        if (init?.method === 'POST') { const row = JSON.parse(init.body); state.writes.push({ url, row }); return [{ id: 'synthetic-vendor', ...row }] }
        state.dataReads++; return []
      },
      supabaseRestStrict: async (url) => {
        state.dataReads++
        if (!url.startsWith('luxor_bill_intakes?')) return []
        if (!url.includes('status=in.')) return recent
        const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'))
        return state.incomplete && offset === 500 ? [] : attention.slice(offset, offset + 500)
      },
    },
  }
  // Exercise actual membership normalization and permission checks. Only the
  // signed-in session and database boundaries are synthetic.
  const actual = {
    '@/lib/luxorOperationsAccess': 'src/lib/luxorOperationsAccess.ts',
    '@/lib/luxorPortalAccess': 'src/lib/luxorPortalAccess.ts',
  }
  const cache = new Map()
  function load(relative) {
    const filename = path.resolve(relative)
    if (cache.has(filename)) return cache.get(filename)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
    loaded._compile(code, filename); cache.set(filename, loaded.exports)
    return loaded.exports
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : Object.hasOwn(actual, request) ? load(actual[request]) : original.call(this, request, parent, main) }
  let route
  try { route = load('src/app/api/operations/route.ts') } finally { Module._load = original }
  return { GET: route.GET, POST: route.POST, state }
}

test('operations denies missing sessions, inactive members, and missing operations permission before loading finance data', async () => {
  for (const change of [{ session: null }, { member: null }, { member: { role: 'owner', status: 'suspended', permissions: [] } }, { member: { role: 'owner', status: 'pending', permissions: [] } }, { member: { role: 'agent', status: 'active', permissions: ['finances'] } }]) {
    const { GET, state } = fixture()
    Object.assign(state, change)
    assert.equal((await GET(new Request('http://localhost/api/operations'))).status, 401)
    assert.equal(state.dataReads, 0)
    assert.equal(state.writes.length, 0)
  }
})

test('an active operations member can read intakes without finance write permission', async () => {
  const { GET, state } = fixture()
  state.member = { role: 'agent', status: 'active', permissions: ['operations'] }
  assert.equal((await GET(new Request('http://localhost/api/operations'))).status, 200)
})

test('saving a company website requires finance permission in addition to operations access', async () => {
  for (const [permissions, expected] of [[['operations'], 403], [['finances'], 401], [['operations', 'finances'], 201]]) {
    const { POST, state } = fixture()
    state.member = { role: 'agent', status: 'active', permissions }
    const response = await POST(new Request('http://localhost/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'vendor', name: 'Synthetic company', vendor_type: 'Other', business_website: 'https://example.invalid/' }) }))
    assert.equal(response.status, expected)
    assert.equal(state.writes.length, expected === 201 ? 1 : 0)
    if (expected === 201) assert.equal(state.writes[0].row.business_website, 'https://example.invalid/')
  }
})

test('operations includes older waiting and failed intakes beyond the recent 100 and multiple pages', async () => {
  const { GET, state } = fixture()
  const response = await GET(new Request('http://localhost/api/operations'))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.billIntakes.length, 601)
  assert.ok(result.billIntakes.some((item) => item.id === 'issue-500' && item.status === 'received'))
  assert.match(state.attentionPath, /status=in\.\(received,processing,failed,ignored\)/)
})

test('operations rejects an incomplete list of failed intakes', async () => {
  const { GET, state } = fixture()
  state.incomplete = true
  const response = await GET(new Request('http://localhost/api/operations'))
  assert.equal(response.status, 500)
})

test('operations reports analysis configuration without returning the credential', async () => {
  const { GET } = fixture()
  const oldKey = process.env.OPEN_ROUTER_API_KEY
  try {
    delete process.env.OPEN_ROUTER_API_KEY
    assert.equal((await (await GET(new Request('http://localhost/api/operations'))).json()).invoiceAnalysisConfigured, false)
    process.env.OPEN_ROUTER_API_KEY = 'synthetic-key'
    const body = await (await GET(new Request('http://localhost/api/operations'))).json()
    assert.equal(body.invoiceAnalysisConfigured, true)
    assert.equal(JSON.stringify(body).includes('synthetic-key'), false)
  } finally { if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})

test('operations reports missing Resend receiving configuration without returning credentials', async () => {
  const { GET } = fixture()
  const oldKey = process.env.RESEND_API_KEY, oldSecret = process.env.RESEND_WEBHOOK_SECRET
  try {
    process.env.RESEND_API_KEY = 'synthetic-resend-key'
    delete process.env.RESEND_WEBHOOK_SECRET
    assert.equal((await (await GET(new Request('http://localhost/api/operations'))).json()).resendReceivingConfigured, false)
    process.env.RESEND_WEBHOOK_SECRET = 'synthetic-webhook-secret'
    const body = await (await GET(new Request('http://localhost/api/operations'))).json()
    assert.equal(body.resendReceivingConfigured, true)
    assert.equal(JSON.stringify(body).includes('synthetic-resend-key'), false)
    assert.equal(JSON.stringify(body).includes('synthetic-webhook-secret'), false)
  } finally {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey
    if (oldSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = oldSecret
  }
})
