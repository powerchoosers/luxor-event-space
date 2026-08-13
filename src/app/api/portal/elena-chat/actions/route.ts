import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { getActiveLuxorSignatureRequestByBooking } from '@/lib/luxorSignaturesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized portal session' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'Action type is required' }, { status: 400 })
    }

    // 1. Action: UPDATE_LEAD
    if (action === 'UPDATE_LEAD') {
      const { inquiryId, bookingId, updates } = body as {
        inquiryId?: string
        bookingId?: string
        updates: Record<string, unknown>
      }

      if (!inquiryId && !bookingId) {
        return NextResponse.json({ error: 'Inquiry ID or Booking ID is required for lead update' }, { status: 400 })
      }

      let updatedRecord: unknown = null

      if (inquiryId) {
        updatedRecord = await updateLuxorInquiry(inquiryId, updates)
      } else if (bookingId) {
        // Reuse the protected booking endpoint so Elena cannot sidestep the
        // locked-proposal, contract-signing, conflict, and audit safeguards.
        const bookingResponse = await fetch(`${request.nextUrl.origin}/api/bookings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
          body: JSON.stringify({ id: bookingId, ...updates }),
        })
        const bookingBody = await bookingResponse.json().catch(() => ({}))
        if (!bookingResponse.ok) {
          return NextResponse.json({ error: bookingBody.error || 'Unable to update the booking.' }, { status: bookingResponse.status })
        }
        updatedRecord = bookingBody
      }

      return NextResponse.json({ success: true, updatedRecord })
    }

    // 2. Action: SEND_CONTRACT
    if (action === 'SEND_CONTRACT') {
      const { inquiryId, bookingId } = body as { inquiryId?: string; bookingId?: string }

      let targetBookingId = bookingId

      if (!targetBookingId && inquiryId) {
        const bookings = await listLuxorBookingsByInquiry(inquiryId)
        if (bookings.length > 0) {
          targetBookingId = bookings[0].id
        }
      }

      if (!targetBookingId) {
        return NextResponse.json({ error: 'No booking record found to generate a contract for. Please create a booking first.' }, { status: 404 })
      }

      // Fetch complete booking record
      const existingBooking = await getLuxorBooking(targetBookingId)

      if (!existingBooking) {
        return NextResponse.json({ error: 'Booking record not found' }, { status: 404 })
      }

      const proposal = existingBooking.invoice_id ? await getInvoice(existingBooking.invoice_id) : null
      if (!proposal || proposal.invoice_kind !== 'event' || proposal.status !== 'sent' || !proposal.price_locked_at || !proposal.proposal_accepted_at || proposal.offer_status === 'withdrawn') {
        return NextResponse.json({ error: 'The client must first accept a sent, price-locked final proposal. That acceptance automatically starts the Event Agreement.' }, { status: 409 })
      }

      const activeSignature = await getActiveLuxorSignatureRequestByBooking(existingBooking.id)
      if (!body.sendEmail) {
        if (!activeSignature) {
          return NextResponse.json({ error: 'No active Event Agreement is available yet. Ask the client to accept the final proposal first.' }, { status: 409 })
        }
        const publicBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com'
        return NextResponse.json({
          success: true,
          signatureRequestId: activeSignature.id,
          signingUrl: `${publicBase.replace(/\/$/, '')}/secure-portal/sign/${activeSignature.token}`,
          sentEmail: false,
        })
      }

      // Acceptance creates the first agreement email. This assistant may only
      // resend that agreement; it cannot create a contract before acceptance.
      const signatureRes = await fetch(`${request.nextUrl.origin}/api/signatures`, {
        method: activeSignature ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify(activeSignature
          ? { bookingId: existingBooking.id, action: 'resend' }
          : { bookingId: existingBooking.id, sendEmail: true }),
      })
      const signatureData = await signatureRes.json().catch(() => ({}))
      if (!signatureRes.ok) return NextResponse.json({ error: signatureData.error || 'Failed to resend the Event Agreement.' }, { status: signatureRes.status })
      const signature = signatureData.signature
      const publicBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com'
      return NextResponse.json({
        success: true,
        signatureRequestId: signature?.id || activeSignature?.id,
        signingUrl: signature?.token
          ? `${publicBase.replace(/\/$/, '')}/secure-portal/sign/${signature.token}`
          : activeSignature ? `${publicBase.replace(/\/$/, '')}/secure-portal/sign/${activeSignature.token}` : null,
        sentEmail: true,
      })
    }

    // 3. Action: SEND_INVOICE
    if (action === 'SEND_INVOICE') {
      const { invoiceId, inquiryId } = body as { invoiceId?: string; inquiryId?: string }

      let targetInvoiceId = invoiceId

      if (!targetInvoiceId && inquiryId) {
        const invoices = await supabaseRest<Array<{ id: string }>>(
          `luxor_invoices?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=1`
        )
        if (invoices.length > 0) {
          targetInvoiceId = invoices[0].id
        }
      }

      if (!targetInvoiceId) {
        return NextResponse.json({ error: 'No invoice record found for this lead.' }, { status: 404 })
      }

      const invoice = await getInvoice(targetInvoiceId)
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }

      const invoiceBookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
      const booking = invoice.booking_id
        ? await getLuxorBooking(invoice.booking_id)
        : invoiceBookings.find((candidate) => candidate.invoice_id === invoice.id) || null
      if ((invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance') || booking?.contract_status !== 'signed') {
        return NextResponse.json({ error: 'A signed Event Agreement and a scheduled booking-payment invoice are required before a Stripe link can be sent or copied.' }, { status: 409 })
      }

      let checkoutUrl = invoice.stripe_checkout_url || ''

      // Trigger standard send if email requested
      if (body.sendEmail) {
        const sendRes = await fetch(`${request.nextUrl.origin}/api/invoices/${invoice.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            mode: 'payment',
          }),
        })

        if (!sendRes.ok) {
          const sendErr = await sendRes.json()
          return NextResponse.json({ error: sendErr.error || 'Failed to deliver invoice email' }, { status: 500 })
        }
        const sendData = await sendRes.json().catch(() => ({}))
        checkoutUrl = sendData.checkoutUrl || checkoutUrl
      }

      return NextResponse.json({
        success: true,
        invoiceId: invoice.id,
        checkoutUrl: checkoutUrl || null,
        sentEmail: Boolean(body.sendEmail),
      })
    }

    // 4. Action: CREATE_TASK
    if (action === 'CREATE_TASK') {
      const { title, description, priority, dueDate, inquiryId } = body as {
        title: string
        description?: string
        priority?: 'low' | 'medium' | 'high'
        dueDate?: string
        inquiryId?: string
      }

      if (!title || !title.trim()) {
        return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
      }

      const [createdTask] = await supabaseRest<Array<{ id: string; title: string }>>('luxor_tasks?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: title.trim(),
          description: description ? description.trim() : null,
          priority: priority || 'medium',
          due_date: dueDate || null,
          inquiry_id: inquiryId || null,
          status: 'pending',
        }),
      })

      return NextResponse.json({ success: true, task: createdTask })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    console.error('Elena Chat Action endpoint error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
