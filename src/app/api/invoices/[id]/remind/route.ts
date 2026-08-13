import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { listNotesByInquiry, createNote } from '@/lib/luxorNotesServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildAiTailoredInvoiceReminderEmail } from '@/lib/luxorLifecycleEmailsServer'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) {
      return NextResponse.json({ error: 'Lead email address missing. Add an email to send reminders.' }, { status: 400 })
    }

    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    let balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)

    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({})) as { kind?: 'unpaid_invoice' | 'final_payment' }
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = invoice.booking_id
      ? await getLuxorBooking(invoice.booking_id)
      : bookings.find((b) => b.invoice_id === invoice.id) || bookings[0] || null
    const isPaymentInvoice = invoice.invoice_kind === 'deposit' || invoice.invoice_kind === 'final_balance'

    // A payment reminder is never a way around the signed-agreement gate.
    // In particular, do not forward an old stored Stripe URL for a booking
    // whose contract is still pending.
    if (isPaymentInvoice && booking?.contract_status !== 'signed') {
      return NextResponse.json({ error: 'The Event Agreement must be signed before a payment reminder or Stripe link can be sent.' }, { status: 409 })
    }
    if (invoice.invoice_kind === 'final_balance' && !booking?.final_payment_due_date) {
      return NextResponse.json({ error: 'Configure the final payment due date in the approved payment plan before sending a final-balance reminder.' }, { status: 409 })
    }

    const notes = await listNotesByInquiry(inquiry.id).catch(() => [])

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    let reviewUrl: string
    let checkoutId: string | null = null
    if (isPaymentInvoice && booking) {
      // Never reuse a stored URL blindly: Checkout Sessions expire. Creating
      // through the post-contract helper either reuses a valid session or
      // safely replaces it, and guarantees that the email CTA is Stripe.
      const checkout = await createLuxorPostContractCheckout({ invoice, inquiry, booking, origin })
      if (!checkout) return NextResponse.json({ error: 'This payment invoice no longer has a balance due.' }, { status: 409 })
      reviewUrl = checkout.checkoutUrl
      checkoutId = checkout.checkoutId
      balanceDue = checkout.paymentAmount
    } else {
      const publicToken = invoice.public_token || crypto.randomUUID()
      if (!invoice.public_token) {
        await updateInvoice(invoice.id, { public_token: publicToken })
      }
      reviewUrl = `${origin}/proposal/${publicToken}`
    }
    const now = new Date().toISOString()
    const reminderKind = invoice.invoice_kind === 'final_balance'
      ? 'final_payment'
      : body.kind === 'unpaid_invoice'
        ? 'unpaid_invoice'
        : 'unpaid_invoice'
    const dueDate = invoice.invoice_kind === 'final_balance'
      ? booking?.final_payment_due_date || null
      : invoice.due_date || null

    const email = await buildAiTailoredInvoiceReminderEmail({
      inquiry,
      invoice,
      booking,
      reviewUrl,
      balanceDue,
      dueDate,
      notes,
      kind: reminderKind,
    })

    const job = await createLuxorEmailJob({
      inquiryId: inquiry.id,
      bookingId: booking?.id || null,
      jobType: reminderKind === 'final_payment' ? 'final_payment_reminder' : 'unpaid_invoice_reminder',
      recipientEmail: inquiry.email,
      subject: email.subject,
      body: email.body,
      scheduledFor: now,
      metadata: {
        manual: true,
        requestedBy: session.email,
        balance_due: balanceDue,
        ...(checkoutId ? { checkout_session_id: checkoutId, flow_stage: 'post_signature_payment' } : {}),
        ai_generated: email.aiGenerated,
      },
    })

    try {
      await sendLuxorZohoEmail({
        to: inquiry.email,
        subject: email.subject,
        content: email.body,
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
      })

      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: now })
      await createNote(
        inquiry.id,
        `AI-tailored invoice reminder sent to ${inquiry.email} (${money(balanceDue)} balance due).`,
        'email_log',
        session.email,
      )

      return NextResponse.json({
        success: true,
        subject: email.subject,
        aiGenerated: email.aiGenerated,
        balanceDue,
        ...(checkoutId ? { checkoutUrl: reviewUrl } : {}),
        recipient: inquiry.email,
      })
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : 'Failed to send email.'
      await updateLuxorEmailJob(job.id, { status: 'failed', last_error: errorMsg })
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to send invoice reminder:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invoice reminder.' },
      { status: 500 },
    )
  }
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
