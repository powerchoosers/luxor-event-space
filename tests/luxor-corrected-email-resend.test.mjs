import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getRecipientBounceEvidence, isCorrectedPaymentResendStage, isLeadEmailResendStage, rankCorrectEmailResendOptions } from '../src/lib/luxorLeadEmailResend.ts'
import { canSendCorrectedPaymentReminder, claimAndProcessCorrectedPaymentResend, correctedPaymentReminderKind } from '../src/lib/luxorCorrectedPaymentResend.ts'
import { runProposalResendOperation } from '../src/lib/luxorProposalResendOperation.ts'

const sql = await readFile(new URL('../supabase/migrations/20261015060000_unified_lead_email_resend.sql', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/app/api/leads/[id]/correct-email-resend/route.ts', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../src/components/portal/CorrectEmailResendDialog.tsx', import.meta.url), 'utf8')
const worker = await readFile(new URL('../src/lib/luxorEmailJobsServer.ts', import.meta.url), 'utf8')
const tourSql = await readFile(new URL('../supabase/migrations/20261009010000_safe_lead_email_correction_and_tour_resend.sql', import.meta.url), 'utf8')
const dueClaims = await readFile(new URL('../supabase/migrations/20261015010000_permanent_test_lead_runs.sql', import.meta.url), 'utf8')

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

test('address trigger only retargets opted-in active brochure follow-ups and preflights unique indexes', () => {
  assert.match(sql, /Duplicate corrected email resend request IDs exist/)
  assert.match(sql, /Duplicate corrected email resend source\/recipient pairs exist/)
  assert.match(sql, /job_type='marketing_campaign'/)
  assert.match(sql, /metadata->>'automation_key'='brochure_lead'/)
  assert.match(sql, /new\.marketing_opt_in is true/)
  assert.match(sql, /automation_enrollment_id is not null and automation_step_key is not null/)
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
