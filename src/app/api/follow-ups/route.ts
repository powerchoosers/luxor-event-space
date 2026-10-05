import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorFollowUpSetup, isLuxorBrochureFollowUpSendingEnabled, updateLuxorFollowUpTemplate, recordLuxorFollowUpResponse, stopLuxorBrochureFollowUp, setLuxorFollowUpDisposition } from '@/lib/luxorFollowUpsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorFollowUpAction, LuxorFollowUpEnrollment } from '@/lib/luxorFollowUpsServer'

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
        ...notes.map((item) => ({ id: `note-${item.id}`, at: item.created_at, kind: 'note', label: item.author || 'Note', detail: item.content })),
        ...calls.map((item) => ({ id: `call-${item.id}`, at: item.ended_at || item.started_at || item.created_at, kind: 'call', label: `${item.direction} call · ${item.status}`, detail: [item.outcome, item.notes].filter(Boolean).join(' · ') })),
        ...emails.map((item) => ({ id: `email-${item.id}`, at: item.sent_at || item.created_at, kind: 'email', label: `${item.subject} · ${item.status}`, detail: item.status === 'sent' ? 'Recorded as sent' : `Queue status: ${item.status}` })),
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
      const recorded = await recordLuxorFollowUpResponse(inquiryId)
      return NextResponse.json({ success: true, recorded })
    }
    if (action === 'disposition') {
      const allowed = ['no_response', 'not_interested', 'lost_another_venue', 'event_canceled', null] as const
      const disposition = allowed.find((value) => value === body.disposition)
      if (disposition === undefined) return NextResponse.json({ error: 'Unsupported lead disposition.' }, { status: 400 })
      await setLuxorFollowUpDisposition(inquiryId, disposition, typeof body.reason === 'string' ? body.reason : undefined)
      return NextResponse.json({ success: true, disposition })
    }
    if (action === 'pause' || action === 'resume') {
      const nextStatus = action === 'pause' ? 'paused' : 'active'
      const [enrollment] = await supabaseRest<LuxorFollowUpEnrollment[]>(
        `luxor_follow_up_enrollments?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&status=eq.${action === 'pause' ? 'active' : 'paused'}&limit=1`,
      )
      if (!enrollment) return NextResponse.json({ error: 'An active sequence was not found.' }, { status: 404 })
      await supabaseRest(`luxor_follow_up_enrollments?id=eq.${encodeURIComponent(enrollment.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: nextStatus, paused_at: action === 'pause' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }),
      })
      return NextResponse.json({ success: true, status: nextStatus })
    }
    if (action === 'stop') {
      await stopLuxorBrochureFollowUp(inquiryId, 'manual_stop')
      return NextResponse.json({ success: true, status: 'stopped' })
    }
    return NextResponse.json({ error: 'Unsupported follow-up action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update follow-up status.' }, { status: 500 })
  }
}
