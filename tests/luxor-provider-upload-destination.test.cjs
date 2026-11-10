/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const filename = path.resolve('src/lib/luxorProviderUploadDestination.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const claims = new Map()
const originalLoad = Module._load
Module._load = function (name, parent, main) {
  if (name === 'server-only') return {}
  if (name === '@/lib/supabaseRestServer') return { supabaseRestStrict: async (url, options) => {
    if (options?.method === 'POST') {
      const row = JSON.parse(options.body)
      if (!claims.has(row.id)) claims.set(row.id, row)
      return []
    }
    const id = /&id=eq\.([^&]+)/.exec(url)?.[1]
    return claims.has(id) ? [claims.get(id)] : []
  } }
  return originalLoad.call(this, name, parent, main)
}
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
try { loaded._compile(code, filename) } finally { Module._load = originalLoad }
const { claimProviderUploadDestination } = loaded.exports
const base = { id: 'request-1', vendor_id: 'vendor-1', sha256: 'abc', created_by: 'owner', kind: 'bill' }

test('same request can retry only with the original file, provider, actor and destination', async () => {
  assert.equal(await claimProviderUploadDestination(base), true)
  assert.equal(await claimProviderUploadDestination({ ...base }), true)
  for (const change of [{ kind: 'contract' }, { kind: 'other' }, { sha256: 'different' }, { vendor_id: 'other' }, { created_by: 'other' }]) {
    assert.equal(await claimProviderUploadDestination({ ...base, ...change }), false)
  }
})

test('competing destinations for one request have exactly one winner', async () => {
  const [bill, contract] = await Promise.all([
    claimProviderUploadDestination({ ...base, id: 'race' }),
    claimProviderUploadDestination({ ...base, id: 'race', kind: 'contract' }),
  ])
  assert.equal(Number(bill) + Number(contract), 1)
})
