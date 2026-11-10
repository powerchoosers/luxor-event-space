/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve('src/lib/luxorProviderWebsiteLookupClient.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function loadClient() {
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths; loaded._compile(code, filename)
  return loaded.exports
}
const { lookupProviderWebsite } = loadClient()

test('shares provider searches, caches unknown results, and permits explicit retry', async () => {
  const oldFetch = global.fetch
  let calls = 0
  global.fetch = async () => { calls++; return new Response(JSON.stringify(calls === 1 ? { website: null } : { website: 'https://example.com', source: 'https://example.com/about' }), { status: 200 }) }
  const vendor = { id: 'test-provider', name: 'Example', vendor_type: 'Utilities' }
  try {
    assert.deepEqual(await Promise.all([lookupProviderWebsite(vendor), lookupProviderWebsite(vendor)]), [null, null])
    assert.equal(await lookupProviderWebsite(vendor), null)
    assert.equal(calls, 1)
    assert.deepEqual(await lookupProviderWebsite(vendor, true), { website: 'https://example.com', source: 'https://example.com/about' })
    assert.equal(calls, 2)
    await lookupProviderWebsite({ ...vendor, name: 'Changed company' })
    assert.equal(calls, 3)
  } finally { global.fetch = oldFetch }
})

test('a miss can be searched again after the session cache expires', async () => {
  const oldFetch = global.fetch, oldNow = Date.now
  let now = 1_000_000, calls = 0
  Date.now = () => now
  global.fetch = async () => {
    calls++
    return new Response(JSON.stringify(calls === 1 ? { website: null } : { website: 'https://example.com', source: 'https://example.com/about' }), { status: 200 })
  }
  const vendor = { id: 'expiry-test', name: 'Example', vendor_type: 'Utilities' }
  try {
    const client = loadClient()
    assert.equal(await client.lookupProviderWebsite(vendor), null)
    now += 6 * 60 * 60 * 1000 + 1
    assert.deepEqual(await client.lookupProviderWebsite(vendor), { website: 'https://example.com', source: 'https://example.com/about' })
    assert.equal(calls, 2)
  } finally { global.fetch = oldFetch; Date.now = oldNow }
})

test('reuses session results after reload, rejects invalid entries, and refreshes on retry', async () => {
  const oldFetch = global.fetch, oldWindow = global.window
  const items = new Map()
  global.window = { sessionStorage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) } }
  let calls = 0
  global.fetch = async () => { calls++; return new Response(JSON.stringify({ website: 'https://example.com', source: 'https://example.com/about' }), { status: 200 }) }
  const vendor = { id: 'session-test', name: 'Example', vendor_type: 'Utilities' }
  try {
    await loadClient().lookupProviderWebsite(vendor)
    assert.deepEqual(await loadClient().lookupProviderWebsite(vendor), { website: 'https://example.com', source: 'https://example.com/about' })
    assert.equal(calls, 1)
    await loadClient().lookupProviderWebsite(vendor, true)
    assert.equal(calls, 2)
    const key = [...items.keys()][0]
    items.set(key, JSON.stringify({ expiresAt: Date.now() + 1000, value: { website: 'https://example.com', source: 'https://unrelated.example/about' } }))
    await loadClient().lookupProviderWebsite(vendor)
    assert.equal(calls, 3)
    items.set(key, JSON.stringify({ expiresAt: Date.now() - 1, value: null }))
    await loadClient().lookupProviderWebsite(vendor)
    assert.equal(calls, 4)
  } finally { global.fetch = oldFetch; global.window = oldWindow }
})

test('bill website lookups reuse the result only for the same reviewed bill version', async () => {
  const oldFetch = global.fetch
  const requests = []
  global.fetch = async (url) => { requests.push(url); return new Response(JSON.stringify({ website: 'https://example.com', source: 'https://example.com/about' }), { status: 200 }) }
  const { lookupBillProviderWebsite } = loadClient()
  try {
    await lookupBillProviderWebsite('sample-bill', 'Sample Water', 'version-1')
    await lookupBillProviderWebsite('sample-bill', 'Sample Water', 'version-1')
    assert.equal(requests.length, 1)
    assert.equal(requests[0], '/api/operations/bills/sample-bill/website-suggestion')
    await lookupBillProviderWebsite('sample-bill', 'Sample Water', 'version-2')
    assert.equal(requests.length, 2)
  } finally { global.fetch = oldFetch }
})

test('a stale bill is skipped while a service failure is reported for retry', async () => {
  const oldFetch = global.fetch
  global.fetch = async (url) => new Response(JSON.stringify({ error: 'Unavailable' }), { status: url.includes('stale') ? 404 : 503 })
  const { lookupBillProviderWebsite } = loadClient()
  try {
    assert.equal(await lookupBillProviderWebsite('stale', 'Sample Water', 'v1'), null)
    await assert.rejects(lookupBillProviderWebsite('service-error', 'Sample Water', 'v1'), /Unavailable/)
  } finally { global.fetch = oldFetch }
})
