import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APPROVED_BOOKING_ID = '614f6326-5c9a-46de-ae73-cb8d857fc2f8'

type ReconciliationReceipt = {
  changed: boolean
  audit_id: string
  operation_key: string
  booking_id: string
  master_invoice_id: string
  draft_invoice_id: string
  superseded_proposal_id: string
  expected_active_reminders: number
  reminders_updated: number
  sent_reminder_count: number
}

type ReconciliationReminder = {
  id: string
  status: string
  scheduled_for: string
  attempts: number
  sent_at: string | null
  metadata: Record<string, unknown> | null
}

function plusCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function expectedReminderJobs() {
  const dueDates = [
    { order: 2, due: '2026-11-30' },
    { order: 3, due: '2026-12-31' },
    { order: 4, due: '2027-01-31' },
    { order: 5, due: '2027-02-28' },
  ]
  return dueDates.flatMap(({ order, due }) => [
    { order, due, milestone: 'installment_7_days_before', date: plusCalendarDays(due, -7) },
    { order, due, milestone: 'installment_1_day_overdue', date: plusCalendarDays(due, 1) },
  ])
}

function remindersMatchApprovedSchedule(jobs: ReconciliationReminder[], requireUnsent: boolean) {
  const expected = expectedReminderJobs()
  if (jobs.length !== expected.length) return false
  const observed = new Set<string>()
  for (const job of jobs) {
    const metadata = job.metadata || {}
    const order = Number(metadata.installment_order)
    const due = String(metadata.due_date || '')
    const milestone = String(metadata.milestone || '')
    const match = expected.find((item) => item.order === order && item.due === due && item.milestone === milestone)
    if (!match || !['queued', 'sending', 'sent', 'failed', 'cancelled'].includes(job.status)) return false
    if (requireUnsent && (job.status !== 'queued' || job.sent_at || job.attempts !== 0)) return false
    const scheduledFor = new Date(job.scheduled_for).toISOString()
    // All eight approved reminder dates fall in Central Standard Time.
    const expectedAt = new Date(`${match.date}T16:00:00.000Z`).toISOString()
    if (scheduledFor !== expectedAt) return false
    const key = `${order}:${due}:${milestone}`
    if (observed.has(key)) return false
    observed.add(key)
  }
  return observed.size === expected.length
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || member.role !== 'owner' || !memberCan(member, 'finances')) {
      return NextResponse.json({ error: 'Owner finance access is required.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { bookingId?: unknown; confirmCorrection?: unknown }
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId : ''
    if (body.confirmCorrection !== true || !UUID.test(bookingId) || bookingId !== APPROVED_BOOKING_ID) {
      return NextResponse.json({ error: 'Confirm the approved correction for the authorized booking.' }, { status: 400 })
    }

    const receipt = await supabaseRest<ReconciliationReceipt>(
      'rpc/luxor_reconcile_legacy_package_booking',
      { method: 'POST', body: JSON.stringify({ p_booking_id: bookingId, p_actor_email: session.email }) },
    )
    if (!receipt?.audit_id || receipt.booking_id !== bookingId) {
      return NextResponse.json({ error: 'The approved correction was not applied.' }, { status: 409 })
    }

    // The RPC updates the financial records and all eight reminders
    // atomically. This read verifies the saved schedule; it does not dispatch mail.
    const reminders = await supabaseRest<ReconciliationReminder[]>(
      `luxor_email_jobs?select=id,status,scheduled_for,attempts,sent_at,metadata&booking_id=eq.${encodeURIComponent(bookingId)}&job_type=eq.installment_payment_reminder&test_run_id=is.null&order=scheduled_for.asc,id.asc&limit=100`,
    )
    if (!remindersMatchApprovedSchedule(reminders, receipt.changed)) {
      return NextResponse.json({
        success: false,
        changed: receipt.changed,
        auditId: receipt.audit_id,
        reminderQueueReady: false,
        error: 'The audited correction completed, but the saved reminder schedule did not pass verification. No message was sent.',
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      changed: receipt.changed,
      auditId: receipt.audit_id,
      reminderQueueReady: true,
      queuedReminderCount: reminders.filter((job) => job.status === 'queued').length,
      sentReminderCount: reminders.filter((job) => Boolean(job.sent_at)).length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const preconditionFailure = /changed|expected|not found|does not match|no reconciliation|snapshot/i.test(message)
    if (!preconditionFailure) console.error('[legacy-package-reconciliation] failed')
    return NextResponse.json(
      { error: preconditionFailure ? 'Current financial records no longer match the approved snapshot; no changes were applied.' : 'Reconciliation could not be completed.' },
      { status: preconditionFailure ? 409 : 500 },
    )
  }
}
