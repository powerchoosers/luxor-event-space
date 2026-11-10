/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const helperFile = path.resolve('src/lib/luxorProviderWebsiteServer.ts')
  const helperCode = ts.transpileModule(fs.readFileSync(helperFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const helper = new Module(helperFile, module); helper.filename = helperFile; helper.paths = module.paths
  const cache = new Map()
  const cacheDb = { supabaseRestStrict: async (url, options = {}) => {
    if (options.method === 'POST') { const row = JSON.parse(options.body); if (cache.has(row.lookup_key)) return []; cache.set(row.lookup_key, row); return [row] }
    const key = /lookup_key=eq\.([a-f0-9]+)/.exec(url)?.[1]
    if (options.method === 'PATCH') { const row = cache.get(key); if (!row) return []; Object.assign(row, JSON.parse(options.body)); return [row] }
    if (options.method === 'DELETE') { cache.delete(key); return [] }
    return cache.has(key) ? [cache.get(key)] : []
  } }
  const originalLoad = Module._load
  Module._load = function (request, parent, main) { return request === 'server-only' ? {} : request === './supabaseRestServer' ? cacheDb : originalLoad.call(this, request, parent, main) }
  try { helper._compile(helperCode, helperFile) } finally { Module._load = originalLoad }
  const filename = path.resolve('src/app/api/portal/vendor-profile/[id]/website-suggestion/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { session: true, active: true, payload: {}, writes: 0, request: null }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.session ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: state.active ? 'active' : 'disabled' }), memberCan: () => true },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (_url, options) => { if (options) state.writes++; return [{ id: 'provider', name: 'Example Utility', vendor_type: 'Utilities', archived_at: null }] } },
    '@/lib/luxorProviderWebsiteServer': helper.exports,
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { POST: loaded.exports.POST, findProviderWebsite: helper.exports.findProviderWebsite, state, cache }
}

test('website lookup requires access and returns only a cited public website', async () => {
  const { POST, state, cache } = fixture()
  const oldKey = process.env.OPEN_ROUTER_API_KEY, oldFetch = global.fetch
  process.env.OPEN_ROUTER_API_KEY = 'test-key'
  global.fetch = async (_url, options) => { state.request = JSON.parse(options.body); return new Response(JSON.stringify(state.payload), { status: 200 }) }
  const context = { params: Promise.resolve({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }) }
  try {
    state.session = false
    assert.equal((await POST(new Request('http://localhost'), context)).status, 403)
    assert.equal(state.request, null)
    state.session = true
    state.payload = { choices: [{ message: { content: JSON.stringify({ website: 'https://example.com/billing' }), annotations: [{ url_citation: { url: 'https://example.com/about' } }] } }] }
    const accepted = await POST(new Request('http://localhost'), context)
    assert.equal((await accepted.json()).website, 'https://example.com')
    assert.deepEqual(JSON.parse(state.request.messages[1].content), { business_name: 'Example Utility', category: 'Utilities' })
    cache.clear()
    state.payload.choices[0].message.annotations[0].url_citation.url = 'https://unrelated.example/about'
    assert.equal((await (await POST(new Request('http://localhost'), context)).json()).website, null)
    cache.clear()
    state.payload.choices[0].message.content = JSON.stringify({ website: 'https://edgeutilities.com' })
    state.payload.choices[0].message.annotations[0].url_citation.url = 'https://edgeutilities.com/'
    assert.equal((await (await POST(new Request('http://localhost'), context)).json()).website, null, 'a cited site without the provider name must not be used')
    cache.clear()
    state.payload.choices[0].message.content = JSON.stringify({ website: 'http://127.0.0.1/' })
    assert.equal((await (await POST(new Request('http://localhost'), context)).json()).website, null)
    assert.equal(state.writes, 0)
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})

test('search sends a generic service hint rather than the bill or schedule description', async () => {
  const { findProviderWebsite, cache } = fixture(), oldFetch = global.fetch
  const oldKey = process.env.OPEN_ROUTER_API_KEY; process.env.OPEN_ROUTER_API_KEY = 'test-key'
  let request
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ website: 'https://spectrum.com' }), annotations: [{ url_citation: { url: 'https://spectrum.com/' } }] } }] }), { status: 200 })
  }
  try {
    assert.equal((await findProviderWebsite('Spectrum', 'Utilities', 'Spectrum Wi-Fi account 12345')).website, 'https://spectrum.com')
    assert.deepEqual(JSON.parse(request.messages[1].content), { business_name: 'Spectrum', category: 'Utilities', service: 'internet' })
    assert.equal(JSON.stringify(request).includes('12345'), false)
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})

test('a cited CPS Energy domain is accepted without allowing unrelated short-name matches', async () => {
  const { findProviderWebsite, cache } = fixture(), oldFetch = global.fetch
  const oldKey = process.env.OPEN_ROUTER_API_KEY; process.env.OPEN_ROUTER_API_KEY = 'test-key'
  let url = 'https://www.cpsenergy.com/'
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ website: url }), annotations: [{ url_citation: { url } }] } }] }), { status: 200 })
  try {
    assert.equal((await findProviderWebsite('CPS Energy', 'Utilities')).website, 'https://www.cpsenergy.com')
    cache.clear(); url = 'https://cpsunrelated.com/'
    assert.equal((await findProviderWebsite('CPS Energy', 'Utilities')).website, null)
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})

test('completed suggestions and no-result searches are reused without another AI request', async () => {
  const { findProviderWebsite } = fixture(), oldFetch = global.fetch, oldKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'test-key'
  let calls = 0
  global.fetch = async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ website: 'https://example.com' }), annotations: [{ url_citation: { url: 'https://example.com/' } }] } }] }), { status: 200 }) }
  try {
    assert.equal((await findProviderWebsite('Example Utility', 'Utilities')).website, 'https://example.com')
    delete process.env.OPEN_ROUTER_API_KEY
    assert.equal((await findProviderWebsite('Example Utility', 'Utilities')).website, 'https://example.com')
    assert.equal(calls, 1)
    process.env.OPEN_ROUTER_API_KEY = 'test-key'
    assert.equal((await findProviderWebsite('Unrelated Provider', null)).website, null)
    assert.equal((await findProviderWebsite('Unrelated Provider', null)).website, null)
    assert.equal(calls, 2)
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})
