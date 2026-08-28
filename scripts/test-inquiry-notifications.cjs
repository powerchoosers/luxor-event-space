/* Offline only: model, mail provider, database and cron are isolated mocks. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const id = '77777777-7777-4777-8777-777777777777'
  const inserts = []; const acknowledgments = []
  const inquiries = load('src/lib/luxorInquiriesServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      assert.equal(url, 'luxor_inquiries?select=*')
      const row = JSON.parse(init.body); inserts.push(row)
      if ('budget' in row) throw new Error("Could not find the 'budget' column of 'luxor_inquiries' in the schema cache")
      return [{ id, ...row }]
    } },
    './luxorEmailJobsServer': {
      createLuxorEmailJob: async input => { acknowledgments.push(input); return { id } },
      buildStandardInquiryEmailHtml: () => '<p>Receipt</p>', listQueuedLuxorEmailJobsByIds: async () => [], processLuxorEmailJobs: async () => [],
    }, './luxorTextAutomationsServer': {}, './luxorTourSlotsServer': {},
  })
  await inquiries.createLuxorInquiry({ fullName: 'Guest', phone: '2105550100', metadata: { internal_notification_requested: false } })
  assert.equal(inserts.length, 2)
  assert.ok(inserts.every(row => row.internal_notification_requested === true), 'Server-controlled marker must survive optional-column retry')
  await inquiries.createLuxorInquiry({ fullName: 'Guest', email: 'guest@example.invalid' })
  assert.equal(acknowledgments[0].metadata.ignore_suppressions, true, 'A requested inquiry receipt is not a promotional opt-in')
  const base = { id, inquiry_id: id, job_type: 'inquiry_notification', status: 'sending', attempts: 1,
    recipient_email: 'owner@example.invalid', subject: 'New inquiry', body: 'Pending', metadata: {
      inquirySnapshot: { id, full_name: '<Guest>', email: 'guest@example.invalid', event_type: 'Quinceañera', message: '<script>test</script>', metadata: { chatMessages: 'malformed' } },
    } }
  let stored = structuredClone(base); let modelCalls = 0; let lostClaim = false; let sendFails = true
  const sends = []; const writes = []; const zohoSends = []
  const originalFetch = global.fetch; const previousKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'offline-test-only'; process.env.LUXOR_MAIL_PROVIDER = 'resend'
  global.fetch = async (_url, options) => {
    modelCalls++; assert.ok(options.signal); return { ok: false, status: 503 }
  }
  const notifications = load('src/lib/luxorNotificationEmails.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      assert.ok(url.includes('status=eq.sending&attempts=eq.1'))
      writes.push(JSON.parse(init.body))
      if (lostClaim) return []
      stored = { ...stored, ...writes.at(-1) }; return [structuredClone(stored)]
    } },
    './luxorResendMailServer': { sendLuxorResendEmail: async input => { sends.push(input); if (sendFails) throw new Error('Transport timeout') } },
    './zohoMailServer': { sendLuxorZohoEmail: async input => { zohoSends.push(input) } },
  })
  try {
    await assert.rejects(() => notifications.deliverLuxorInquiryNotification(base), /Transport timeout/)
    assert.equal(stored.metadata.notificationRendered, true); assert.equal(stored.metadata.notificationProvider, 'resend')
    assert.match(stored.body, /&lt;Guest&gt;/); assert.match(stored.body, /&lt;script&gt;/)
    assert.match(stored.body, /Quinceañera/); assert.match(stored.body, /width:100%;max-width:600px/)
    assert.match(stored.body, /AI Summary failed to generate/)
    sendFails = false; process.env.LUXOR_MAIL_PROVIDER = 'zoho'
    await notifications.deliverLuxorInquiryNotification(stored)
    assert.equal(modelCalls, 1, 'Retry must not rebuild the model summary or email')
    assert.equal(writes.length, 1); assert.deepEqual(sends[0], sends[1]); assert.equal(sends[0].idempotencyKey, `email-job/${id}`)
    lostClaim = true
    await assert.rejects(() => notifications.deliverLuxorInquiryNotification(base), /claim changed/)
    assert.equal(sends.length, 2)
    await assert.rejects(() => notifications.deliverLuxorInquiryNotification({ ...base, status: 'queued' }), /claimed/)
    process.env.LUXOR_MAIL_PROVIDER = 'resend'
    await assert.rejects(() => notifications.deliverLuxorInquiryNotification({ ...stored, metadata: { ...stored.metadata, notificationProvider: 'zoho' } }), /unfinished Zoho/)
    assert.equal(sends.length, 2)
    assert.equal(zohoSends.length, 0)
    process.env.LUXOR_MAIL_PROVIDER = 'zoho'
    await notifications.deliverLuxorInquiryNotification({ ...stored, metadata: { ...stored.metadata, notificationProvider: 'zoho' } })
    assert.equal(zohoSends.length, 1); assert.equal(zohoSends[0].content, stored.body)
    assert.equal(zohoSends[0].from, 'booking@luxoratlaspalmas.com')
  } finally {
    global.fetch = originalFetch
    if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = previousKey
  }
  console.log('PASS server-controlled atomic alert request, optional-column retry, bounded summary fallback, escaped fluid template, frozen retries and provider pinning')

  process.env.LUXOR_MAIL_PROVIDER = 'resend'
  let allowClaim = true; let deliveryFails = false; let deliveries = 0; const patches = []
  const worker = load('src/lib/luxorEmailJobsServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      if (url === 'rpc/luxor_claim_inquiry_notification_jobs') return [structuredClone(base)]
      const patch = JSON.parse(init.body)
      if (url.includes('status=eq.queued') && !allowClaim) return []
      patches.push(patch); return [{ ...base, ...patch }]
    } },
    './luxorNotificationEmails': { deliverLuxorInquiryNotification: async () => { deliveries++; if (deliveryFails) throw new Error('Delivery unavailable'); return { status: 'sent' } } },
    './luxorInquiriesServer': { getLuxorInquiry: async () => ({ status: 'closed_lost' }) },
    './zohoMailServer': { sendLuxorZohoEmail: async () => { throw new Error('Internal alert reached generic delivery') } },
    './luxorLifecycleEmailsServer': {}, './luxorInvoicesServer': {}, './luxorStripeCheckoutServer': {}, './luxorBookingsServer': {},
  })
  assert.equal((await worker.processDueLuxorInquiryNotifications())[0].status, 'sent')
  assert.equal(deliveries, 1, 'Owner alert is not a customer follow-up to a closed lead')
  allowClaim = false
  await worker.processLuxorEmailJobs([{ ...base, status: 'queued' }]); assert.equal(deliveries, 1)
  allowClaim = true; deliveryFails = true
  await worker.processLuxorEmailJobs([{ ...base, metadata: { notificationProvider: 'resend' } }], { markSending: false })
  assert.equal(patches.at(-1).status, 'queued')
  await worker.processLuxorEmailJobs([{ ...base, attempts: 3, metadata: { notificationProvider: 'resend' } }], { markSending: false })
  assert.equal(patches.at(-1).status, 'failed')
  await worker.processLuxorEmailJobs([{ ...base, metadata: { notificationProvider: 'zoho' } }], { markSending: false })
  assert.equal(patches.at(-1).status, 'failed', 'Non-idempotent Zoho failure requires delivery review')

  const RealDate = Date; let timestamp = Date.parse('2026-08-28T06:17:00Z')
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [timestamp])) } static now() { return timestamp } }
  let internalRuns = 0; let customerRuns = 0; let providerChecks = 0; let internalHasWork = true; const heartbeats = []
  const cron = load('src/app/api/cron/email-jobs/route.ts', {
    'next/server': { NextResponse: Response, after: () => {} },
    '@/lib/luxorEmailArchiveServer': {},
    '@/lib/luxorEmailJobsServer': {
      processDueLuxorInquiryNotifications: async () => { internalRuns++; return internalHasWork ? [{ id, status: 'sent' }] : [] },
      processDueLuxorEmailJobs: async () => { customerRuns++; return [] },
    },
    '@/lib/luxorWorkerHealthServer': { getLuxorWorkerHealth: async () => null, safelyRecordLuxorWorkerHealth: async (_worker, result) => { heartbeats.push(result) } },
    '@/lib/zohoMailServer': { verifyLuxorZohoMailConnection: async () => { providerChecks++ }, isLuxorZohoAuthorizationError: () => false },
    '@/lib/luxorResendWebhookServer': {}, '@/lib/luxorMailConfig': { luxorMailProvider: () => 'resend' },
  })
  process.env.LUXOR_EMAIL_CRON_SECRET = 'offline-only'
  const request = { headers: new Headers({ 'x-cron-secret': 'offline-only' }), nextUrl: new URL('https://example.invalid/api/cron/email-jobs') }
  let queueKind = 'inquiry_notification'
  const queueStatus = load('src/app/api/email/queue-status/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'owner@example.invalid' }) },
    '@/lib/supabaseRestServer': { supabaseRest: async () => [{ job_type: queueKind, status: 'queued', recipient_email: 'owner@example.invalid',
      subject: 'Offline', created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z', scheduled_for: '2026-08-27T00:00:00Z' }] },
    '@/lib/luxorWorkerHealthServer': { getLuxorWorkerHealth: async () => null },
    '@/lib/luxorMailConfig': { luxorMailProvider: () => 'resend' },
  })
  try {
    assert.equal((await cron.POST({ ...request, headers: new Headers() })).status, 401)
    assert.equal(internalRuns, 0)
    const overnight = await (await cron.POST(request)).json()
    assert.equal(internalRuns, 1); assert.equal(customerRuns, 0); assert.equal(overnight.processed, 1)
    assert.equal(heartbeats.at(-1).status, 'healthy')
    assert.equal((await (await queueStatus.GET()).json()).worker.stalled, true)
    queueKind = 'tour_confirmation'
    assert.equal((await (await queueStatus.GET()).json()).worker.stalled, false, 'Customer-only queues remain idle overnight')
    timestamp = RealDate.parse('2026-08-28T18:17:00Z')
    await cron.POST(request); assert.equal(internalRuns, 2); assert.equal(customerRuns, 0, 'Only one send per cron runtime')
    internalHasWork = false
    await cron.POST(request); assert.equal(internalRuns, 3); assert.equal(customerRuns, 1)
    request.nextUrl.searchParams.set('health', '1')
    await cron.POST(request); assert.equal(internalRuns, 3); assert.equal(customerRuns, 1); assert.equal(providerChecks, 1)
  } finally { global.Date = RealDate }
  console.log('PASS exclusive internal dispatch, bounded idempotent retries, overnight alerts, unchanged customer window and no-send health checks')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
