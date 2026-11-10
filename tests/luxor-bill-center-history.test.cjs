/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/portal/bill-center/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { authorized: true, shortPage: false, bills: Array.from({ length: 501 }, (_, index) => ({ id: `bill-${index}` })) }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.authorized ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => true },
    '@/lib/luxorPostgrestSchema': { postgrestSchemaUnavailable: () => false },
    '@/lib/supabaseRestServer': {
      supabaseRestCount: async (url) => url.startsWith('luxor_bills?') ? state.bills.length : 0,
      supabaseRestStrict: async (url) => {
        if (!url.startsWith('luxor_bills?')) return []
        const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset') || 0)
        const page = state.bills.slice(offset, offset + 500)
        return state.shortPage && offset === 500 ? [] : page
      },
    },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { GET: loaded.exports.GET, state }
}

test('bill center loads older bills beyond the first 500 records', async () => {
  const { GET } = fixture()
  const response = await GET()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.bills.length, 501)
  assert.equal(body.bills[500].id, 'bill-500')
})

test('bill center refuses an incomplete history rather than returning a partial list', async () => {
  const { GET, state } = fixture()
  state.shortPage = true
  const oldError = console.error
  console.error = () => {}
  try { assert.equal((await GET()).status, 503) } finally { console.error = oldError }
})
