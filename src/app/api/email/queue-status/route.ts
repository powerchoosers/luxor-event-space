import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'

type EmailJobSummaryRow = {
  status: string
  job_type: string
  created_at: string
  updated_at: string
  sent_at: string | null
  recipient_email: string
  subject: string
  scheduled_for: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const FAILURE_WINDOW_MS = DAY_MS
const SENT_WINDOW_MS = 30 * DAY_MS
const WORKER_HEARTBEAT_GRACE_MS = 3 * 60 * 1000

function isWithinEmailSendWindow(date: Date) {
  const centralHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).find((part) => part.type === 'hour')?.value,
  )
  return Number.isFinite(centralHour) && centralHour >= 8 && centralHour < 20
}

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [jobs, worker] = await Promise.all([
      supabaseRest<EmailJobSummaryRow[]>(
        'luxor_email_jobs?select=status,job_type,created_at,updated_at,sent_at,scheduled_for,recipient_email,subject&order=created_at.desc&limit=500',
      ),
      getLuxorWorkerHealth('email_jobs'),
    ])

    const list = Array.isArray(jobs) ? jobs : []
    const now = Date.now()
    const recentFailureCutoff = now - FAILURE_WINDOW_MS
    const sentCutoff = now - SENT_WINDOW_MS
    const queued = list.filter((j) => j.status === 'queued').length
    const dueQueued = list.filter((job) =>
      job.status === 'queued' && new Date(job.scheduled_for).getTime() <= now
    ).length
    const sending = list.filter((j) => j.status === 'sending').length
    const sent = list.filter((j) => {
      if (j.status !== 'sent' || !j.sent_at) return false
      return new Date(j.sent_at).getTime() >= sentCutoff
    }).length
    const failed = list.filter((job) => {
      if (job.status !== 'failed' || new Date(job.updated_at).getTime() < recentFailureCutoff) return false

      const wasLaterDelivered = list.some((candidate) =>
        candidate.status === 'sent'
        && candidate.recipient_email.toLowerCase() === job.recipient_email.toLowerCase()
        && candidate.subject === job.subject
        && Boolean(candidate.sent_at)
        && new Date(candidate.sent_at as string).getTime() > new Date(job.updated_at).getTime()
      )

      return !wasLaterDelivered
    }).length
    const total = list.length
    const workerHeartbeatAgeMs = worker?.last_authorized_at
      ? now - new Date(worker.last_authorized_at).getTime()
      : null
    const workerStalled = isWithinEmailSendWindow(new Date())
      && dueQueued > 0
      && (workerHeartbeatAgeMs === null || workerHeartbeatAgeMs > WORKER_HEARTBEAT_GRACE_MS)
    const workerError = worker?.last_status === 'error'

    const lastActivityAt = list.reduce<string | null>((latest, job) => {
      if (!latest) return job.updated_at
      return new Date(job.updated_at).getTime() > new Date(latest).getTime() ? job.updated_at : latest
    }, null)

    return NextResponse.json({
      status: failed > 0 || workerStalled || workerError ? 'warning' : 'healthy',
      queued,
      sending,
      sent,
      failed,
      dueQueued,
      total,
      failureWindowHours: FAILURE_WINDOW_MS / (60 * 60 * 1000),
      lastActivityAt,
      worker: {
        lastAuthorizedAt: worker?.last_authorized_at || null,
        lastProcessedAt: worker?.last_processed_at || null,
        status: worker?.last_status || 'unknown',
        stalled: workerStalled,
        error: worker?.last_error || null,
      },
      provider: 'Zoho Mail (booking@luxoratlaspalmas.com)',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to query email queue status.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
