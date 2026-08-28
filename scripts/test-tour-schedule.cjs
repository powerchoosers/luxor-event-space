/* Offline: no credentials, live database, or email provider calls. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const inquiryId = '5553ca40-8e70-4af4-bd90-7234dd094dc7'
  const state = { title: 'Tour', description: 'Private appointment', location: 'Luxor', startUtc: new Date(Date.now() + 172800000).toISOString(),
    endUtc: new Date(Date.now() + 174600000).toISOString(), attendeeEmails: ['guest@example.invalid'], status: 'confirmed' }
  const baseEvent = { id: inquiryId, uid: 'tour@example.invalid', sequence: 3, state, status: 'confirmed' }
  let current = structuredClone(baseEvent)
  let inquiry = { status: 'tour_confirmed', tour_attendance_status: 'pending' }
  let attendee = { active: true, sequence: 3, partstat: 'NEEDS-ACTION' }
  let revision = { event_id: inquiryId, sequence: 3, state }
  const sends = []; const writes = []
  const server = load('src/lib/luxorTourScheduleServer.ts', {
    './luxorCalendarServer': { normalizedState: input => input, getLuxorCalendarEvent: async () => current },
    './supabaseRestServer': { supabaseRest: async (path, init) => {
      if (path.startsWith('rpc/')) { writes.push({ path, body: JSON.parse(init.body) }); return { replayed: true } }
      if (path.startsWith('luxor_calendar_revisions?')) return revision ? [revision] : []
      if (path.startsWith('luxor_inquiries?')) return inquiry ? [inquiry] : []
      if (path.startsWith('luxor_calendar_attendees?')) return attendee ? [attendee] : []
      throw new Error(`Unexpected DB access ${path}`)
    } },
    './luxorResendMailServer': { sendLuxorResendEmail: async input => { sends.push(input); return { messageId: 'sent-fixture' } } },
  })
  const input = { inquiry: { id: inquiryId }, expectedSequence: 3, state,
    tour: { meetingType: 'Tour', clientFacingNotes: '', responseToken: 'a'.repeat(32), assignees: [] },
    templates: { confirmation: { subject: 'Tour', body: 'Frozen' }, reminder_24: { subject: 'Tomorrow', body: 'Frozen' }, reminder_2: { subject: 'Soon', body: 'Frozen' } },
    requestedBy: 'owner@example.invalid' }
  assert.deepEqual(await server.saveLuxorTourSchedule(input), { replayed: true })
  assert.equal(writes.length, 1); assert.equal(writes[0].path, 'rpc/luxor_save_tour_schedule')
  assert.equal(writes[0].body.p_expected_sequence, 3)
  assert.deepEqual(writes[0].body.p_templates, input.templates)
  assert.equal(sends.length, 0, 'Scheduling only persists jobs')
  const job = { id: inquiryId, inquiry_id: inquiryId, job_type: 'tour_reminder', tour_notice: 'reminder_24', tour_revision_id: inquiryId,
    recipient_email: 'guest@example.invalid', subject: 'Frozen subject', body: 'Frozen body' }
  process.env.LUXOR_MAIL_PROVIDER = 'zoho'
  assert.equal((await server.deliverLuxorTourNotice(job)).status, 'sent')
  assert.equal(sends[0].idempotencyKey, `email-job/${job.id}`)
  assert.equal(sends[0].content, job.body)
  assert.equal(sends[0].metadata.calendarSequence, 3)
  sends.length = 0
  for (const changes of [{ sequence: 4 }, { status: 'cancelled' }, { id: 'wrong' }, { state: { ...state, startUtc: new Date(0).toISOString() } }]) {
    current = { ...baseEvent, ...changes }
    assert.equal((await server.deliverLuxorTourNotice(job)).status, 'skipped')
  }
  current = structuredClone(baseEvent)
  for (const status of ['attended', 'no_show', 'rescheduled', 'cancelled']) {
    inquiry.tour_attendance_status = status
    assert.equal((await server.deliverLuxorTourNotice(job)).status, 'skipped')
  }
  inquiry = { status: 'closed_lost', tour_attendance_status: 'pending' }
  assert.equal((await server.deliverLuxorTourNotice(job)).status, 'skipped')
  inquiry.status = 'tour_confirmed'
  for (const value of [null, { active: false, sequence: 3 }, { active: true, sequence: 2 }, { active: true, sequence: 3, partstat: 'DECLINED' }]) {
    attendee = value
    assert.equal((await server.deliverLuxorTourNotice(job)).status, 'skipped')
  }
  for (const changes of [{ tour_revision_id: null }, { tour_notice: 'unknown' }, { job_type: 'marketing_campaign' }, { recipient_email: 'wrong@example.invalid' }]) {
    await assert.rejects(() => server.deliverLuxorTourNotice({ ...job, ...changes }))
  }
  revision = null
  await assert.rejects(() => server.deliverLuxorTourNotice(job))
  assert.equal(sends.length, 0)
  console.log('PASS atomic RPC payload, provider-pinned frozen notices, stale/cancelled/elapsed/declined/removed guards and malformed jobs')

  let claimAllowed = true; let deliveryStatus = 'sent'; let delivered = 0
  const updates = []
  const worker = load('src/lib/luxorEmailJobsServer.ts', {
    './supabaseRestServer': { supabaseRest: async (path, init) => {
      assert.equal(init.method, 'PATCH')
      const patch = JSON.parse(init.body)
      if (path.includes('status=eq.queued') && !claimAllowed) return []
      updates.push(patch)
      return [{ ...job, metadata: {}, attempts: 0, ...patch }]
    } },
    './luxorInquiriesServer': { getLuxorInquiry: async () => ({ status: 'tour_confirmed' }) },
    './zohoMailServer': { sendLuxorZohoEmail: async () => { throw new Error('Tour notice reached generic provider') } },
    './luxorTourScheduleServer': { deliverLuxorTourNotice: async () => {
      delivered++
      if (deliveryStatus === 'error') throw new Error('Retryable fixture error')
      return { status: deliveryStatus }
    } },
    './luxorLifecycleEmailsServer': {}, './luxorInvoicesServer': {}, './luxorStripeCheckoutServer': {}, './luxorBookingsServer': {},
  })
  const queued = { ...job, metadata: {}, attempts: 0 }
  assert.equal((await worker.processLuxorEmailJobs([queued]))[0].status, 'sent')
  assert.equal(updates[0].attempts, 1); assert.equal(updates.at(-1).status, 'sent')
  claimAllowed = false
  assert.equal((await worker.processLuxorEmailJobs([queued]))[0].status, 'skipped')
  assert.equal(delivered, 1, 'Lost claim must not deliver')
  claimAllowed = true; deliveryStatus = 'skipped'
  await worker.processLuxorEmailJobs([queued]); assert.equal(updates.at(-1).status, 'cancelled')
  deliveryStatus = 'error'
  await worker.processLuxorEmailJobs([queued]); assert.equal(updates.at(-1).status, 'queued')
  assert.ok(Date.parse(updates.at(-1).scheduled_for) > Date.now())
  await worker.processLuxorEmailJobs([{ ...queued, attempts: 3 }], { markSending: false })
  assert.equal(updates.at(-1).status, 'failed')
  const deliveryCount = delivered
  await worker.processLuxorEmailJobs([{ ...queued, subject: '{{first_name}}' }], { markSending: false })
  assert.equal(delivered, deliveryCount, 'Unresolved placeholders must never be delivered')
  console.log('PASS queue claim fence, provider-specific dispatch, superseded cancellation, bounded retries and personalization guard')

  let provider = 'resend'; let existing = null; let replayed = false; let authenticated = true
  let schedules = 0; let zohoCreates = 0; let textJobs = 0; let notes = 0
  const lead = { id: inquiryId, full_name: 'Fixture Guest', email: 'guest@example.invalid', metadata: {}, tour_response_token: 'a'.repeat(32), status: 'new' }
  const route = load('src/app/api/tour-actions/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => authenticated ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorEmailJobsServer': { assertEmailHasNoUnresolvedPlaceholders: worker.assertEmailHasNoUnresolvedPlaceholders,
      getTourResponseLinks: () => ({ rescheduleUrl: 'https://example.invalid/tour/fixture' }),
      cancelQueuedTourEmailJobs: async () => {}, createLuxorEmailJob: async () => ({ id: 'legacy-job' }) },
    '@/lib/luxorInquiriesServer': { getLuxorInquiry: async () => lead, updateLuxorInquiry: async () => lead },
    '@/lib/luxorLeadEventsServer': {}, '@/lib/luxorInquiryTypes': {}, '@/lib/luxorTourCancellationServer': {},
    '@/lib/luxorNotesServer': { createNote: async () => { notes++ } },
    '@/lib/luxorTextCampaignsServer': { queueInquiryTextJobs: async () => { textJobs++ } },
    '@/lib/zohoMailServer': { createLuxorZohoCalendarEvent: async () => { zohoCreates++; return { eventId: 'zoho', eventUid: 'zoho' } } },
    '@/lib/luxorTourEmailServer': { buildAiTourConfirmationEmail: async () => input.templates.confirmation, buildTourReminderEmail: () => input.templates.reminder_24 },
    '@/lib/supabaseRestServer': { supabaseRest: async () => [] },
    '@/lib/luxorMailConfig': { luxorMailProvider: () => provider },
    '@/lib/luxorCalendarServer': { getLuxorCalendarEvent: async () => existing },
    '@/lib/luxorTourScheduleServer': { saveLuxorTourSchedule: async value => {
      schedules++; assert.equal(value.requestedBy, 'owner@example.invalid')
      assert.equal(value.expectedSequence, existing?.sequence ?? -1)
      return { event: baseEvent, inquiry: lead, replayed, confirmationJobs: [queued], reminderJobs: [] }
    } },
  })
  const request = () => new Request('https://example.invalid/api/tour-actions', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'schedule-tour', inquiryId, tourDate: '2099-08-28', tourTime: '10:00', requestedBy: 'forged@example.invalid' }) })
  authenticated = false
  assert.equal((await route.POST(request())).status, 401); assert.equal(schedules, 0)
  authenticated = true
  assert.equal((await route.POST(request())).status, 201)
  assert.equal(schedules, 1); assert.equal(zohoCreates, 0); assert.equal(textJobs, 1); assert.equal(notes, 1)
  replayed = true
  assert.equal((await route.POST(request())).status, 200)
  assert.equal(textJobs, 1); assert.equal(notes, 1, 'Replay must not duplicate secondary actions')
  provider = 'zoho'; existing = baseEvent
  assert.equal((await route.POST(request())).status, 200)
  assert.equal(zohoCreates, 0, 'Global rollback must retain the existing Resend event')
  existing = null
  assert.equal((await route.POST(request())).status, 201)
  assert.equal(zohoCreates, 1, 'Existing Zoho path stays available until cutover')
  console.log('PASS authenticated scheduling route, session-derived owner, replay response, no duplicate side effects and Zoho rollback continuity')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
