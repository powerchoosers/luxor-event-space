/* Offline orchestration: no database, provider, credentials or real messages. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const campaignId = '11111111-1111-4111-8111-111111111111'
  let suppressions = []; let ignore = false; let reads = 0; const results = []
  const helper = load('src/lib/luxorMarketingDeliveryServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      if (url.startsWith('luxor_marketing_suppressions?')) {
        assert.ok(url.includes('email=eq.guest%40example.invalid')); return suppressions
      }
      if (url.startsWith('luxor_marketing_campaigns?')) { reads++; return [{ metadata: { ignore_suppressions: ignore } }] }
      if (url === 'rpc/luxor_marketing_job_result') { results.push(JSON.parse(init.body)); return null }
      throw new Error(`Unexpected query: ${url}`)
    } },
  })
  assert.equal(await helper.isLuxorMarketingDeliveryBlocked(' Guest@Example.invalid '), false)
  suppressions = [{ reason: 'unsubscribe', metadata: {} }]
  assert.equal(await helper.isLuxorMarketingDeliveryBlocked('guest@example.invalid'), true)
  assert.equal(await helper.isLuxorMarketingDeliveryBlocked('guest@example.invalid', true), false)
  assert.equal(await helper.isLuxorMarketingDeliveryBlocked('guest@example.invalid', false, campaignId), true)
  ignore = true
  assert.equal(await helper.isLuxorMarketingDeliveryBlocked('guest@example.invalid', false, campaignId), false)
  const savedReads = reads
  for (const row of [{ reason: 'hard_bounce' }, { reason: 'spam_complaint' }, { reason: 'provider_suppressed' }, { reason: 'unsubscribe', metadata: { blockMarketingDelivery: true } }]) {
    suppressions = [row]
    assert.equal(await helper.isLuxorMarketingDeliveryBlocked('guest@example.invalid', true, campaignId), true)
  }
  assert.equal(reads, savedReads, 'Hard blocks never consult an override')
  await helper.recordLuxorMarketingJobResult(campaignId, 'cancelled', 'Suppressed')
  assert.deepEqual(results.pop(), { p_job_id: campaignId, p_status: 'cancelled', p_error: 'Suppressed' })

  let blocked = true; let sends = 0; let guardFails = false
  const updates = []; const workerResults = []; const guardCalls = []
  const worker = load('src/lib/luxorEmailJobsServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      assert.ok(url.startsWith('luxor_email_jobs?')); updates.push(JSON.parse(init.body)); return [{ id: campaignId, ...updates.at(-1) }]
    } },
    './luxorMarketingDeliveryServer': {
      isLuxorMarketingDeliveryBlocked: async (...args) => { guardCalls.push(args); if (guardFails) throw new Error('Cannot verify suppression'); return blocked },
      recordLuxorMarketingJobResult: async (...args) => { workerResults.push(args) },
    },
    './zohoMailServer': { sendLuxorZohoEmail: async () => { sends++ } },
    './luxorLifecycleEmailsServer': {}, './luxorInvoicesServer': {}, './luxorStripeCheckoutServer': {}, './luxorBookingsServer': {}, './luxorInquiriesServer': {},
  })
  const job = { id: campaignId, job_type: 'marketing_campaign', recipient_email: 'guest@example.invalid', subject: 'Offline', body: 'Offline', metadata: { campaign_id: campaignId }, attempts: 0 }
  assert.equal((await worker.processLuxorEmailJobs([job]))[0].status, 'skipped')
  assert.equal(sends, 0); assert.equal(updates.at(-1).status, 'cancelled'); assert.equal(workerResults.at(-1)[1], 'cancelled')
  assert.deepEqual(guardCalls[0], ['guest@example.invalid', false, campaignId])
  guardFails = true
  assert.equal((await worker.processLuxorEmailJobs([job]))[0].status, 'failed'); assert.equal(sends, 0, 'Failed suppression lookup must fail closed')
  guardFails = false; blocked = false
  assert.equal((await worker.processLuxorEmailJobs([job]))[0].status, 'sent'); assert.equal(sends, 1)
  const guardCount = guardCalls.length
  await worker.processLuxorEmailJobs([{ ...job, job_type: 'tour_confirmation' }])
  assert.equal(guardCalls.length, guardCount, 'Marketing suppression must not silently cancel transactional tours')
  console.log('PASS suppression normalization, non-bypassable provider blocks, saved explicit exceptions and send-time fail-closed worker guard')

  const event = { event_id: 'offline-event', attempts: 0, processed_at: null, lease_until: null,
    payload: { type: 'email.bounced', created_at: '2026-08-28T12:00:00Z', data: { email_id: 'provider-id' } } }
  const mail = { id: campaignId, status: 'sent', accepted_at: '2026-08-28T11:00:00Z', provider_id: 'provider-id' }
  let rpcFails = true; let rpcCalls = 0
  const webhook = load('src/lib/luxorResendWebhookServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init = {}) => {
      const body = init.body && JSON.parse(init.body)
      if (url.startsWith('luxor_resend_events?')) { if (init.method === 'PATCH') Object.assign(event, body); return [structuredClone(event)] }
      if (url.startsWith('luxor_mail_messages?')) { if (init.method === 'PATCH') Object.assign(mail, body); return [structuredClone(mail)] }
      if (url === 'rpc/luxor_resend_marketing_delivery') {
        rpcCalls++; assert.deepEqual(body, { p_message_id: mail.id, p_event_id: event.event_id })
        if (rpcFails) throw new Error('Transient campaign write failure')
        return null
      }
      throw new Error(`Unexpected webhook query: ${url}`)
    } },
    './luxorResendApiServer': { luxorResendApi: async () => ({ id: 'provider-id', message_id: '<offline@example.invalid>' }) },
    './luxorZohoWebhookServer': {}, './luxorWebPushServer': {},
  })
  await assert.rejects(() => webhook.processLuxorResendEvent(event.event_id), /Transient campaign/)
  assert.equal(mail.status, 'bounced'); assert.equal(event.processed_at, null); assert.ok(event.next_attempt_at)
  rpcFails = false
  await webhook.processLuxorResendEvent(event.event_id)
  assert.ok(event.processed_at); assert.equal(rpcCalls, 2)
  await webhook.processLuxorResendEvent(event.event_id); assert.equal(rpcCalls, 2)
  event.processed_at = null; event.payload.type = 'email.sent'
  await webhook.processLuxorResendEvent(event.event_id)
  assert.equal(mail.status, 'bounced', 'Older sent event must not overwrite a bounce')
  console.log('PASS delivery effect retry checkpoint, completed-event replay and out-of-order webhook handling')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
