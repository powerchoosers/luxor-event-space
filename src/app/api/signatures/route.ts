import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { buildSignatureEmail, buildSignatureEmailHtml, createLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createLuxorSignatureRequest, listLuxorSignatureRequests } from '@/lib/luxorSignaturesServer'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '100', 10)
    const signatures = await listLuxorSignatureRequests(Number.isFinite(requestedLimit) ? requestedLimit : 100)
    return NextResponse.json(signatures.map((signature) => ({
      id: signature.id,
      inquiry_id: signature.inquiry_id,
      booking_id: signature.booking_id,
      client_name: signature.client_name,
      status: signature.status,
      contract_title: signature.contract_title,
      created_at: signature.created_at,
      updated_at: signature.updated_at,
      signed_at: signature.signed_at,
    })))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signature requests.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
      metadata: { manual: true, requestedBy: session.email, includes_guest_guide: true },
    })

    try {
      const guide = await downloadLuxorPrivatePdf(signature.guest_guide_path || '')
      await sendLuxorZohoEmail({
        to: signature.client_email,
        subject: email.subject,
        content: buildSignatureEmailHtml(signature),
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
        attachments: [{ filename: 'Luxor-Guest-Guide.pdf', content: guide, contentType: 'application/pdf' }],
      })
      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: new Date().toISOString() })
    } catch (sendError) {
      await updateLuxorEmailJob(job.id, { status: 'failed', last_error: sendError instanceof Error ? sendError.message : 'Email send failed.' })
      throw sendError
    }

    return NextResponse.json({ signature, job }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
