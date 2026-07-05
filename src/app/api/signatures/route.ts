import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { buildSignatureEmail, createLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { bookingId } = await request.json()
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 })
    }

    const booking = await getLuxorBooking(bookingId)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const signature = await createLuxorSignatureRequest(booking)
    const email = buildSignatureEmail(signature)
    const job = await createLuxorEmailJob({
      inquiryId: signature.inquiry_id,
      bookingId: signature.booking_id,
      signatureRequestId: signature.id,
      jobType: 'contract_signature',
      recipientEmail: signature.client_email,
      subject: email.subject,
      body: email.body,
      scheduledFor: new Date().toISOString(),
      metadata: { manual: true, requestedBy: session.email },
    })

    return NextResponse.json({ signature, job }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
