/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { File } = require('node:buffer')
global.File = File
const providerId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const context = { params: Promise.resolve({ id: providerId }) }

function setup(overrides = {}) {
  const writes = [], scheduled = [], claims = new Map(), messages = new Map(), intakes = new Map()
  let attachments = 0
  const config = { assessment: { kind: 'bill', sensitive: 'none' }, actor: 'owner@example.invalid', archived: false, ...overrides }
  const stubs = {
    'next/server': { after: (fn) => scheduled.push(fn), NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '@/lib/luxorExpenseReceiptsServer': { inspectLuxorExpenseReceipt: async (file) => ({ bytes: Buffer.from(await file.arrayBuffer()), sha256: file.name === 'different.pdf' ? 'b'.repeat(64) : 'a'.repeat(64), safeName: file.name, contentType: 'application/pdf' }) },
    '@/lib/luxorVendorDocumentsServer': { VENDOR_UUID: /^[0-9a-f-]{36}$/i, vendorFinanceSession: async () => config.actor ? { email: config.actor } : null },
    '@/lib/luxorProviderDocumentAnalysis': { verifyDocumentTicket: () => config.assessment },
    '@/lib/luxorProviderUploadDestination': { claimProviderUploadDestination: async (claim) => {
      if (config.claimError) throw new Error('Unavailable')
      const previous = claims.get(claim.id)
      if (!previous) claims.set(claim.id, claim)
      return !previous || JSON.stringify(previous) === JSON.stringify(claim)
    } },
    '@/lib/luxorSharedMailboxes': { LUXOR_INVOICES_MAILBOX: { address: 'invoices@example.invalid' } },
    '@/lib/luxorBillIntakeServer': { processPendingLuxorBillIntakes: async () => {} },
    '@/lib/luxorMailboxServer': { saveLuxorMailAttachment: async () => { attachments++; if (config.attachmentFails) { config.attachmentFails = false; throw new Error('Temporary storage failure') } return { id: 'attachment' } } },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (url, init) => {
      if (init?.method === 'POST') {
        const row = JSON.parse(init.body); writes.push({ url, row })
        if (url.startsWith('luxor_mail_messages')) { if (!messages.has(row.id)) messages.set(row.id, row); return [] }
        if (url.startsWith('luxor_bill_intakes')) { if (!intakes.has(row.attachment_id)) intakes.set(row.attachment_id, { id: 'intake', status: 'received', bill_id: null, duplicate_of_bill_id: null }); return [] }
      }
      if (url.startsWith('luxor_vendors')) return [{ id: providerId, archived_at: config.archived ? '2026-01-01' : null }]
      if (url.startsWith('luxor_mail_messages')) return messages.has(requestId) ? [messages.get(requestId)] : []
      if (url.startsWith('luxor_bill_intakes')) return [...intakes.values()]
      throw new Error(`Unexpected database operation: ${url}`)
    } },
  }
  const filename = path.resolve('src/app/api/portal/vendor-profile/[id]/documents/bill/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const original = Module._load
  Module._load = function (name, parent, main) { return Object.hasOwn(stubs, name) ? stubs[name] : original.call(this, name, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { ...loaded.exports, writes, claims, messages, intakes, scheduled, config, attachmentCount: () => attachments }
}
function request(name = 'bill.pdf') {
  const form = new Map([['file', new File(['%PDF-synthetic'], name, { type: 'application/pdf' })], ['request_id', requestId], ['analysis_ticket', 'test-ticket']])
  return { formData: async () => ({ get: (key) => form.get(key) }), nextUrl: new URL(`https://example.invalid/status?request_id=${requestId}`) }
}

test('bill routing fails closed before storage for rejected scans, absent access, archival, and unavailable claim schema', async () => {
  for (const [config, expected] of [[{ assessment: null }, 400], [{ assessment: { kind: 'contract', sensitive: 'none' } }, 400], [{ assessment: { kind: 'bill', sensitive: 'possible' } }, 400], [{ actor: null }, 403], [{ archived: true }, 409], [{ claimError: true }, 503]]) {
    const api = setup(config)
    assert.equal((await api.POST(request(), context)).status, expected)
    assert.equal(api.attachmentCount(), 0)
    assert.equal(api.writes.length, 0)
  }
})

test('retries after storage failure preserve one message and intake and reject changed content', async () => {
  const api = setup({ attachmentFails: true })
  assert.equal((await api.POST(request(), context)).status, 503)
  assert.equal((await api.POST(request('different.pdf'), context)).status, 409)
  assert.equal(api.attachmentCount(), 1)
  const saved = await api.POST(request(), context)
  assert.equal(saved.status, 202)
  assert.equal((await api.POST(request(), context)).status, 202)
  assert.equal(api.messages.size, 1)
  assert.equal(api.intakes.size, 1)
  assert.ok(api.writes.every(({ url }) => !/luxor_bills|payments|expense_templates/.test(url)))
  assert.equal(saved.body.intake.status, 'received')
})

test('uncertain documents may be explicitly routed as bills and polling stays bound to the uploading actor', async () => {
  const api = setup({ assessment: { kind: 'uncertain', sensitive: 'none' } })
  assert.equal((await api.POST(request(), context)).status, 202)
  const count = api.scheduled.length
  assert.equal((await api.GET(request(), context)).status, 200)
  assert.equal(api.scheduled.length, count + 1)
  api.config.actor = 'other@example.invalid'
  assert.equal((await api.GET(request(), context)).status, 404)
  assert.equal(api.scheduled.length, count + 1)
})
