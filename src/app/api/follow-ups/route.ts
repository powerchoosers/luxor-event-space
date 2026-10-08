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
      const enrollments = await supabaseRest<Array<{ id: string; inquiry_id: string }>>(
        'luxor_follow_up_enrollments?select=id,inquiry_id&automation_key=eq.brochure_lead&status=in.(active,paused)&limit=500',
      )
      const enrollmentById = new Map(enrollments.map((item) => [item.id, item.inquiry_id]))
      const ids = [...enrollmentById.keys()]
      if (!ids.length) return NextResponse.json({ emailActions: [], sendingEnabled })
      const actions = await supabaseRest<Array<{ id: string; enrollment_id: string; step_key: string; scheduled_at: string; status: string }>>(
        `luxor_follow_up_actions?select=id,enrollment_id,step_key,scheduled_at,status&channel=eq.email&status=in.(email_queued,scheduled)&enrollment_id=in.(${ids.map(encodeURIComponent).join(',')})&order=scheduled_at.asc&limit=1000`,
      )
      return NextResponse.json({ emailActions: actions.flatMap((item) => {
        const inquiry_id = enrollmentById.get(item.enrollment_id)
        return inquiry_id ? [{ ...item, inquiry_id }] : []
      }), sendingEnabled })
    }
    if (inquiryId) {
      const [enrollment] = await supabaseRest<LuxorFollowUpEnrollment[]>(
        `luxor_follow_up_enrollments?select=id,inquiry_id,automation_key,status,started_at,response_received_at,ended_reason,nurture_eligible_at,marketing_consent_at_enrollment&inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&limit=1`,
      )
      const [actions, notes, calls, emails] = await Promise.all([
        enrollment ? supabaseRest<LuxorFollowUpAction[]>(`luxor_follow_up_actions?select=*&enrollment_id=eq.${encodeURIComponent(enrollment.id)}&order=scheduled_at.asc`) : Promise.resolve([]),
        supabaseRest<Array<{ id: string; created_at: string; author: string | null; content: string; note_type: string | null }>>(`luxor_notes?select=id,created_at,author,content,note_type&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20`),
        supabaseRest<Array<{ id: string; created_at: string; direction: string; status: string; outcome: string | null; notes: string | null; started_at: string | null; ended_at: string | null }>>(`luxor_calls?select=id,created_at,direction,status,outcome,notes,started_at,ended_at&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20`),
        supabaseRest<Array<{ id: string; created_at: string; sent_at: string | null; status: string; job_type: string; subject: string }>>(`luxor_email_jobs?select=id,created_at,sent_at,status,job_type,subject&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=20`),
      ])
      const history = [
        ...notes.map((item) => ({ id: `note-${item.id}`, at: item.created_at, kind: item.content.startsWith('Manual call outcome:') ? 'call' : 'note', label: item.content.startsWith('Manual call outcome:') ? 'Manual call outcome' : item.author || 'Note', detail: item.content })),
        ...calls.map((item) => ({ id: `call-${item.id}`, at: item.ended_at || item.started_at || item.created_at, kind: 'call', label: `${item.direction} call · ${item.status}`, detail: [item.outcome, item.notes].filter(Boolean).join(' · ') })),
        ...emails.map((item) => ({ id: `email-${item.id}`, at: item.sent_at || item.created_at, kind: 'email', label: `${item.subject} · ${item.status}`, detail: item.status === 'sent' ? 'Recorded as sent' : `Queue status: ${item.status}` })),
        ...actions.filter((item) => item.channel === 'email' && ['scheduled', 'email_queued'].includes(item.status) && !item.email_job_id).map((item) => ({ id: `action-${item.id}`, at: item.scheduled_at, kind: 'follow-up', label: `Automated email · ${item.step_key.replaceAll('_', ' ')}`, detail: `Scheduled · ${item.status}` })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      return NextResponse.json({ enrollment: enrollment ?? null, actions, history })
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
      await setLuxorFollowUpDisposition(inquiryId, disposition, typeof body.reason === 'string' ? body.reason : undefined)
      return NextResponse.json({ success: true, disposition })
    }
    if (action === 'pause' || action === 'resume' || action === 'stop') {
      const result = await controlLuxorBrochureFollowUp(inquiryId, action)
      if (result.status === 'missing') return NextResponse.json({ error: 'A brochure sequence was not found.' }, { status: 404 })
      if (action === 'stop' && result.status === 'stopped') {
        const allowedReasons = ['booked', 'lost_another_venue', 'not_interested', 'event_canceled', 'no_response', 'duplicate', 'other', 'manual_stop']
        const stopReason = allowedReasons.includes(String(body.stopReason || '')) ? String(body.stopReason) : 'manual_stop'
        await supabaseRest(
          `luxor_follow_up_enrollments?inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&status=eq.stopped`,
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
