/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { File } = require('node:buffer')
global.File = File
function load(stubs) {
  const filename = path.resolve('src/app/api/portal/vendor-profile/[id]/documents/analyze/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return loaded.exports
}
function route(assessment, vendor = { id: '11111111-1111-4111-8111-111111111111', archived_at: null }) {
  let signed = 0
  const api = load({
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '@/lib/luxorExpenseReceiptsServer': { inspectLuxorExpenseReceipt: async () => ({ bytes: Buffer.from('%PDF-synthetic'), sha256: 'hash', safeName: 'test.pdf', contentType: 'application/pdf' }) },
    '@/lib/luxorVendorDocumentsServer': { vendorFinanceSession: async () => ({ email: 'owner@example.invalid' }), VENDOR_UUID: /^[0-9a-f-]{36}$/i },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async () => vendor ? [vendor] : [] },
    '@/lib/luxorProviderDocumentAnalysis': { classifyProviderDocument: async () => assessment, issueDocumentTicket: () => { signed++; return 'signed' } },
  })
  return { ...api, signed: () => signed }
}
const context = { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
const request = { formData: async () => ({ get: () => new File(['%PDF-synthetic'], 'test.pdf', { type: 'application/pdf' }) }) }
test('possible or uncertain sensitive documents are flagged and never receive an upload ticket', async () => {
  for (const sensitive of ['possible', 'uncertain']) {
    const api = route({ kind: 'contract', sensitive, confidence: 0.9, contractEndDate: null })
    const result = await api.POST(request, context)
    assert.equal(result.status, 422); assert.equal(result.body.sensitive, sensitive); assert.equal(api.signed(), 0)
  }
})
test('unclassified documents get a ticket for manual choice without defaulting to bill', async () => {
  const api = route({ kind: 'uncertain', sensitive: 'none', confidence: 0.4, contractEndDate: null })
  const result = await api.POST(request, context)
  assert.equal(result.status, 200); assert.equal(result.body.assessment.kind, 'uncertain'); assert.equal(result.body.ticket, 'signed'); assert.equal(api.signed(), 1)
})
test('archived or missing providers cannot start analysis', async () => {
  const api = route({ kind: 'bill', sensitive: 'none', confidence: 1 }, { archived_at: '2026-01-01' })
  const result = await api.POST(request, context)
  assert.equal(result.status, 409); assert.equal(api.signed(), 0)
})
