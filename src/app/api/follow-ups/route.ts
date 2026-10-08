import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorFollowUpSetup, isLuxorBrochureFollowUpSendingEnabled, updateLuxorFollowUpTemplate, recordLuxorFollowUpResponse, controlLuxorBrochureFollowUp, setLuxorFollowUpDisposition } from '@/lib/luxorFollowUpsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorFollowUpAction, LuxorFollowUpEnrollment } from '@/lib/luxorFollowUpsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const inquiryId = request.nextUrl.searchParams.get('inquiryId')
    if (request.nextUrl.searchParams.get('dashboard') === '1') {
      const sendingEnabled = await isLuxorBrochureFollowUpSendingEnabled()
      const enrollments = await supabaseRest<Array<{ id: string; inquiry_id: string; status: string }>>(
        'luxor_follow_up_enrollments?select=id,inquiry_id,status&automation_key=eq.brochure_lead&status=in.(active,paused)&order=started_at.desc&limit=500',
      )
      const activeEnrollments = enrollments.filter((item) => item.status === 'active')
      const enrollmentById = new Map(activeEnrollments.map((item) => [item.id, item.inquiry_id]))
      const pausedEnrollmentIds = enrollments.filter((item) => item.status === 'paused').map((item) => item.id)
      const ids = [...enrollmentById.keys()]
      if (!ids.length) return NextResponse.json({ emailActions: [], pausedEnrollmentIds, pausedEnrollments: enrollments.filter((item) => item.status === 'paused'), sendingEnabled })
      const actions = await supabaseRest<Array<{ id: string; enrollment_id: string; step_key: string; scheduled_at: string; status: string; channel: string; email_job_id: string | null }>>(
        `luxor_follow_up_actions?select=id,enrollment_id,step_key,scheduled_at,status,channel,email_job_id&channel=eq.email&status=in.(email_queued,scheduled)&enrollment_id=in.(${ids.map(encodeURIComponent).join(',')})&order=scheduled_at.asc&limit=1000`,
      )
      return NextResponse.json({ emailActions: actions.flatMap((item) => {
        const inquiry_id = enrollmentById.get(item.enrollment_id)
        return inquiry_id ? [{ ...item, inquiry_id }] : []
      }), pausedEnrollmentIds, pausedEnrollments: enrollments.filter((item) => item.status === 'paused'), sendingEnabled })
    }
    if (inquiryId) {
      const historyPage = Math.max(0, Math.min(100, Number(request.nextUrl.searchParams.get('historyPage') || '0') || 0))
      const historyOffset = historyPage * 20
      const [enrollment] = await supabaseRest<LuxorFollowUpEnrollment[]>(
        `luxor_follow_up_enrollments?select=id,inquiry_id,automation_key,status,started_at,response_received_at,ended_reason,nurture_eligible_at,marketing_consent_at_enrollment&inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&limit=1`,
      )
      const [actions, notes, calls, emails] = await Promise.all([
        enrollment ? supabaseRest<LuxorFollowUpAction[]>(`luxor_follow_up_actions?select=*&enrollment_id=eq.${encodeURIComponent(enrollment.id)}&order=scheduled_at.asc`) : Promise.resolve([]),
        supabaseRest<Array<{ id: string; created_at: string; author: string | null; content: string; note_type: string | null; task_id: string | null }>>(`luxor_notes?select=id,created_at,author,content,note_type,task_id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20&offset=${historyOffset}`),
        supabaseRest<Array<{ id: string; created_at: string; direction: string; status: string; outcome: string | null; notes: string | null; started_at: string | null; ended_at: string | null }>>(`luxor_calls?select=id,created_at,direction,status,outcome,notes,started_at,ended_at&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20&offset=${historyOffset}`),
        supabaseRest<Array<{ id: string; created_at: string; scheduled_for: string | null; sent_at: string | null; status: string; job_type: string; subject: string }>>(`luxor_email_jobs?select=id,created_at,scheduled_for,sent_at,status,job_type,subject&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20&offset=${historyOffset}`),
      ])
      const history = [
        ...notes.map((item) => ({ id: `note-${item.id}`, at: item.created_at, kind: item.content.startsWith('Manual call outcome:') ? 'call' : 'note', label: `${item.content.startsWith('Manual call outcome:') ? 'Manual call outcome' : item.author || 'Note'}${item.task_id ? ' · linked task' : ''}`, detail: item.content })),
        ...calls.map((item) => ({ id: `call-${item.id}`, at: item.ended_at || item.started_at || item.created_at, kind: 'call', label: `${item.direction} call · ${item.status}`, detail: [item.outcome, item.notes].filter(Boolean).join(' · ') })),
        ...emails.map((item) => ({ id: `email-${item.id}`, at: item.sent_at || item.scheduled_for || item.created_at, kind: 'email', label: `${item.subject} · ${item.status}`, detail: item.status === 'sent' ? 'Recorded as sent' : `Queue status: ${item.status}` })),
        ...actions.filter((item) => item.channel === 'email' && ['scheduled', 'email_queued'].includes(item.status) && !item.email_job_id).map((item) => ({ id: `action-${item.id}`, at: item.scheduled_at, kind: 'follow-up', label: `Automated email · ${item.step_key.replaceAll('_', ' ')}`, detail: `${enrollment?.status === 'paused' ? 'Paused · ' : ''}Scheduled · ${item.status}` })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      return NextResponse.json({ enrollment: enrollment ?? null, actions, history, historyPage, hasMoreHistory: notes.length === 20 || calls.length === 20 || emails.length === 20 })
    }

    const setup = await getLuxorFollowUpSetup()
    return NextResponse.json({ ...setup, sendsConfigured: await isLuxorBrochureFollowUpSendingEnabled() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load follow-up settings.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const body = await request.json()
    const templateId = String(body.templateId || '')
    const template = await updateLuxorFollowUpTemplate(templateId, body.updates && typeof body.updates === 'object' ? body.updates : {})
    return NextResponse.json({ template })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save this follow-up template.' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const body = await request.json()
    const inquiryId = String(body.inquiryId || '')
    const action = String(body.action || '')
    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })

    if (action === 'response') {
      const result = await recordLuxorFollowUpResponse(inquiryId)
      return NextResponse.json({ success: true, ...result })
    }
    if (action === 'nurture') {
      const inquiry = await getLuxorInquiry(inquiryId)
      if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      const sequence = await controlLuxorBrochureFollowUp(inquiryId, 'stop')
      const updated = await updateLuxorInquiry(inquiryId, {
        metadata: { ...inquiry.metadata, followUpStage: 'nurture' },
      })
      if (!updated) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      await createNote(inquiryId, 'Lead moved to the Nurture stage by a portal user. The active brochure sequence was stopped. No nurture message or enrollment was created.', 'status_change', session.email)
      return NextResponse.json({ success: true, stage: 'nurture', sequenceStatus: sequence.status })
    }
    if (action === 'disposition') {
      const allowed = ['no_response', 'not_interested', 'lost_another_venue', 'event_canceled', null] as const
      const disposition = allowed.find((value) => value === body.disposition)
      if (disposition === undefined) return NextResponse.json({ error: 'Unsupported lead disposition.' }, { status: 400 })
      if (!await getLuxorInquiry(inquiryId)) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      await setLuxorFollowUpDisposition(inquiryId, disposition, typeof body.reason === 'string' ? body.reason : undefined)
      return NextResponse.json({ success: true, disposition })
    }
    if (action === 'recover_overdue') {
      const enrollmentId = String(body.enrollmentId || '')
      const itemId = String(body.itemId || '')
      const decision = String(body.decision || '')
      if (!/^[0-9a-f-]{36}$/i.test(enrollmentId) || !/^[0-9a-f-]{36}$/i.test(itemId) || !['skip', 'reschedule'].includes(decision)) {
        return NextResponse.json({ error: 'Choose a valid overdue email and recovery action.' }, { status: 400 })
      }
      const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null
      if (decision === 'reschedule' && (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) return NextResponse.json({ error: 'Choose a future date and time to reschedule this email.' }, { status: 400 })
      const result = await supabaseRest<{ status: string; decision?: string; scheduled_at?: string }>('rpc/luxor_recover_brochure_follow_up_overdue', {
        method: 'POST', body: JSON.stringify({
          p_inquiry_id: inquiryId,
          p_enrollment_id: enrollmentId,
          p_action_id: itemId,
          p_decision: decision,
          p_scheduled_at: decision === 'reschedule' ? scheduledAt!.toISOString() : null,
        }),
      })
      if (result.status === 'success') return NextResponse.json({ success: true, decision, scheduledAt: result.scheduled_at ?? null })
      if (result.status === 'terminal_skip_requires_reschedule_or_stop') return NextResponse.json({ error: 'The final approved email cannot be skipped. Reschedule it to a future time or stop the sequence with a reason.' }, { status: 409 })
      if (result.status === 'future_time_required') return NextResponse.json({ error: 'Choose a future date and time to reschedule this email.' }, { status: 400 })
      if (result.status === 'missing_lead' || result.status === 'missing_enrollment') return NextResponse.json({ error: 'The selected sequence no longer belongs to this lead.' }, { status: 404 })
      return NextResponse.json({ error: 'The sequence or email changed state. Refresh this lead before trying again.' }, { status: 409 })
    }
    if (action === 'pause' || action === 'resume' || action === 'stop') {
      const [priorEnrollment] = await supabaseRest<Array<{ id: string; status: string; ended_reason: string | null }>>(
        `luxor_follow_up_enrollments?select=id,status,ended_reason&inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&order=started_at.desc&limit=1`,
      )
      if (!priorEnrollment) return NextResponse.json({ error: 'A brochure sequence was not found.' }, { status: 404 })
      if (action === 'resume') {
        const inquiry = await getLuxorInquiry(inquiryId)
        if (!inquiry || !priorEnrollment || !inquiry.marketing_opt_in || ['tour_confirmed', 'booked', 'closed_lost'].includes(inquiry.status) || (inquiry.follow_up_disposition && inquiry.follow_up_disposition !== 'no_response')) {
          return NextResponse.json({ error: 'This lead is no longer eligible to resume brochure follow-up.' }, { status: 409 })
        }
      }
      if (action === 'resume' && priorEnrollment.status === 'paused') {
        const now = encodeURIComponent(new Date().toISOString())
        const [dueEmails, dueJobs] = await Promise.all([
          supabaseRest<Array<{ id: string; scheduled_at: string }>>(
            `luxor_follow_up_actions?select=id,scheduled_at&enrollment_id=eq.${encodeURIComponent(priorEnrollment.id)}&channel=eq.email&status=in.(scheduled,email_queued)&scheduled_at=lte.${now}&limit=1`,
          ),
          supabaseRest<Array<{ id: string; scheduled_for: string }>>(
            `luxor_email_jobs?select=id,scheduled_for&automation_enrollment_id=eq.${encodeURIComponent(priorEnrollment.id)}&status=eq.queued&scheduled_for=lte.${now}&limit=1`,
          ),
        ])
        if (dueEmails.length || dueJobs.length) return NextResponse.json({ error: 'This paused sequence has an overdue email. Skip it or reschedule it to a future date before resuming.' }, { status: 409 })
      }
      const result = await controlLuxorBrochureFollowUp(inquiryId, action)
      if (result.status === 'missing') return NextResponse.json({ error: 'A brochure sequence was not found.' }, { status: 404 })
      if (action === 'stop' && ['active', 'paused'].includes(priorEnrollment.status) && result.status === 'stopped') {
        const allowedReasons = ['booked', 'lost_another_venue', 'not_interested', 'event_canceled', 'no_response', 'duplicate', 'other', 'manual_stop']
        const stopReason = allowedReasons.includes(String(body.stopReason || '')) ? String(body.stopReason) : 'manual_stop'
        await supabaseRest(
          `luxor_follow_up_enrollments?id=eq.${encodeURIComponent(priorEnrollment.id)}&status=eq.stopped&ended_reason=eq.manual_stop`,
          { method: 'PATCH', body: JSON.stringify({ ended_reason: stopReason, updated_at: new Date().toISOString() }) },
        )
      }
      return NextResponse.json({ success: true, status: result.status, finalized: result.finalized })
    }
    return NextResponse.json({ error: 'Unsupported follow-up action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update follow-up status.' }, { status: 500 })
  }
}
