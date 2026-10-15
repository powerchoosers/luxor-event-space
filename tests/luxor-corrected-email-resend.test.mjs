import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getRecipientBounceEvidence, isLeadEmailResendStage, rankCorrectEmailResendOptions } from '../src/lib/luxorLeadEmailResend.ts'

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
  assert.match(sql, /luxor_prepare_corrected_payment_email_resend/)
  assert.match(sql, /luxor_validate_corrected_payment_resend/)
  assert.match(sql, /booking\.contract_status='signed'/)
  assert.match(sql, /sum\(amount\).*status='paid'/)
  assert.match(worker, /luxor_claim_corrected_payment_resend/)
  assert.match(route, /correctedEmailResend/)
})

test('due-worker job claim commits independently before per-lead validation, with the same provider key on recovery', () => {
  assert.match(dueClaims, /for update skip locked[\s\S]*?update public\.luxor_email_jobs j set status='sending'/)
  assert.match(worker, /luxor_claim_corrected_email_resend/)
  assert.match(worker, /idempotencyKey: `email-job\/\$\{job\.id\}`/)
  assert.match(worker, /Retry only this same job so the provider idempotency key can reconcile it/)
})
