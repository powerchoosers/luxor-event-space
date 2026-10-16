import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getRecipientBounceEvidence, isCorrectedPaymentResendStage, isLeadEmailResendStage, rankCorrectEmailResendOptions } from '../src/lib/luxorLeadEmailResend.ts'
import { canSendCorrectedPaymentReminder, claimAndProcessCorrectedPaymentResend, correctedPaymentReminderKind, runCorrectedPaymentResend } from '../src/lib/luxorCorrectedPaymentResend.ts'
import { runProposalResendOperation } from '../src/lib/luxorProposalResendOperation.ts'

const sql = await readFile(new URL('../supabase/migrations/20261015060000_unified_lead_email_resend.sql', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/app/api/leads/[id]/correct-email-resend/route.ts', import.meta.url), 'utf8')
const paymentRoute = await readFile(new URL('../src/app/api/invoices/[id]/remind/route.ts', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../src/components/portal/CorrectEmailResendDialog.tsx', import.meta.url), 'utf8')
const worker = await readFile(new URL('../src/lib/luxorEmailJobsServer.ts', import.meta.url), 'utf8')
const tourSql = await readFile(new URL('../supabase/migrations/20261009010000_safe_lead_email_correction_and_tour_resend.sql', import.meta.url), 'utf8')
const dueClaims = await readFile(new URL('../supabase/migrations/20261015010000_permanent_test_lead_runs.sql', import.meta.url), 'utf8')
const sequenceRetarget = await readFile(new URL('../supabase/migrations/20261016010000_retarget_all_future_sequence_emails.sql', import.meta.url), 'utf8')
const calendarLifecycleSql = await readFile(new URL('../supabase/migrations/20260828033511_luxor_calendar_lifecycle.sql', import.meta.url), 'utf8')
const inquiryRoute = await readFile(new URL('../src/app/api/inquiries/route.ts', import.meta.url), 'utf8')
const leadPage = await readFile(new URL('../src/app/(portal)/portal/leads/[id]/page.tsx', import.meta.url), 'utf8')
const emailJobTypes = await readFile(new URL('../src/lib/luxorInquiryTypes.ts', import.meta.url), 'utf8')

function createSequenceRecipientStore({ lead, booking, jobs = [], now = Date.parse('2026-10-16T12:00:00Z') }) {
  let tail = Promise.resolve()
  const state = { lead: structuredClone(lead), booking: structuredClone(booking), jobs: structuredClone(jobs) }

  async function withLeadLock(work) {
    const prior = tail
    let release
    tail = new Promise((resolve) => { release = resolve })
    await prior
    try { return await work() } finally { release() }
  }

  function stageEligible(job) {
    if (state.lead.is_test) return false
    const lead = state.lead
    if (job.job_type === 'marketing_campaign') {
      return ['new', 'contacted', 'tour_requested', 'tour_confirmed'].includes(lead.status)
        && ['newsletter', 'inquiry', 'tour'].includes(lead.pipeline_stage || 'inquiry')
        && lead.marketing_opt_in === true && job.metadata.automation_key === 'brochure_lead'
        && Boolean(job.automation_enrollment_id && job.automation_step_key)
    }
    if (!state.booking || state.booking.id !== job.booking_id || state.booking.inquiry_id !== lead.id || lead.status !== 'booked') return false
    if (['event_details_reminder', 'event_day_reminder'].includes(job.job_type)) {
      return ['planning', 'final_payment', 'event'].includes(lead.pipeline_stage)
        && !['cancelled', 'completed'].includes(state.booking.status)
        && Boolean(state.booking.metadata.planning_completed_at)
        && job.metadata.event_date === state.booking.event_date
        && job.metadata.automation_key === `${job.job_type}:${state.booking.id}`
    }
    return job.job_type === 'post_event_follow_up'
      && ['event', 'closing'].includes(lead.pipeline_stage)
      && state.booking.status === 'completed'
      && job.metadata.automation_key === `post_event_follow_up:${state.booking.id}`
  }

  function eligible(job) {
    return job.status === 'queued' && Number(job.attempts || 0) === 0 && stageEligible(job)
  }

  return {
    state,
    enqueue(job, { beforeCommit } = {}) {
      return withLeadLock(async () => {
        if (beforeCommit) await beforeCommit()
        const inserted = structuredClone(job)
        if (eligible(inserted) && inserted.recipient_email.toLowerCase() !== state.lead.email.toLowerCase()) {
          const from = inserted.recipient_email
          inserted.recipient_email = state.lead.email.toLowerCase()
          inserted.metadata.email_correction_history = [
            ...(inserted.metadata.email_correction_history || []),
            { from, to: inserted.recipient_email, source: 'enqueue_sync' },
          ]
        }
        state.jobs.push(inserted)
        return inserted
      })
    },
    correctEmail(email) {
      return withLeadLock(async () => {
        for (const job of state.jobs.filter((candidate) =>
          candidate.recipient_email.toLowerCase() === state.lead.email.toLowerCase()
          && ['queued', 'sending'].includes(candidate.status) && stageEligible(candidate))) {
          if (job.status === 'sending') throw new Error('sending')
          if (Number(job.attempts || 0) > 0) throw new Error('attempted')
          if (Date.parse(job.scheduled_for) <= now) throw new Error('due')
        }
        for (const job of state.jobs) {
          if (job.recipient_email.toLowerCase() === state.lead.email.toLowerCase()
            && Date.parse(job.scheduled_for) > now && eligible(job)) {
            const from = job.recipient_email
            job.recipient_email = email.toLowerCase()
            job.metadata.email_correction_history = [
              ...(job.metadata.email_correction_history || []),
              { from, to: job.recipient_email, source: 'correction' },
            ]
          }
        }
        state.lead.email = email
      })
    },
  }
}

function sequenceFixture(jobType) {
  const lead = { id: 'lead-1', email: 'old@example.com', is_test: false, status: 'new', pipeline_stage: 'inquiry', marketing_opt_in: true }
  const booking = { id: 'booking-1', inquiry_id: 'lead-1', status: 'booked', event_date: '2027-04-20', metadata: { planning_completed_at: '2026-09-01' } }
  const job = {
    id: `job-${jobType}`, inquiry_id: 'lead-1', booking_id: ['event_details_reminder', 'event_day_reminder', 'post_event_follow_up'].includes(jobType) ? booking.id : null,
    job_type: jobType, status: 'queued', attempts: 0, scheduled_for: '2026-11-01T12:00:00Z', recipient_email: lead.email,
    automation_enrollment_id: jobType === 'marketing_campaign' ? 'enrollment-1' : null,
    automation_step_key: jobType === 'marketing_campaign' ? 'email_2' : null,
    metadata: jobType === 'marketing_campaign' ? { automation_key: 'brochure_lead' }
      : jobType === 'post_event_follow_up' ? { automation_key: 'post_event_follow_up:booking-1' }
        : { automation_key: `${jobType}:booking-1`, event_date: booking.event_date },
    subject: 'Keep this subject', body: 'Keep this saved content',
  }
  if (jobType !== 'marketing_campaign') {
    lead.status = 'booked'
    lead.pipeline_stage = jobType === 'post_event_follow_up' ? 'closing' : 'planning'
  }
  if (jobType === 'post_event_follow_up') booking.status = 'completed'
  return { lead, booking, job }
}

test('latest relevant bounce ranks ahead of a newer non-bounced message', () => {
  const ranked = rankCorrectEmailResendOptions([
    { id: 'recent', bounced: false, sentAt: '2026-10-15T09:00:00Z', bounceAt: null },
    { id: 'bounce', bounced: true, sentAt: '2026-10-01T09:00:00Z', bounceAt: '2026-10-02T09:00:00Z' },
  ])
  assert.equal(ranked[0].id, 'bounce')
})

test('bounce evidence follows the exact recipient and message time, not unrelated mail', () => {
  const rows = [
    { id: 'bounce', status: 'bounced', occurred_at: '2026-10-15T09:00:00Z', accepted_at: '2026-10-15T08:55:00Z', to_addresses: ['bad@example.com'] },
    { id: 'other', status: 'delivered', occurred_at: '2026-10-15T10:00:00Z', to_addresses: ['other@example.com'] },
  ]
  assert.deepEqual(getRecipientBounceEvidence(rows, 'BAD@example.com'), { bounced: true, bounceAt: '2026-10-15T09:00:00Z' })
  assert.deepEqual(getRecipientBounceEvidence(rows, 'missing@example.com'), { bounced: false, bounceAt: null })
})

test('later successful delivery to the same address replaces an earlier bounce', () => {
  assert.deepEqual(getRecipientBounceEvidence([
    { id: 'bounce', status: 'bounced', occurred_at: '2026-10-15T09:00:00Z', to_addresses: ['lead@example.com'] },
    { id: 'success', status: 'delivered', occurred_at: '2026-10-15T10:00:00Z', to_addresses: ['lead@example.com'] },
  ], 'lead@example.com'), { bounced: false, bounceAt: null })
})

test('lead-stage eligibility matches the shared pre-proposal and booked gates', () => {
  assert.equal(isLeadEmailResendStage({ status: 'tour_confirmed', pipeline_stage: 'tour' }), true)
  assert.equal(isLeadEmailResendStage({ status: 'tour_confirmed', pipeline_stage: '' }), false)
  assert.equal(isLeadEmailResendStage({ status: 'booked', pipeline_stage: 'deposit' }), true)
  assert.equal(isLeadEmailResendStage({ status: 'closed_lost', pipeline_stage: 'inquiry' }), false)
})

test('successful replacement to current recipient suppresses obsolete proposal snapshots', () => {
  assert.match(route, /successfulCorrection/)
  assert.match(route, /Boolean\(row\.accepted_at\).*delivered.*opened.*clicked/s)
  assert.match(route, /supersedes_invoice_id/)
})

test('address-only save remains separate from deliberate send', () => {
  assert.match(dialog, /Saving the address does not send/)
  assert.match(dialog, /Save address/)
  assert.match(dialog, /expectedRecipient: normalizedEmail/)
})

test('proposal and agreement resends use their guarded dedicated delivery engines', () => {
  assert.match(route, /approved-proposal-resend/)
  assert.match(route, /send-agreement/)
  assert.match(route, /signature\.client_email\.trim\(\)\.toLowerCase\(\) === email/)
  assert.match(route, /This agreement is signed and cannot be resent/)
  assert.match(route, /correctedEmailResend/)
  assert.doesNotMatch(route, /approvals.length !== 1\) return null/)
})

test('corrected resend queue binds recipient and immutable source content with idempotency', () => {
  assert.match(sql, /corrected_email_resend_request_id/)
  assert.match(sql, /corrected_email_resend_snapshot_subject/)
  assert.match(sql, /corrected_email_resend_snapshot_body/)
  assert.match(sql, /lower\(btrim\(coalesce\(inquiry\.email,''\)\)\)<>lower\(job\.recipient_email\)/)
  assert.match(worker, /luxor_claim_corrected_email_resend/)
  assert.match(worker, /provider accepted this delivery, but its queue status could not be confirmed/)
})

test('previous address trigger only retargets opted-in active brochure follow-ups and preflights unique indexes', () => {
  assert.match(sql, /Duplicate corrected email resend request IDs exist/)
  assert.match(sql, /Duplicate corrected email resend source\/recipient pairs exist/)
  assert.match(sql, /job_type='marketing_campaign'/)
  assert.match(sql, /metadata->>'automation_key'='brochure_lead'/)
  assert.match(sql, /new\.marketing_opt_in is true/)
  assert.match(sql, /automation_enrollment_id is not null and automation_step_key is not null/)
})

test('email correction retargets eligible brochure, planning/event, and post-event sequences only', () => {
  assert.match(sequenceRetarget, /job_type='marketing_campaign'[\s\S]*metadata->>'automation_key'='brochure_lead'/)
  assert.match(sequenceRetarget, /new\.marketing_opt_in is true/)
  assert.match(sequenceRetarget, /j\.automation_enrollment_id is not null and j\.automation_step_key is not null/)
  assert.match(sequenceRetarget, /j\.job_type in \('event_details_reminder','event_day_reminder'\)/)
  assert.match(sequenceRetarget, /new\.status='booked'[\s\S]*new\.pipeline_stage in \('planning','final_payment','event'\)/)
  assert.match(sequenceRetarget, /planning_completed_at[\s\S]*j\.metadata->>'event_date'=b\.event_date::text/)
  assert.match(sequenceRetarget, /new\.pipeline_stage in \('event','closing'\)[\s\S]*j\.job_type='post_event_follow_up'[\s\S]*b\.status='completed'/)
  assert.match(sequenceRetarget, /automation_key.*j\.job_type\|\|':'\|\|j\.booking_id::text/)
  assert.match(sequenceRetarget, /j\.status='queued' and coalesce\(j\.attempts,0\)=0 and j\.scheduled_for>now\(\)/)
  assert.match(sequenceRetarget, /set recipient_email=lower\(btrim\(new\.email\)\),updated_at=now\(\)/)
  assert.match(sequenceRetarget, /email_correction_history[\s\S]*job\.recipient_email[\s\S]*'to',lower\(btrim\(new\.email\)\)/)
  assert.doesNotMatch(sequenceRetarget, /tour_reminder|contract_signature|final_payment_request|unpaid_invoice_reminder/)
  assert.doesNotMatch(sequenceRetarget, /set scheduled_for|set subject|set body|automation_enrollment_id=|automation_step_key=/)
})

test('email correction fails closed for claimed, attempted, and due jobs before retargeting', () => {
  assert.match(sequenceRetarget, /j\.status='queued' and coalesce\(j\.attempts,0\)=0 and j\.scheduled_for>now\(\)/)
  assert.match(sequenceRetarget, /where id=job\.id and status='queued' and coalesce\(attempts,0\)=0 and scheduled_for>now\(\)/)
  assert.match(sequenceRetarget, /if not found then raise exception 'A lead email started sending/)
  assert.match(sequenceRetarget, /status in \('queued','sending'\)[\s\S]*corrected_email_resend_request_id[\s\S]*raise exception 'A corrected email resend is already queued or sending/)
})

test('the normal portal email correction routes through the RPC that applies calendar revision safeguards', () => {
  assert.match(inquiryRoute, /typeof updates\.email === 'string'[\s\S]*rpc\/luxor_update_inquiry_email_for_portal/)
  assert.match(leadPage, /const emailChange = fieldKey === 'email'[\s\S]*fetch\('\/api\/inquiries'/)
  assert.match(tourSql, /update public\.luxor_email_jobs set tour_revision_id=new_revision\.id,[\s\S]*where inquiry_id=p_inquiry_id and tour_revision_id=old_revision\.id and job_type='tour_reminder'[\s\S]*status='queued' and attempts=0 and scheduled_for>stamp/)
  assert.match(tourSql, /'attendeeEmail',new_email/)
  assert.match(tourSql, /prepared_tour_email_resend.*awaiting_owner_confirmation/s)
  assert.match(sequenceRetarget, /j\.calendar_revision_id=previous_revision\.id[\s\S]*j\.calendar_method='REQUEST'[\s\S]*j\.status='queued'[\s\S]*coalesce\(j\.attempts,0\)=0/)
  assert.match(sequenceRetarget, /prepared_tour_email_resend[\s\S]*continue;/)
  assert.match(sequenceRetarget, /calendar_revision_id=current_revision\.id[\s\S]*email_correction_history/)
})

test('calendar correction keeps a queued REQUEST stale when a sent confirmation will create a replacement', () => {
  assert.match(calendarLifecycleSql, /create unique index luxor_calendar_delivery_unique on public\.luxor_email_jobs\(calendar_revision_id, recipient_email, calendar_method\)/)
  assert.match(sequenceRetarget, /sent_job\.status='sent'[\s\S]*sent_job\.sent_at>=now\(\)-interval '30 days'[\s\S]*sent_job\.metadata->>'delivery'='branded_confirmation'[\s\S]*\(sent_revision\.state-'attendeeEmails'\)=\(event\.state-'attendeeEmails'\)/)

  const previousRevision = 7
  const currentRevision = previousRevision + 1
  const queuedOldRequest = { calendar_revision_id: previousRevision, recipient_email: 'old@example.com', calendar_method: 'REQUEST', status: 'queued' }
  const sentConfirmation = { status: 'sent', sent_at: Date.parse('2026-10-01T12:00:00Z'), contentMatches: true }
  const createsOwnerConfirmedReplacement = sentConfirmation.status === 'sent'
    && sentConfirmation.sent_at >= Date.parse('2026-09-16T12:00:00Z')
    && sentConfirmation.contentMatches
  const safeQueuedRequest = { ...queuedOldRequest }
  if (!createsOwnerConfirmedReplacement) {
    safeQueuedRequest.calendar_revision_id = currentRevision
    safeQueuedRequest.recipient_email = 'new@example.com'
  }
  const preparedReplacement = { calendar_revision_id: currentRevision, recipient_email: 'new@example.com', calendar_method: 'REQUEST', status: 'cancelled' }
  const deliveryKeys = [safeQueuedRequest, preparedReplacement].map((job) => `${job.calendar_revision_id}|${job.recipient_email}|${job.calendar_method}`)
  assert.equal(new Set(deliveryKeys).size, 2, 'the current-revision owner-confirmable replacement does not collide with the queued old revision')
  assert.equal(safeQueuedRequest.calendar_revision_id, previousRevision)
  assert.equal(safeQueuedRequest.recipient_email, 'old@example.com')

  const unsafeQueuedRequest = { ...queuedOldRequest, calendar_revision_id: currentRevision, recipient_email: 'new@example.com' }
  const unsafeKeys = [unsafeQueuedRequest, preparedReplacement].map((job) => `${job.calendar_revision_id}|${job.recipient_email}|${job.calendar_method}`)
  assert.equal(new Set(unsafeKeys).size, 1, 'retargeting first would violate the unique delivery key, including cancelled rows')
})

test('sequence enqueue and correction serialize in either order and keep the queued recipient current', async () => {
  for (const jobType of ['marketing_campaign', 'event_details_reminder', 'event_day_reminder', 'post_event_follow_up']) {
    const firstFixture = sequenceFixture(jobType)
    const correctionWins = createSequenceRecipientStore(firstFixture)
    await correctionWins.correctEmail('new@example.com')
    const afterCorrectionEnqueue = await correctionWins.enqueue(firstFixture.job)
    assert.equal(afterCorrectionEnqueue.recipient_email, 'new@example.com', `${jobType} uses the current address when correction commits first`)
    assert.equal(afterCorrectionEnqueue.subject, firstFixture.job.subject)
    assert.equal(afterCorrectionEnqueue.body, firstFixture.job.body)
    assert.equal(afterCorrectionEnqueue.scheduled_for, firstFixture.job.scheduled_for)
    assert.equal(afterCorrectionEnqueue.metadata.email_correction_history[0].from, 'old@example.com')

    const secondFixture = sequenceFixture(jobType)
    const enqueueWins = createSequenceRecipientStore(secondFixture)
    let releaseEnqueue
    let announceLock
    const enqueueGate = new Promise((resolve) => { releaseEnqueue = resolve })
    const locked = new Promise((resolve) => { announceLock = resolve })
    const insert = enqueueWins.enqueue(secondFixture.job, { beforeCommit: async () => { announceLock(); await enqueueGate } })
    await locked
    const correction = enqueueWins.correctEmail('new@example.com')
    releaseEnqueue()
    const [inserted] = await Promise.all([insert, correction])
    assert.equal(inserted.recipient_email, 'new@example.com', `${jobType} is retargeted when enqueue acquires the lead lock first`)
    assert.equal(inserted.subject, secondFixture.job.subject)
    assert.equal(inserted.body, secondFixture.job.body)
    assert.equal(inserted.scheduled_for, secondFixture.job.scheduled_for)
  }

  assert.match(sequenceRetarget, /select \* into inquiry from public\.luxor_inquiries where id=new\.inquiry_id for update/)
  assert.match(sequenceRetarget, /before insert on public\.luxor_email_jobs[\s\S]*execute function public\.luxor_sync_sequence_email_job_recipient/)
  assert.match(sequenceRetarget, /new\.recipient_email := lower\(btrim\(inquiry\.email\)\)/)
})

test('sequence correction fails without mutation for sending, attempted, or due brochure mail', async () => {
  const cases = [
    { status: 'sending', attempts: 0, scheduled_for: '2026-11-01T12:00:00Z', reason: 'sending' },
    { status: 'queued', attempts: 1, scheduled_for: '2026-11-01T12:00:00Z', reason: 'attempted' },
    { status: 'queued', attempts: 0, scheduled_for: '2026-10-16T11:59:00Z', reason: 'due' },
  ]
  for (const blocked of cases) {
    const fixture = sequenceFixture('marketing_campaign')
    const job = { ...fixture.job, ...blocked }
    delete job.reason
    const store = createSequenceRecipientStore({ ...fixture, jobs: [job] })
    const before = structuredClone(store.state)
    await assert.rejects(store.correctEmail('new@example.com'), new RegExp(blocked.reason))
    assert.deepEqual(store.state, before, `${blocked.reason} mail leaves both lead and queue row unchanged`)
  }
  assert.match(sequenceRetarget, /status in \('queued','sending'\)[\s\S]*job_type='marketing_campaign'[\s\S]*pre_booking_lead[\s\S]*if job\.status='sending'[\s\S]*coalesce\(job\.attempts,0\)>0[\s\S]*job\.scheduled_for<=now\(\)[\s\S]*raise exception/)
})

test('the inventory of queue job kinds keeps one-time and identity-bound mail outside generic retargeting', () => {
  const declaredKinds = [...emailJobTypes.matchAll(/^\s*\| '([^']+)'/gm)].map((match) => match[1])
  for (const kind of ['marketing_campaign', 'tour_confirmation', 'tour_reminder', 'event_details_reminder', 'event_day_reminder', 'post_event_follow_up', 'booking_package', 'proposal_view_reminder', 'proposal_payment_reminder', 'contract_signature', 'contract_view_reminder', 'contract_signature_reminder', 'unpaid_invoice_reminder', 'sixty_day_payment_reminder', 'final_payment_request', 'final_payment_reminder', 'layout_review', 'transactional_notice', 'calendar_invitation']) {
    assert.ok(declaredKinds.includes(kind), `job kind ${kind} is present in the queue type inventory`)
  }
  assert.match(sequenceRetarget, /j\.job_type in \('event_details_reminder','event_day_reminder'\)/)
  assert.match(sequenceRetarget, /j\.job_type='post_event_follow_up'/)
  assert.match(sequenceRetarget, /j\.metadata->>'automation_key'='brochure_lead'/)
  assert.match(tourSql, /tour_revision_id=new_revision\.id/)
  assert.match(sequenceRetarget, /Proposals, agreements, payments/)
  assert.doesNotMatch(sequenceRetarget, /'proposal_view_reminder'|'proposal_payment_reminder'|'contract_signature'|'contract_view_reminder'|'contract_signature_reminder'|'unpaid_invoice_reminder'|'sixty_day_payment_reminder'|'final_payment_request'|'final_payment_reminder'|'layout_review'|'transactional_notice'/)
})

test('layout resends bind the active review to the original saved job', () => {
  assert.match(sql, /corrected_email_resend_layout_review_id/)
  assert.match(sql, /source_job\.metadata->>'layout_review_id'=job\.metadata->>'corrected_email_resend_layout_review_id'/)
  assert.match(sql, /r\.status='open' and r\.revoked_at is null and r\.expires_at>now\(\)/)
})

test('tour resend confirmation is a stable job-level idempotent action across tabs', () => {
  const inquiryLock = tourSql.indexOf('select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update')
  const jobLock = tourSql.indexOf('select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update')
  assert.ok(inquiryLock >= 0 && jobLock > inquiryLock)
  assert.match(tourSql, /if job\.status in \('queued','sending'\)[\s\S]*?return jsonb_build_object\('job',to_jsonb\(job\)/)
  assert.match(worker, /luxor_claim_prepared_tour_email_resend_delivery/)
  assert.match(sql, /luxor_claim_prepared_tour_email_resend_delivery\(p_inquiry_id uuid,p_job_id uuid\)[\s\S]*?pipeline_stage,'inquiry'\) not in \('newsletter','inquiry','tour'\)/)
})

test('payment resend reserves one immutable recipient-bound invoice job and revalidates signed balance at claim', () => {
  assert.match(sql, /luxor_email_jobs_corrected_payment_resend_uidx/)
  assert.ok(sql.includes("corrected_payment_resend_key' having count(*)>1"))
  assert.match(sql, /group by metadata->>'corrected_email_resend_source_id',metadata->>'corrected_email_resend_expected_recipient'/)
  assert.match(sql, /luxor_prepare_corrected_payment_email_resend/)
  assert.match(sql, /corrected_payment_resend_preparing/)
  assert.match(sql, /luxor_finalize_corrected_payment_resend/)
  assert.match(sql, /corrected_payment_resend_checkout_session_id/)
  assert.match(sql, /luxor_validate_corrected_payment_resend/)
  assert.match(sql, /booking\.contract_status='signed'/)
  assert.match(sql, /sum\(amount\).*status='paid'/)
  assert.match(sql, /source_job_id_text.*!~\* '\^\[0-9a-f-\]/)
  assert.match(sql, /luxor_prevent_uncertain_corrected_email_replay/)
  assert.match(worker, /luxor_claim_corrected_payment_resend/)
  assert.match(route, /correctedEmailResend/)
})

test('payment correction enforces finance permission and atomically claims on immediate send', async () => {
  assert.equal(canSendCorrectedPaymentReminder({ role: 'agent', permissions: ['leads'] }), false)
  assert.equal(canSendCorrectedPaymentReminder({ role: 'agent', permissions: ['leads', 'finances'] }), true)
  assert.equal(canSendCorrectedPaymentReminder({ role: 'owner', permissions: [] }), true)
  assert.equal(correctedPaymentReminderKind('final_payment_request'), 'final_payment')
  assert.equal(correctedPaymentReminderKind('unpaid_invoice_reminder'), 'unpaid_invoice')
  assert.equal(isCorrectedPaymentResendStage({ status: 'booked', pipeline_stage: 'final_payment' }), true)
  assert.equal(isCorrectedPaymentResendStage({ status: 'booked', pipeline_stage: 'contract' }), false)
  assert.equal(isCorrectedPaymentResendStage({ status: 'proposal_sent', pipeline_stage: 'final_payment' }), false)
  let optionsSeen
  const job = { id: 'job-1' }
  await claimAndProcessCorrectedPaymentResend(job, async (jobs, options) => {
    assert.deepEqual(jobs, [job])
    optionsSeen = options
    return [{ status: 'sent' }]
  })
  assert.deepEqual(optionsSeen, { markSending: true })
})

test('payment resend route orchestration reserves before checkout and shares concurrent preparation', async () => {
  const branchStart = paymentRoute.indexOf('if (body.correctedEmailResend) {', paymentRoute.indexOf('const reminderKind'))
  const correctedBranch = paymentRoute.slice(branchStart, paymentRoute.indexOf('\n    let reviewUrl', branchStart))
  assert.ok(correctedBranch.indexOf('reserve: async') < correctedBranch.indexOf('prepareContent: async'))
  assert.match(correctedBranch, /runCorrectedPaymentResend\(/)
  assert.match(correctedBranch, /createLuxorPostContractCheckout/)
  const job = { id: 'payment-job-1', status: 'sending', subject: 'Preparing', body: 'Preparing', metadata: {} }
  let reserved = false
  let releaseContent
  const contentGate = new Promise((resolve) => { releaseContent = resolve })
  let checkoutSessions = 0
  let jobCount = 0
  let finalizeCount = 0
  let processCount = 0
  const reserve = async () => {
    if (reserved) return { job, created: false, preparing: true }
    reserved = true
    jobCount += 1
    return { job, created: true, preparing: true }
  }
  const makeAttempt = () => runCorrectedPaymentResend({
    reserve,
    prepareContent: async () => {
      checkoutSessions += 1
      await contentGate
      return { subject: 'Payment reminder', body: 'Pay securely', checkoutSessionId: 'cs_test_mock', balanceDue: 125 }
    },
    finalize: async (_job, content) => {
      finalizeCount += 1
      job.status = 'queued'
      job.subject = content.subject
      job.body = content.body
      job.metadata.checkout_session_id = content.checkoutSessionId
      return job
    },
    process: async () => { processCount += 1 },
    loadLatest: async (_id, fallback) => fallback,
  })
  const first = makeAttempt()
  await Promise.resolve()
  const duplicate = await makeAttempt()
  assert.equal(duplicate.delivery, 'preparing')
  releaseContent()
  const firstResult = await first
  assert.equal(firstResult.job.subject, 'Payment reminder')
  assert.equal(checkoutSessions, 1)
  assert.equal(jobCount, 1)
  assert.equal(finalizeCount, 1)
  assert.equal(processCount, 1)
})

test('payment resend recovers lost response without creating another checkout, job, or email content', async () => {
  const job = { id: 'payment-job-2', status: 'sent', subject: 'Saved reminder', body: 'Saved checkout link', metadata: { checkout_session_id: 'cs_test_saved' } }
  let checkoutSessions = 0
  const jobs = 1
  let contentBuilds = 0
  let processorCalls = 0
  let actualProviderSends = 1
  const sentJobIds = new Set(['payment-job-2'])
  const retry = await runCorrectedPaymentResend({
    reserve: async () => ({ job, created: false, preparing: false }),
    prepareContent: async () => { checkoutSessions += 1; contentBuilds += 1; return { subject: 'new', body: 'new', checkoutSessionId: 'new', balanceDue: 125 } },
    finalize: async (_job, content) => { job.subject = content.subject; return job },
    process: async (jobsToProcess) => {
      processorCalls += 1
      for (const candidate of jobsToProcess) {
        if (sentJobIds.has(candidate.id)) continue
        sentJobIds.add(candidate.id)
        actualProviderSends += 1
      }
    },
    loadLatest: async (_id, fallback) => fallback,
  })
  assert.equal(retry.job.id, 'payment-job-2')
  assert.equal(retry.replayed, true)
  assert.equal(retry.delivery, 'sent')
  assert.equal(checkoutSessions, 0)
  assert.equal(jobs, 1)
  assert.equal(contentBuilds, 0)
  assert.equal(processorCalls, 1)
  assert.equal(actualProviderSends, 1, 'the already-sent job does not cause a second provider delivery')
  assert.equal(job.subject, 'Saved reminder')
  assert.equal(job.metadata.checkout_session_id, 'cs_test_saved')
})

test('proposal resend recovers a provider-accepted response loss with the same key and one delivery', async () => {
  const accepted = new Map()
  let providerCalls = 0
  let loseFirstResponse = true
  const providerMock = async (key) => {
    providerCalls += 1
    if (!accepted.has(key)) accepted.set(key, { messageId: 'mail-1', providerMessageId: 'resend-1' })
    if (loseFirstResponse) {
      loseFirstResponse = false
      throw new Error('simulated lost response after provider acceptance')
    }
    return accepted.get(key)
  }
  const result = await runProposalResendOperation({
    send: () => providerMock('corrected-proposal/same-key'),
    recover: async () => accepted.get('corrected-proposal/same-key') || null,
    audit: async () => undefined,
  })
  assert.equal(providerCalls, 1)
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.receipt.providerMessageId, 'resend-1')
})

test('concurrent proposal actions share one provider idempotency key and one send', async () => {
  const accepted = new Map()
  const inFlight = new Map()
  let actualSends = 0
  const providerMock = async (key) => {
    if (accepted.has(key)) return accepted.get(key)
    if (inFlight.has(key)) return inFlight.get(key)
    const operation = Promise.resolve().then(() => {
      actualSends += 1
      const receipt = { messageId: 'mail-shared', providerMessageId: 'provider-shared' }
      accepted.set(key, receipt)
      return receipt
    }).finally(() => inFlight.delete(key))
    inFlight.set(key, operation)
    return operation
  }
  const makeAttempt = () => runProposalResendOperation({
    send: () => providerMock('proposal-op-1'),
    recover: async () => accepted.get('proposal-op-1') || null,
    audit: async () => undefined,
  })
  const results = await Promise.all([makeAttempt(), makeAttempt()])
  assert.equal(actualSends, 1)
  assert.deepEqual(results.map((result) => result.outcome), ['accepted', 'accepted'])
})

test('audit failure after accepted proposal delivery remains accepted and is surfaced for repair', async () => {
  const result = await runProposalResendOperation({
    send: async () => ({ messageId: 'mail-2', providerMessageId: 'resend-2' }),
    recover: async () => null,
    audit: async () => { throw new Error('simulated note-store outage') },
  })
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.auditPending, true)
})

test('due-worker job claim commits independently before per-lead validation, with the same provider key on recovery', () => {
  assert.match(dueClaims, /for update skip locked[\s\S]*?update public\.luxor_email_jobs j set status='sending'/)
  assert.match(worker, /luxor_claim_corrected_email_resend/)
  assert.match(worker, /idempotencyKey: `email-job\/\$\{job\.id\}`/)
  assert.match(worker, /Retry only this same job so the provider idempotency key can reconcile it/)
})
