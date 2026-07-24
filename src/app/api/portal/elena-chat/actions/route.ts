import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { updateLuxorBooking, getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { createLuxorSignatureRequest, listLuxorSignatureRequests } from '@/lib/luxorSignaturesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

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
        updatedRecord = await updateLuxorBooking(bookingId, updates)
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

      const activeSigs = await listLuxorSignatureRequests(10)
      const existingSig = activeSigs.find((s) => s.booking_id === targetBookingId && s.status !== 'void')

      let signatureReq = existingSig || null

      if (!signatureReq) {
        signatureReq = await createLuxorSignatureRequest(existingBooking)
      }

      const PUBLIC_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com'
      const signingUrl = `${PUBLIC_BASE.replace(/\/$/, '')}/secure-portal/sign/${signatureReq.token}`

      // Send confirmation email with direct signing link if requested
      if (body.sendEmail && signatureReq.client_email) {
        await sendLuxorZohoEmail({
          to: signatureReq.client_email,
          subject: `Luxor Event Space Contract Signature Request - ${existingBooking.event_type || 'Event'}`,
          content: `Hi ${signatureReq.client_name},\n\nYour digital event agreement for Luxor Event Space is ready for signature.\n\nPlease review and sign your contract here:\n${signingUrl}\n\nThank you,\nArianna Patterson\nLuxor Event Space`,
          fromName: 'Arianna Patterson',
        })
      }

      return NextResponse.json({
        success: true,
        signatureRequestId: signatureReq.id,
        signingUrl,
        sentEmail: Boolean(body.sendEmail),
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

      const PUBLIC_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com'
      const publicToken = invoice.public_token || invoice.id
      const checkoutUrl = invoice.stripe_checkout_url || `${PUBLIC_BASE.replace(/\/$/, '')}/proposal/${publicToken}`

      // Trigger standard send if email requested
      if (body.sendEmail) {
        const sendRes = await fetch(`${request.nextUrl.origin}/api/invoices/${invoice.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            paymentAmount: invoice.total,
            paymentLabel: 'Invoice Payment',
          }),
        })

        if (!sendRes.ok) {
          const sendErr = await sendRes.json()
          return NextResponse.json({ error: sendErr.error || 'Failed to deliver invoice email' }, { status: 500 })
        }
      }

      return NextResponse.json({
        success: true,
        invoiceId: invoice.id,
        checkoutUrl,
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
