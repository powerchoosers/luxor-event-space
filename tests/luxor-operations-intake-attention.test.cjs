/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/operations/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const recent = Array.from({ length: 100 }, (_, index) => ({ id: `recent-${index}`, status: 'ready', received_at: '2026-11-09T00:00:00Z' }))
  const attention = Array.from({ length: 501 }, (_, index) => ({ id: `issue-${index}`, status: index === 500 ? 'received' : 'failed', received_at: '2026-01-01T00:00:00Z' }))
  const state = { incomplete: false, attentionPath: '' }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => ({ email: 'owner@example.invalid' }) },
    '@/lib/luxorOperationsBillExpenses': { loadOperationsBillsWithExpenseLinks: async () => [] },
    '@/lib/luxorBillCategories': {}, '@/lib/luxorManualBillAnalysisServer': {}, '@/lib/luxorManualBillCreate': {}, '@/lib/luxorTimestamp': {},
    '@/lib/supabaseRestServer': {
      supabaseRestCount: async (url) => { state.attentionPath = url; return attention.length },
      supabaseRest: async () => [],
      supabaseRestStrict: async (url) => {
        if (!url.startsWith('luxor_bill_intakes?')) return []
        if (!url.includes('status=in.')) return recent
        const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'))
        return state.incomplete && offset === 500 ? [] : attention.slice(offset, offset + 500)
      },
    },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { GET: loaded.exports.GET, state }
}

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
