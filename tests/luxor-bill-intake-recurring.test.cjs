/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(filename, stubs = {}) {
  filename = path.resolve(filename)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return loaded.exports
}
const { suggestsRecurringBill } = load('src/lib/luxorRecurringBillSuggestion.ts')

test('intake produces a reviewable recurring bill without creating a provider or scheduled cost', async () => {
  const intake = { id: 'intake', attachment_id: 'attachment', message_id: 'message', status: 'received', attempts: 0, max_attempts: 3, source_type: 'email', sender_address: 'billing@example.invalid', recipient_address: 'invoices@example.invalid', subject: 'Water bill', filename: 'bill.pdf', content_type: 'application/pdf', received_at: '2026-11-09T12:00:00Z' }
  const writes = [], notices = []
  const stubs = {
    'server-only': {},
    '@/lib/luxorSharedMailboxes': { LUXOR_INVOICES_MAILBOX: 'invoices@example.invalid' },
    '@/lib/luxorMailboxServer': { downloadLuxorMailAttachment: async () => ({ bytes: Buffer.from('%PDF- synthetic fixture') }) },
    '@/lib/luxorBillCompanyMatch': { matchConfirmedBillCompany: () => null },
    '@/lib/luxorBillCategories': { isLuxorBillCategory: (value) => ['Rent', 'Maintenance', 'Utilities', 'Supplies', 'Marketing'].includes(value) },
    '@/lib/luxorZohoWebhookServer': { broadcastLuxorPortalNotification: async (...args) => notices.push(args) },
    '@/lib/supabaseRestServer': {
      supabaseRestStrict: async () => [],
      supabaseRest: async (url, options) => {
        if (!options && url.startsWith('luxor_bill_intakes?')) return [intake]
        if (!options && url.startsWith('luxor_bills?')) return []
        if (options?.method === 'PATCH' && url.includes('status=eq.received')) return [{ ...intake, status: 'processing', attempts: 1 }]
        if (url === 'rpc/luxor_insert_intake_bill') { const data = JSON.parse(options.body); writes.push({ url, data }); return { bill: { id: 'bill', ...data.p_bill }, duplicate: false } }
        if (options?.method === 'PATCH') { writes.push({ url, data: JSON.parse(options.body) }); return [] }
        throw new Error(`Unexpected database operation: ${url}`)
      },
    },
  }
  const { processPendingLuxorBillIntakes } = load('src/lib/luxorBillIntakeServer.ts', stubs)
  const oldFetch = global.fetch, oldKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'test-key'
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ classification: 'vendor_bill', vendor_name: 'Sample Water', service: 'Water service', category_suggestion: 'Utilities', frequency: 'Monthly', invoice_number: 'SAMPLE-1', due_date: '2026-11-30', currency: 'USD', total_amount: 75, confidence: 0.98, line_items: [{ description: 'Water', amount: 75 }], evidence: [] }) } }] }), { status: 200 })
  try {
    assert.deepEqual(await processPendingLuxorBillIntakes(), [{ id: 'intake', status: 'processed' }])
    const created = writes.find((item) => item.url === 'rpc/luxor_insert_intake_bill').data.p_bill
    assert.equal(created.vendor_id, null)
    assert.equal(created.extraction_status, 'needs_review')
    assert.equal(created.payment_ready_at, null)
    assert.equal(created.status, 'unpaid')
    assert.equal(created.source_message_id, intake.message_id)
    assert.equal(created.source_attachment_id, intake.attachment_id)
    assert.equal(created.source_filename, intake.filename)
    assert.equal(created.source_content_type, intake.content_type)
    assert.equal(suggestsRecurringBill({ ...created, id: 'bill' }), true)
    assert.ok(writes.every((item) => !/expense_templates|booking_expenses|expense_payments|luxor_vendors/.test(item.url)))
    assert.equal(notices.length, 1)
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ classification: 'vendor_bill', vendor_name: 'CPS Energy', service: 'Electricity', category_suggestion: 'Utilities', due_date: '2021-11-05', currency: 'USD', total_amount: 59.16, confidence: 0.95, line_items: [{ description: 'Current charges', amount: 58.35 }], evidence: [{ field: 'total_amount', quote: 'After Nov 05, 2021 Pay $59.16', page_number: 1 }] }) } }] }), { status: 200 })
    await processPendingLuxorBillIntakes()
    const mismatch = writes.filter((item) => item.url === 'rpc/luxor_insert_intake_bill').at(-1).data.p_bill
    assert.equal(mismatch.arithmetic_status, 'mismatch')
    assert.equal(mismatch.extraction_status, 'needs_review')
    assert.equal(mismatch.amount_state, 'unknown')
    assert.equal(mismatch.extracted_fields.total_amount, 59.16)
    assert.equal(mismatch.payment_ready_at, null)
    assert.ok(writes.every((item) => !/expense_templates|booking_expenses|expense_payments|luxor_vendors/.test(item.url)))
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ classification: 'vendor_bill', vendor_name: 'CPS Energy', service: 'Electricity', category_suggestion: 'Utilities', due_date: '2021-11-05', currency: 'USD', total_amount: 59.16, confidence: 0.95, line_items: [], evidence: [{ field: 'total_amount', quote: 'After Nov 05, 2021 Pay $59.16', page_number: 1 }] }) } }] }), { status: 200 })
    await processPendingLuxorBillIntakes()
    const lateAlternative = writes.filter((item) => item.url === 'rpc/luxor_insert_intake_bill').at(-1).data.p_bill
    assert.equal(lateAlternative.arithmetic_status, 'not_checkable')
    assert.equal(lateAlternative.amount_state, 'unknown')
    assert.equal(lateAlternative.extracted_fields.total_amount, 59.16)
    assert.equal(lateAlternative.extraction_status, 'needs_review')
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
})

test('queues supported invoice attachments when the invoices mailbox is copied', async () => {
  const writes = []
  const stubs = {
    'server-only': {},
    '@/lib/luxorSharedMailboxes': { LUXOR_INVOICES_MAILBOX: { address: 'invoices@example.invalid' } },
    '@/lib/luxorMailboxServer': {},
    '@/lib/luxorBillCompanyMatch': {},
    '@/lib/luxorBillCategories': {},
    '@/lib/luxorZohoWebhookServer': { broadcastLuxorPortalNotification: async () => {} },
    '@/lib/supabaseRestServer': { supabaseRest: async (url, options) => writes.push({ url, body: JSON.parse(options.body) }) },
  }
  const { enqueueLuxorInvoiceAttachments } = load('src/lib/luxorBillIntakeServer.ts', stubs)
  const message = { id: 'message', to_addresses: ['owner@example.invalid'], cc_addresses: [' INVOICES@example.invalid '], from_address: 'supplier@example.invalid', subject: 'Water', occurred_at: '2026-11-09T12:00:00Z' }
  const attachments = [
    { id: 'invoice', source_key: 'attachment', filename: 'water.pdf', content_type: 'application/pdf', size_bytes: 200, content_id: null },
    { id: 'inline', source_key: 'attachment', filename: 'logo.png', content_type: 'image/png', size_bytes: 200, content_id: 'logo' },
  ]
  assert.equal(await enqueueLuxorInvoiceAttachments(message, attachments), 'message')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].body.length, 1)
  assert.equal(writes[0].body[0].attachment_id, 'invoice')
  assert.equal(writes[0].body[0].message_id, 'message')
  assert.equal(writes[0].body[0].recipient_address, 'invoices@example.invalid')
  writes.length = 0
  assert.equal(await enqueueLuxorInvoiceAttachments({ ...message, to_addresses: ['invoices@example.invalid'], cc_addresses: [] }, attachments), 'message')
  assert.equal(writes[0].body[0].attachment_id, 'invoice')
  writes.length = 0
  assert.equal(await enqueueLuxorInvoiceAttachments({ ...message, cc_addresses: [] }, attachments), null)
  assert.equal(writes.length, 0)
})
