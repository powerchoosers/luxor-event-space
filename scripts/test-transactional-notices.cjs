/* Offline only: all storage, providers, SQL and Stripe effects are mocked. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const records = new Map(); const files = new Map(); const sends = []; const zoho = []
  let reads = 0; let corrupt = false; let missingClaim = false; let legacy = null
  const notices = load('src/lib/luxorTransactionalNoticeServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      const query = new URLSearchParams(url.split('?')[1]); const id = query.get('id')?.replace('eq.', '')
      if (query.has('job_type')) return legacy ? [legacy] : []
      if (init?.method === 'POST') {
        assert.equal(query.get('on_conflict'), 'id'); assert.match(init.headers.Prefer, /ignore-duplicates/)
        const row = JSON.parse(init.body)
        if (records.has(row.id)) return []
        records.set(row.id, { attempts: 0, ...row }); return [structuredClone(records.get(row.id))]
      }
      if (query.has('attempts') && missingClaim) return []
      if (init?.method === 'PATCH') {
        const row = records.get(id)
        if (row.metadata.transactionalSendStarted) return []
        Object.assign(row, JSON.parse(init.body)); return [structuredClone(row)]
      }
      return records.has(id) ? [structuredClone(records.get(id))] : []
    } },
    './luxorDocumentsServer': {
      saveLuxorPrivatePdf: async (path, bytes) => { files.set(path, Buffer.from(bytes)) },
      downloadLuxorPrivatePdf: async path => { reads++; return corrupt ? Buffer.from('wrong') : files.get(path) },
    },
    './luxorResendMailServer': { sendLuxorResendEmail: async input => { sends.push(input) } },
    './zohoMailServer': { sendLuxorZohoEmail: async input => { zoho.push(input) } },
  })
  process.env.LUXOR_MAIL_PROVIDER = 'resend'
  const input = { kind: 'agreement_client', sourceId: '11111111-1111-4111-8111-111111111111',
    signatureRequestId: '11111111-1111-4111-8111-111111111111', recipient: 'guest@example.invalid',
    subject: 'Agreement complete', html: '<p>Exact original copy</p>', pdf: Buffer.from('%PDF-1.7 original'),
    filename: 'Agreement.pdf', scheduledFor: '2026-08-28T12:00:00Z' }
  const first = await notices.queueLuxorTransactionalNotice(input)
  assert.equal(first.job_type, 'transactional_notice'); assert.equal(reads, 1)
  assert.equal(first.metadata.transactionalNotice.provider, 'resend')
  const replay = await notices.queueLuxorTransactionalNotice({ ...input, recipient: 'changed@example.invalid', html: 'Changed', pdf: Buffer.from('Changed') })
  assert.deepEqual(first, replay); assert.equal(files.size, 1); assert.equal(sends.length, 0)
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(first), /claimed/)
  const claimed = { ...first, status: 'sending', attempts: 1 }; records.set(first.id, structuredClone(claimed))
  process.env.LUXOR_MAIL_PROVIDER = 'zoho'
  await notices.deliverLuxorTransactionalNotice(claimed)
  assert.equal(sends.length, 1); assert.equal(zoho.length, 0)
  assert.equal(sends[0].content, input.html); assert.equal(sends[0].idempotencyKey, `email-job/${first.id}`)
  assert.deepEqual(Buffer.from(sends[0].attachments[0].content), input.pdf)
  corrupt = true
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(claimed), /PDF changed/)
  await assert.rejects(() => notices.queueLuxorTransactionalNotice({ ...input, sourceId: 'new-corrupt' }), /verification failed/)
  assert.equal(records.size, 1); assert.equal(sends.length, 1); corrupt = false
  missingClaim = true
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(claimed), /claim changed/)
  missingClaim = false
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice({ ...claimed, recipient_email: 'attacker@example.invalid' }), /snapshot is invalid/)
  const unsafe = structuredClone(claimed); unsafe.metadata.transactionalNotice.pdf.path = 'contracts/other.pdf'
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(unsafe), /snapshot is invalid/)
  legacy = { id: 'legacy', status: 'failed', job_type: 'contract_signature' }
  const legacyResult = await notices.queueLuxorTransactionalNotice({ ...input, sourceId: 'legacy-retry' })
  assert.equal(legacyResult.id, 'legacy'); assert.equal(records.size, 1); legacy = null
  const concurrent = await Promise.all([1, 2].map(() => notices.queueLuxorTransactionalNotice({ ...input, sourceId: 'same-event' })))
  assert.equal(concurrent[0].id, concurrent[1].id); assert.equal(records.size, 2)
  const zohoJob = { ...concurrent[0], status: 'sending', attempts: 1 }; records.set(zohoJob.id, structuredClone(zohoJob))
  process.env.LUXOR_MAIL_PROVIDER = 'resend'
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(zohoJob), /unfinished Zoho/)
  process.env.LUXOR_MAIL_PROVIDER = 'zoho'
  await notices.deliverLuxorTransactionalNotice(zohoJob)
  assert.equal(zoho.length, 1)
  await assert.rejects(() => notices.deliverLuxorTransactionalNotice(zohoJob), /may already have started/)
  assert.equal(zoho.length, 1)
  console.log('PASS exact private PDF snapshots/read-back, concurrent enqueue deduplication, immutable replay, legacy protection, provider pinning, claim fences and ambiguous Zoho no-resend')

  let allowed = true; let deliveryError = false; let deliveries = 0; const patches = []
  const worker = load('src/lib/luxorEmailJobsServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      if (url.includes('status=eq.queued') && !allowed) return []
      const patch = JSON.parse(init.body); patches.push(patch); return [{ ...claimed, ...patch }]
    } },
    './luxorTransactionalNoticeServer': { deliverLuxorTransactionalNotice: async () => {
      deliveries++; if (deliveryError) throw new Error('Retryable provider failure'); return { status: 'sent' }
    } },
    './luxorInquiriesServer': { getLuxorInquiry: async () => ({ status: 'new' }) },
    './zohoMailServer': { sendLuxorZohoEmail: async () => { throw new Error('Notice reached generic delivery') } },
    './luxorLifecycleEmailsServer': {}, './luxorInvoicesServer': {}, './luxorStripeCheckoutServer': {}, './luxorBookingsServer': {},
  })
  await worker.processLuxorEmailJobs([first]); assert.equal(deliveries, 1); assert.equal(patches.at(-1).status, 'sent')
  allowed = false; await worker.processLuxorEmailJobs([first]); assert.equal(deliveries, 1)
  allowed = true; deliveryError = true
  await worker.processLuxorEmailJobs([claimed], { markSending: false }); assert.equal(patches.at(-1).status, 'queued')
  await worker.processLuxorEmailJobs([{ ...claimed, attempts: 3 }], { markSending: false }); assert.equal(patches.at(-1).status, 'failed')
  await worker.processLuxorEmailJobs([zohoJob], { markSending: false }); assert.equal(patches.at(-1).status, 'failed')
  const deliveriesBeforeLegacy = deliveries
  await worker.processLuxorEmailJobs([{ ...claimed, job_type: 'contract_signature', metadata: { flow_stage: 'contract_completed' } }], { markSending: false })
  assert.equal(patches.at(-1).status, 'failed'); assert.match(patches.at(-1).last_error, /Legacy direct-send/)
  await worker.processLuxorEmailJobs([{ ...claimed, job_type: 'deposit_payment_confirmation', metadata: { includes_paid_invoice: true } }], { markSending: false })
  assert.equal(deliveries, deliveriesBeforeLegacy)
  console.log('PASS dedicated attachment delivery branch, exclusive claim, bounded Resend retries and no automatic Zoho retry')

  const invoice = { id: '22222222-2222-4222-8222-222222222222', invoice_kind: 'deposit',
    inquiry_id: '33333333-3333-4333-8333-333333333333', booking_id: '44444444-4444-4444-8444-444444444444', total: 100, line_items: [] }
  const inquiry = { id: invoice.inquiry_id, full_name: '<Guest>', email: 'guest@example.invalid', status: 'booked', metadata: {} }
  const booking = { id: invoice.booking_id, inquiry_id: inquiry.id, contract_status: 'signed', status: 'confirmed', deposit_required: 100,
    event_date: '2026-10-01', metadata: {}, client_name: 'Guest' }
  const noticesQueued = []; let invalidSignature = false; let queueFails = true; let paymentWrites = 0
  process.env.STRIPE_SECRET_KEY = 'offline-key'; process.env.STRIPE_WEBHOOK_SECRET = 'offline-webhook-key'
  const stripeRoute = load('src/app/api/stripe/webhook/route.ts', {
    'next/server': { NextResponse: Response },
    stripe: class { webhooks = { constructEvent: raw => {
      assert.equal(raw, 'original signed body')
      if (invalidSignature) throw new Error('Signature rejected')
      return { type: 'checkout.session.completed', data: { object: { id: 'cs_test_receipt', payment_status: 'paid', amount_total: 10000,
        metadata: { invoice_id: invoice.id, invoice_kind: 'deposit' } } } }
    } } },
    '@/lib/luxorInvoicesServer': { getInvoice: async () => invoice, listPaidPaymentsByInvoice: async () => [{ amount: 100 }],
      updateInvoice: async () => invoice, luxorFinalPaymentDueDate: () => null },
    '@/lib/supabaseRestServer': { supabaseRest: async (url, init) => {
      assert.match(url, /luxor_payments\?on_conflict=processor,processor_reference/)
      const data = JSON.parse(init.body); assert.equal(data.processor_reference, 'cs_test_receipt'); paymentWrites++
      return [{ id: 'payment', ...data }]
    } },
    '@/lib/luxorInquiriesServer': { getLuxorInquiry: async () => inquiry, updateLuxorInquiry: async () => inquiry },
    '@/lib/luxorBookingsServer': { getLuxorBooking: async () => booking, updateLuxorBooking: async () => booking },
    '@/lib/luxorNotesServer': { createNote: async () => {}, listNotesByInquiry: async () => [] },
    '@/lib/luxorEmailJobsServer': { cancelQueuedLuxorEmailJobs: async () => {} },
    '@/lib/luxorTextCampaignsServer': { queuePaymentConfirmationText: async () => {} },
    '@/lib/luxorPaymentOwnership': { luxorCollectionAmounts: () => ({ scoped: false }) },
    '@/lib/luxorInvoicePdfServer': { buildLuxorInvoicePdf: async () => input.pdf },
    '@/lib/luxorDocumentsServer': { saveLuxorInvoicePdf: async () => {} },
    '@/lib/luxorOffer': { hasLuxorOffer: () => false, isLuxorOfferExpired: () => false, luxorOfferSnapshot: () => ({ percent: 0, savings: 0 }) },
    '@/lib/luxorTransactionalNoticeServer': { queueLuxorTransactionalNotice: async args => {
      noticesQueued.push(args); if (queueFails) throw new Error('Private database detail'); return { id: 'queued-notice' }
    } },
  })
  const request = signature => new Request('https://luxor.example.invalid/api/stripe/webhook', {
    method: 'POST', headers: signature ? { 'stripe-signature': 'offline-signature' } : {}, body: 'original signed body',
  })
  assert.equal((await stripeRoute.POST(request(false))).status, 400); assert.equal(paymentWrites, 0)
  invalidSignature = true
  assert.equal((await stripeRoute.POST(request(true))).status, 400); assert.equal(paymentWrites, 0)
  invalidSignature = false
  const failedReceipt = await stripeRoute.POST(request(true))
  assert.equal(failedReceipt.status, 500); assert.doesNotMatch(await failedReceipt.text(), /Private database detail/)
  queueFails = false
  assert.equal((await stripeRoute.POST(request(true))).status, 200)
  assert.equal(noticesQueued.length, 2)
  assert.equal(noticesQueued[0].sourceId, noticesQueued[1].sourceId)
  assert.equal(noticesQueued[0].kind, 'paid_invoice'); assert.match(noticesQueued[0].html, /&lt;Guest&gt;/)
  assert.deepEqual(noticesQueued[0].pdf, input.pdf)
  assert.equal(noticesQueued[0].legacyAutomationKey, 'deposit_payment_confirmation:cs_test_receipt')
  console.log('PASS signed Stripe webhook gating, preserved payment identity, complete queued receipt/PDF, escaped name and retryable sanitized queue failures')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
