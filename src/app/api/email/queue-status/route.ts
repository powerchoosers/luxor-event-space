import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type EmailJobSummaryRow = {
  status: string
  job_type: string
  created_at: string
}

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jobs = await supabaseRest<EmailJobSummaryRow[]>(
      `luxor_email_jobs?select=status,job_type,created_at&order=created_at.desc&limit=500`
    )

    const list = Array.isArray(jobs) ? jobs : []
    const queued = list.filter((j) => j.status === 'queued').length
    const sending = list.filter((j) => j.status === 'sending').length
    const sent = list.filter((j) => j.status === 'sent').length
    const failed = list.filter((j) => j.status === 'failed').length
    const total = list.length

    const lastJob = list[0] ?? null

    return NextResponse.json({
      status: failed > 0 && queued > 0 ? 'warning' : 'healthy',
      queued,
      sending,
      sent,
      failed,
      total,
      lastActivityAt: lastJob?.created_at ?? null,
      provider: 'Zoho Mail (booking@luxoratlaspalmas.com)',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to query email queue status.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
