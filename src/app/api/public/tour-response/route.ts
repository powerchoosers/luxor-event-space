import { NextRequest, NextResponse } from 'next/server'
import { getLuxorInquiryByTourToken, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'

export async function POST(request: NextRequest) {
  try {
    const { token, action } = await request.json()
    const inquiry = await getLuxorInquiryByTourToken(String(token || ''))

    if (!inquiry) {
      return NextResponse.json({ error: 'Tour response link not found.' }, { status: 404 })
    }

    if (action === 'confirm') {
      const updated = await updateLuxorInquiry(inquiry.id, {
        status: 'tour_confirmed',
        pipeline_stage: 'tour',
        tour_attendance_status: 'pending',
        tour_confirmed_at: new Date().toISOString(),
      })
      await createNote(inquiry.id, 'Client confirmed their tour from email link.', 'status_change', 'Client')
      return NextResponse.json({ inquiry: updated, message: 'Tour confirmed.' })
    }

    if (action === 'reschedule') {
      const updated = await updateLuxorInquiry(inquiry.id, {
        status: 'tour_requested',
        pipeline_stage: 'tour',
        tour_attendance_status: 'rescheduled',
      })
      await createNote(inquiry.id, 'Client requested to reschedule from email link.', 'status_change', 'Client')
      return NextResponse.json({ inquiry: updated, message: 'Reschedule request received.' })
    }

    return NextResponse.json({ error: 'Unsupported response action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record tour response.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
