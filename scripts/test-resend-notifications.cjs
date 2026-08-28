/* Offline webhook/worker integration tests. No network, database, or email. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  process.env.LUXOR_MAIL_FROM = 'booking@luxoratlaspalmas.com'
  process.env.LUXOR_MAIL_ALLOWED_SENDERS = 'booking@luxoratlaspalmas.com'
  const event = { event_id: 'notification-fixture', attempts: 0, processed_at: null, lease_until: null,
    payload: { type: 'email.received', data: { email_id: 'provider-fixture' } } }
  let mail = null
  let inboxCreated = false
  let pushes = 0
  let broadcasts = 0
  const mockDb = { supabaseRest: async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null
    if (url.startsWith('luxor_resend_events?')) {
      if (init.method === 'PATCH') Object.assign(event, body)
      return [structuredClone(event)]
    }
    if (url.startsWith('luxor_mail_messages?')) {
      if (init.method === 'POST') mail ||= body
      if (init.method === 'PATCH') Object.assign(mail, body)
      return mail ? [structuredClone(mail)] : []
    }
    if (url.startsWith('luxor_email_events?')) {
      const created = !inboxCreated
      inboxCreated = true
      return created ? [{ id: 'arrival-fixture' }] : []
    }
    if (url.startsWith('luxor_mail_attachments?')) return []
    throw new Error(`Unexpected database path: ${url}`)
  } }
  const webhook = load('src/lib/luxorResendWebhookServer.ts', {
    './supabaseRestServer': mockDb,
    './luxorResendApiServer': { luxorResendApi: async () => ({ id: 'provider-fixture', from: 'guest@example.invalid',
      to: ['booking@luxoratlaspalmas.com'], cc: [], reply_to: [], subject: 'Notification test', text: 'Offline',
      html: null, message_id: '<fixture@example.invalid>', created_at: new Date().toISOString(), headers: {}, attachments: [], raw: null }) },
    './luxorZohoWebhookServer': { broadcastLuxorEmailArrival: async () => { broadcasts++ } },
    './luxorWebPushServer': { sendLuxorWebPush: async (_type, payload) => {
      assert.match(payload.url, /^\/portal\/emails\?messageId=mail-/)
      pushes++
      return { configured: true, sent: pushes > 1 ? 1 : 0, failed: pushes === 1 ? 1 : 0 }
    } },
  })
  await assert.rejects(() => webhook.processLuxorResendEvent(event.event_id), /notification delivery needs a retry/)
  assert.equal(inboxCreated, true)
  assert.equal(event.processed_at, null)
  assert.ok(event.next_attempt_at)
  assert.ok(mail.metadata.arrivalBroadcastAt)
  assert.equal(mail.metadata.arrivalPushAt, undefined)
  await webhook.processLuxorResendEvent(event.event_id)
  assert.equal(broadcasts, 1, 'Successful notification stage must not repeat')
  assert.equal(pushes, 2, 'Failed push must retry despite existing inbox event')
  assert.ok(event.processed_at)
  assert.ok(mail.metadata.arrivalPushAt)
  await webhook.processLuxorResendEvent(event.event_id)
  assert.equal(pushes, 2, 'Processed event replay must do nothing')
  console.log('PASS durable notification stages, failed-push recovery, inbox deduplication and completed-event replay')

  let queued = 0
  let deferred = 0
  let checks = 0
  let checkFails = false
  const heartbeats = []
  const cron = load('src/app/api/cron/email-jobs/route.ts', {
    'next/server': { NextResponse: Response, after: () => { deferred++ } },
    '@/lib/luxorEmailArchiveServer': { syncPendingLuxorEmailBodies: async () => { throw new Error('Health check must not sync') } },
    '@/lib/luxorEmailJobsServer': { processDueLuxorEmailJobs: async () => { queued++; return [] } },
    '@/lib/luxorWorkerHealthServer': { getLuxorWorkerHealth: async () => null,
      safelyRecordLuxorWorkerHealth: async (_worker, status) => { heartbeats.push(status) } },
    '@/lib/zohoMailServer': { isLuxorZohoAuthorizationError: () => false, verifyLuxorZohoMailConnection: async () => {
      checks++; if (checkFails) throw new Error('Offline Resend authorization failure')
    } },
    '@/lib/luxorResendWebhookServer': { processPendingLuxorResendEvents: async () => { throw new Error('Health check must not process inbound') } },
    '@/lib/luxorMailConfig': { luxorMailProvider: () => 'resend' },
  })
  process.env.LUXOR_EMAIL_CRON_SECRET = 'offline-test-secret'
  const request = { headers: new Headers({ 'x-cron-secret': 'offline-test-secret' }), nextUrl: new URL('https://example.invalid/api/cron/email-jobs?health=1') }
  assert.equal((await cron.POST({ ...request, headers: new Headers() })).status, 401)
  assert.equal(checks, 0)
  const healthy = await cron.POST(request)
  assert.equal(healthy.status, 200)
  assert.equal((await healthy.json()).processed, 0)
  assert.equal(heartbeats[0].metadata.provider, 'resend')
  checkFails = true
  const failed = await cron.POST(request)
  assert.equal(failed.status, 503)
  assert.equal((await failed.json()).code, 'RESEND_AUTHORIZATION_REQUIRED')
  assert.equal(heartbeats[1].metadata.reason, 'resend_authorization')
  assert.equal(queued, 0)
  assert.equal(deferred, 0)
  console.log('PASS authenticated cron health, provider-specific failures, durable heartbeats and strictly no-send/no-processing checks')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
