/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function intakeWorker({ sameAttachment, sameBytes, rpcDuplicate } = {}) {
  const writes = [], notices = []
  const intake = { id: 'intake', attachment_id: 'attachment', message_id: 'message', status: 'received', attempts: 0, max_attempts: 3, source_type: 'portal_upload', sender_address: 'owner@example.invalid', subject: 'Test bill', filename: 'bill.pdf', content_type: 'application/pdf' }
  const existing = { id: 'existing-bill', source_attachment_id: 'original-attachment', extraction_status: 'needs_review', source_sha256: 'existing-hash' }
  const stubs = {
    'server-only': {}, '@/lib/luxorSharedMailboxes': {},
    '@/lib/luxorMailboxServer': { downloadLuxorMailAttachment: async () => ({ bytes: Buffer.from('%PDF- synthetic duplicate fixture') }) },
    '@/lib/luxorBillCompanyMatch': {},
    '@/lib/luxorBillCategories': { isLuxorBillCategory: (value) => value === 'Utilities' },
    '@/lib/luxorZohoWebhookServer': { broadcastLuxorPortalNotification: async (...args) => notices.push(args) },
    '@/lib/supabaseRestServer': { supabaseRest: async (url, options) => {
      if (!options && url.startsWith('luxor_bill_intakes?')) return [intake]
      if (!options && url.includes('source_attachment_id=eq.')) return sameAttachment ? [{ ...existing, source_attachment_id: intake.attachment_id }] : []
      if (!options && url.includes('source_sha256=eq.')) return sameBytes ? [existing] : []
      if (options?.method === 'PATCH' && url.includes('status=eq.received')) return [{ ...intake, status: 'processing', attempts: 1 }]
      if (url === 'rpc/luxor_insert_intake_bill') { writes.push({ url, data: JSON.parse(options.body) }); return { bill: existing, duplicate: rpcDuplicate } }
      if (options?.method === 'PATCH') { writes.push({ url, data: JSON.parse(options.body) }); return [] }
      throw new Error(`Unexpected database operation: ${url}`)
    } },
  }
  const filename = path.resolve('src/lib/luxorBillIntakeServer.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const original = Module._load
  Module._load = function (name, parent, main) { return Object.hasOwn(stubs, name) ? stubs[name] : original.call(this, name, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { ...loaded.exports, writes, notices }
}

test('completed attachment retries reuse the saved bill without calling AI or inserting another bill', async () => {
  const api = intakeWorker({ sameAttachment: true })
  const originalFetch = global.fetch
  global.fetch = async () => { throw new Error('AI must not run for a saved attachment') }
  try {
    assert.equal((await api.processPendingLuxorBillIntakes())[0].status, 'processed')
    assert.equal(api.writes.length, 1)
    assert.equal(api.writes[0].data.bill_id, 'existing-bill')
    assert.equal(api.writes[0].data.status, 'needs_review')
  } finally { global.fetch = originalFetch }
})

test('identical bytes on another upload resolve to the existing bill before calling AI', async () => {
  const api = intakeWorker({ sameBytes: true })
  const originalFetch = global.fetch
  global.fetch = async () => { throw new Error('AI must not run for an exact duplicate') }
  try {
    assert.equal((await api.processPendingLuxorBillIntakes())[0].status, 'processed')
    assert.equal(api.writes.length, 1)
    assert.equal(api.writes[0].data.duplicate_of_bill_id, 'existing-bill')
    assert.equal(api.writes[0].data.status, 'duplicate')
    assert.equal(api.notices.length, 1)
  } finally { global.fetch = originalFetch }
})

test('a duplicate found atomically during insertion is returned as duplicate without marking it ready', async () => {
  const api = intakeWorker({ rpcDuplicate: true })
  const originalFetch = global.fetch, originalKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'synthetic-test-key'
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ classification: 'vendor_bill', vendor_name: 'Example Utility', service: 'Electricity', category_suggestion: 'Utilities', total_amount: 45, currency: 'USD', confidence: 0.99, invoice_number: 'TEST-1', line_items: [], evidence: [] }) } }] }), { status: 200 })
  try {
    assert.equal((await api.processPendingLuxorBillIntakes())[0].status, 'processed')
    const proposed = api.writes.find(({ url }) => url === 'rpc/luxor_insert_intake_bill').data.p_bill
    assert.equal(proposed.payment_ready_at, null)
    assert.equal(proposed.extraction_status, 'needs_review')
    const result = api.writes.at(-1).data
    assert.equal(result.status, 'duplicate')
    assert.equal(result.duplicate_of_bill_id, 'existing-bill')
    assert.ok(api.writes.every(({ url }) => !/payments|expense_templates|booking_expenses/.test(url)))
  } finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = originalKey }
})
