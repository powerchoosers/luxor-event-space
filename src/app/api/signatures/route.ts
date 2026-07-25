import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { buildSignatureEmail, buildSignatureEmailHtml, cancelQueuedLuxorEmailJobs, createLuxorEmailJob, createUniqueLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildContractReminderEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createLuxorSignatureRequest, getActiveLuxorSignatureRequestByBooking, getLatestLuxorSignatureRequestByBooking, listLuxorSignatureRequests, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '100', 10)
    const bookingId = request.nextUrl.searchParams.get('bookingId')
    if (bookingId) {
      const signature = await getLatestLuxorSignatureRequestByBooking(bookingId)
      if (!signature) return NextResponse.json({ error: 'No contract was found for this booking.' }, { status: 404 })
      return NextResponse.json({
        signature: {
          id: signature.id,
          status: signature.status,
          contract_title: signature.contract_title,
          signed_at: signature.signed_at,
        },
        signingUrl: `/secure-portal/sign/${encodeURIComponent(signature.token)}`,
      })
    }
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

    if (signature.inquiry_id) {
      try {
        await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder', 'contract_signature_reminder'])
        const viewReminder = buildContractReminderEmail({ signature, kind: 'view' })
        const signatureReminder = buildContractReminderEmail({ signature, kind: 'sign' })
        await Promise.all([
          createUniqueLuxorEmailJob({
            inquiryId: signature.inquiry_id,
            bookingId: signature.booking_id,
            signatureRequestId: signature.id,
            jobType: 'contract_view_reminder',
            recipientEmail: signature.client_email,
            subject: viewReminder.subject,
            body: viewReminder.body,
            scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
            automationKey: lifecycleAutomationKey('contract_view_reminder', signature.id),
          }),
          createUniqueLuxorEmailJob({
            inquiryId: signature.inquiry_id,
            bookingId: signature.booking_id,
            signatureRequestId: signature.id,
            jobType: 'contract_signature_reminder',
            recipientEmail: signature.client_email,
            subject: signatureReminder.subject,
            body: signatureReminder.body,
            scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
            automationKey: lifecycleAutomationKey('contract_signature_reminder', signature.id),
          }),
        ])
      } catch (automationError) {
        console.error('Contract delivered, but reminders could not be queued:', automationError)
      }
    }

    return NextResponse.json({ signature, job }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { bookingId, action } = await request.json() as { bookingId?: string; action?: 'cancel' | 'resend' }
    if (!bookingId || !['cancel', 'resend'].includes(action || '')) {
      return NextResponse.json({ error: 'bookingId and a valid action are required.' }, { status: 400 })
    }

    const signature = await getActiveLuxorSignatureRequestByBooking(bookingId)
    if (!signature) {
      return NextResponse.json({ error: 'No active contract was found for this booking.' }, { status: 404 })
    }

    if (action === 'cancel') {
      const cancelledAt = new Date().toISOString()
      const updated = await updateLuxorSignatureRequest(signature.id, {
        status: 'void',
        metadata: {
          ...signature.metadata,
          cancelledAt,
          cancelledBy: session.email,
        },
      })
      await updateLuxorBooking(bookingId, { contract_status: 'void' })
      if (signature.inquiry_id) {
        await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder', 'contract_signature_reminder'])
      }
      await recordLuxorSignatureEvent({
        signatureRequestId: signature.id,
        eventType: 'voided',
        metadata: { cancelledBy: session.email },
      })
      return NextResponse.json({ signature: updated, action: 'cancelled' })
    }

    const resentAt = new Date().toISOString()
    const renewed = await updateLuxorSignatureRequest(signature.id, {
      status: 'sent',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
      metadata: {
        ...signature.metadata,
        lastResentAt: resentAt,
        lastResentBy: session.email,
        resendCount: Number(signature.metadata?.resendCount || 0) + 1,
      },
    }) || signature
    const email = buildSignatureEmail(renewed)
    const job = await createLuxorEmailJob({
      inquiryId: renewed.inquiry_id,
      bookingId: renewed.booking_id,
      signatureRequestId: renewed.id,
      jobType: 'contract_signature',
      recipientEmail: renewed.client_email,
      subject: email.subject,
      body: email.body,
      scheduledFor: resentAt,
      metadata: { manual: true, resend: true, requestedBy: session.email, includes_guest_guide: true },
    })

    try {
      const guide = await downloadLuxorPrivatePdf(renewed.guest_guide_path || '')
      await sendLuxorZohoEmail({
        to: renewed.client_email,
        subject: email.subject,
        content: buildSignatureEmailHtml(renewed),
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
        attachments: [{ filename: 'Luxor-Guest-Guide.pdf', content: guide, contentType: 'application/pdf' }],
      })
      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: resentAt })
    } catch (sendError) {
      await updateLuxorEmailJob(job.id, { status: 'failed', last_error: sendError instanceof Error ? sendError.message : 'Email send failed.' })
      throw sendError
    }

    await updateLuxorBooking(bookingId, { contract_status: 'sent', contract_sent_at: resentAt })
    await recordLuxorSignatureEvent({
      signatureRequestId: renewed.id,
      eventType: 'resent',
      metadata: { resentBy: session.email },
    })
    return NextResponse.json({ signature: renewed, job, action: 'resent' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update the contract request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
