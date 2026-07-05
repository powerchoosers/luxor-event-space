import { NextRequest, NextResponse } from 'next/server'
import { buildTourEmail, createLuxorEmailJob, createPublicToken } from '@/lib/luxorEmailJobsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LuxorEmailJobKind, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const inquiryId = String(body.inquiryId || '')
    const action = String(body.action || '')

    if (!inquiryId) {
      return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })
    }

    const inquiry = await getLuxorInquiry(inquiryId)
    if (!inquiry) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }

    if (action === 'attendance') {
      const attendance = String(body.attendance || 'pending') as LuxorTourAttendanceStatus
      const updates: Record<string, unknown> = { tour_attendance_status: attendance }

      if (attendance === 'attended') updates.status = 'tour_confirmed'
      if (attendance === 'no_show') updates.pipeline_stage = 'tour'

      const updated = await updateLuxorInquiry(inquiryId, updates)
      await createNote(inquiryId, `Tour attendance marked as ${attendance.replaceAll('_', ' ')}.`, 'status_change', 'Portal Owner')
      return NextResponse.json(updated)
    }

    if (action === 'send-email') {
      if (!inquiry.email) {
        return NextResponse.json({ error: 'This lead does not have an email address.' }, { status: 400 })
      }

      const jobType = String(body.jobType || 'tour_confirmation') as LuxorEmailJobKind
      const token = inquiry.tour_response_token || createPublicToken()
      const email = buildTourEmail(jobType, inquiry, token)
      const job = await createLuxorEmailJob({
        inquiryId,
        jobType,
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: email.body,
        scheduledFor: new Date().toISOString(),
        metadata: { manual: true, requestedBy: session.email },
      })

      const marker: Record<string, unknown> = { tour_response_token: token }
      if (jobType === 'tour_confirmation') marker.tour_confirmed_at = new Date().toISOString()
      if (jobType === 'tour_no_show_reschedule') marker.tour_no_show_email_sent_at = new Date().toISOString()
      await updateLuxorInquiry(inquiryId, marker)
      await createNote(inquiryId, `Queued ${jobType.replaceAll('_', ' ')} email to ${inquiry.email}.`, 'email_log', 'Portal Owner')

      return NextResponse.json(job, { status: 201 })
    }

    return NextResponse.json({ error: 'Unsupported tour action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tour action failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
