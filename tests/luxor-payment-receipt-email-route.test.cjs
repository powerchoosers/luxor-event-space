'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const routePath = path.resolve(__dirname, '../src/app/api/payments/[id]/receipt/email/route.ts')
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
const crypto = require('node:crypto')
let pdfSha256 = crypto.createHash('sha256').update(pdf).digest('hex')
const context = {
  recipient: 'client@example.invalid', subject: 'Payment Receipt – Quinceañera', message: 'Thank you for your payment.',
  filename: 'Luxor-Payment-Receipt-ABC12345.pdf', receiptNumber: 'ABC12345', eventName: 'Quinceañera',
  fingerprint: 'receipt-snapshot-v1', pdfSha256, pdfUrl: '/api/receipt.pdf', html: '<p>Thank you for your payment.</p>', pdf,
  payment: { id: 'payment-1', inquiry_id: 'inquiry-1', booking_id: 'booking-1', status: 'paid' },
  booking: { id: 'booking-1' }, inquiry: { id: 'inquiry-1', is_test: false },
}
const jobs = new Map()
let queueCalls
let failQueueOnce

function responseMock() {
  return { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers || {} }) }
}

const routeSource = fs.readFileSync(routePath, 'utf8')
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: routePath,
}).outputText
const mocks = {
  'next/server': { NextResponse: responseMock() },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'owner@example.invalid' }) },
  '@/lib/luxorTestLeadServer': { assertLuxorProductionSideEffectsAllowed: async () => undefined },
  '@/lib/luxorPaymentReceiptEmailServer': { getLuxorPaymentReceiptEmailContext: async () => context },
  '@/lib/luxorTransactionalNoticeServer': { queueLuxorTransactionalNotice: async (input) => {
    queueCalls += 1
    assert.deepEqual(Buffer.from(input.pdf), Buffer.from(context.pdf))
    assert.equal(input.recipient, context.recipient)
    assert.equal(input.subject, context.subject)
    assert.equal(input.html, context.html)
    if (failQueueOnce) { failQueueOnce = false; throw new Error('Synthetic provider queue failure') }
    const id = 'stable-receipt-job'
    if (!jobs.has(id)) jobs.set(id, {
      id, job_type: 'transactional_notice', status: 'queued', recipient_email: input.recipient,
      subject: input.subject, body: input.html, updated_at: new Date().toISOString(),
      metadata: { transactionalNotice: { kind: 'payment_receipt', key: 'payment_receipt/payment-1', recipient: input.recipient, subject: input.subject, html: input.html, pdf: { sha256: context.pdfSha256 } } },
    })
    return jobs.get(id)
  } },
  '@/lib/supabaseRestServer': { supabaseRest: async () => [] },
}
const loaded = new Module(routePath, module)
loaded.filename = routePath
loaded.paths = Module._nodeModulePaths(path.dirname(routePath))
loaded.require = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : require(specifier)
loaded._compile(compiled, routePath)
const route = loaded.exports
const params = Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })
const post = (retry = false) => route.POST({ json: async () => ({ fingerprint: context.fingerprint, pdfSha256: context.pdfSha256, retry }) }, { params })

function buildReceiptPdfModule() {
  const filePath = path.resolve(__dirname, '../src/lib/luxorPaymentReceiptPdf.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText
  const receiptModule = new Module(filePath, module)
  receiptModule.filename = filePath
  receiptModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  receiptModule.require = (specifier) => {
    if (specifier === 'server-only') return {}
    if (specifier === '@/lib/luxorTourPlanningServer' || specifier === './luxorTourPlanningServer') return { LUXOR_TOUR_LOCATION: '803 Castroville Rd #402, San Antonio, TX 78237' }
    return require(specifier)
  }
  receiptModule._compile(output, filePath)
  return receiptModule.exports.buildLuxorPaymentReceiptPdf
}
const buildReceiptPdf = buildReceiptPdfModule()
const syntheticPaymentContext = {
  payment: { id: 'payment-1', status: 'paid', amount: 250, paid_at: '2026-11-02T16:00:00.000Z', created_at: '2026-11-02T16:00:00.000Z', payment_method: 'Zelle', processor_reference: 'synthetic-ref', metadata: { installment_allocations: [{ label: 'Payment 2', installment_order: 2, amount: 250 }] } },
  booking: { client_name: 'Synthetic Client', event_type: 'Quinceañera', event_date: '2027-06-01' },
  inquiry: { full_name: 'Synthetic Client', email: 'client@example.invalid' },
  invoice: { id: 'invoice-1', description: 'Synthetic event', event_type: 'Quinceañera' },
}

test.beforeEach(() => { jobs.clear(); queueCalls = 0; failQueueOnce = false })

test('receipt preview exposes the exact inline PDF and snapshot used by the outgoing attachment', async () => {
  const actualPdf = await buildReceiptPdf(syntheticPaymentContext)
  const repeatedPdf = await buildReceiptPdf(syntheticPaymentContext)
  assert.equal(Buffer.from(actualPdf).subarray(0, 5).toString('ascii'), '%PDF-')
  assert.deepEqual(Buffer.from(actualPdf), Buffer.from(repeatedPdf))
  context.pdf = actualPdf
  pdfSha256 = crypto.createHash('sha256').update(actualPdf).digest('hex')
  context.pdfSha256 = pdfSha256
  const result = await route.GET(new Request('https://example.invalid'), { params })
  assert.equal(result.status, 200)
  assert.equal(result.body.pdfSha256, pdfSha256)
  assert.match(result.body.pdfUrl, /fingerprint=receipt-snapshot-v1/)
  const queued = await post()
  assert.equal(queued.status, 202)
  assert.equal(queued.body.state, 'queued')
  assert.equal(queueCalls, 1)
})

test('repeated receipt clicks reuse the same deterministic queued job', async () => {
  const first = await post()
  const second = await post()
  assert.equal(first.body.job.id, second.body.job.id)
  assert.equal(first.body.state, 'queued')
  assert.equal(second.body.state, 'queued')
  assert.equal(queueCalls, 2) // The transactional-notice helper resolves both calls to the same stable job key.
})

test('queue failures remain errors and a later safe retry can be queued', async () => {
  failQueueOnce = true
  const failed = await post()
  assert.equal(failed.status, 500)
  assert.match(failed.body.error, /Synthetic provider queue failure/)
  const retried = await post()
  assert.equal(retried.status, 202)
  assert.equal(retried.body.job.id, 'stable-receipt-job')
})

