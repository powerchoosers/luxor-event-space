import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, getLuxorBookingByInvoice } from '@/lib/luxorBookingsServer'
import { listNotesByInquiry, createNote } from '@/lib/luxorNotesServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createLuxorEmailJob, updateLuxorEmailJob, processLuxorEmailJobs, listLuxorEmailJobsForInquiry } from '@/lib/luxorEmailJobsServer'
import { buildAiTailoredInvoiceReminderEmail } from '@/lib/luxorLifecycleEmailsServer'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'
import { getLuxorPaymentReminderBookingLookup, getLuxorPaymentReminderDueDate } from '@/lib/luxorPaymentReminderDueDate'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { canSendCorrectedPaymentReminder, runCorrectedPaymentResend } from '@/lib/luxorCorrectedPaymentResend'

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
    if (inquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(inquiry.id)
    if (inquiry?.status === 'closed_lost') {
      return NextResponse.json({ error: 'This lead is marked Deal Lost. Payment reminders and payment links cannot be sent.' }, { status: 409 })
    }
    if (!inquiry?.email) {
      return NextResponse.json({ error: 'Lead email address missing. Add an email to send reminders.' }, { status: 400 })
    }

    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    let balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)

    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({})) as { kind?: 'unpaid_invoice' | 'final_payment'; correctedEmailResend?: boolean; expectedRecipient?: string; sourceJobId?: string }
    if (body.correctedEmailResend) {
      const member = await getLuxorPortalMember(session.email)
      if (!canSendCorrectedPaymentReminder(member)) return NextResponse.json({ error: 'Finance permission is required to send payment links.' }, { status: 403 })
    }
    if (body.correctedEmailResend && body.expectedRecipient?.trim().toLowerCase() !== inquiry.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'The lead email changed after review. Refresh and confirm the corrected recipient again.' }, { status: 409 })
    }
    const bookingLookup = getLuxorPaymentReminderBookingLookup(invoice)
    const booking = bookingLookup && 'bookingId' in bookingLookup
      ? await getLuxorBooking(bookingLookup.bookingId)
      : bookingLookup && 'invoiceId' in bookingLookup
        ? await getLuxorBookingByInvoice(bookingLookup.invoiceId)
        : null
    const isPaymentInvoice = invoice.invoice_kind === 'deposit' || invoice.invoice_kind === 'final_balance' || invoice.invoice_kind === 'security_deposit'

    if (!isPaymentInvoice) {
      return NextResponse.json({ error: 'Payment reminders can only be sent for deposit, final-balance, or security-deposit invoices.' }, { status: 409 })
    }

    // A payment reminder is never a way around the signed-agreement gate.
    // In particular, do not forward an old stored Stripe URL for a booking
    // whose contract is still pending.
    if (isPaymentInvoice && booking?.contract_status !== 'signed') {
      return NextResponse.json({ error: 'The Event Agreement must be signed before a payment reminder or Stripe link can be sent.' }, { status: 409 })
    }
    const dueDate = getLuxorPaymentReminderDueDate({
      invoice_kind: invoice.invoice_kind,
      due_date: invoice.due_date,
      final_payment_due_date: booking?.final_payment_due_date,
    })
    if (!dueDate) {
      return NextResponse.json({ error: invoice.invoice_kind === 'final_balance'
        ? 'Configure a valid final payment due date in the approved payment plan before sending a final-balance reminder.'
        : 'Configure a valid payment due date before sending an invoice reminder.' }, { status: 409 })
    }

    const notes = await listNotesByInquiry(inquiry.id).catch(() => [])

    const reminderKind = invoice.invoice_kind === 'final_balance'
      ? 'final_payment'
      : body.kind === 'unpaid_invoice'
        ? 'unpaid_invoice'
        : 'unpaid_invoice'

    if (body.correctedEmailResend) {
      if (!body.sourceJobId || !/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i.test(body.sourceJobId)) {
        return NextResponse.json({ error: 'The original payment reminder could not be verified.' }, { status: 409 })
      }
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
      const outcome = await runCorrectedPaymentResend({
        reserve: async () => {
          const reservation = await supabaseRest<{ job: import('@/lib/luxorInquiryTypes').LuxorEmailJob; created: boolean; preparing: boolean }>(
            'rpc/luxor_prepare_corrected_payment_email_resend', {
              method: 'POST',
              body: JSON.stringify({ p_inquiry_id: inquiry.id, p_source_job_id: body.sourceJobId, p_invoice_id: invoice.id,
                p_expected_recipient: inquiry.email!.trim().toLowerCase(), p_subject: '', p_body: '' }),
            },
          )
          if (!reservation.job) throw new Error('The payment resend could not be reserved.')
          return reservation
        },
        prepareContent: async () => {
          const checkout = await createLuxorPostContractCheckout({ invoice, inquiry, booking: booking!, origin })
          if (!checkout) throw new Error('This payment invoice no longer has a balance due.')
          const email = await buildAiTailoredInvoiceReminderEmail({
            inquiry, invoice, booking, reviewUrl: checkout.checkoutUrl, balanceDue: checkout.paymentAmount,
            dueDate, notes, kind: reminderKind,
          })
          return { subject: email.subject, body: email.body, checkoutSessionId: checkout.checkoutId, balanceDue: checkout.paymentAmount }
        },
        finalize: async (job, content) => {
          const result = await supabaseRest<{ job: import('@/lib/luxorInquiryTypes').LuxorEmailJob }>(
            'rpc/luxor_finalize_corrected_payment_resend', {
              method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiry.id, p_job_id: job.id,
                p_subject: content.subject, p_body: content.body, p_checkout_session_id: content.checkoutSessionId,
                p_balance_due: content.balanceDue }),
            },
          )
          if (!result.job) throw new Error('The payment resend content could not be finalized.')
          return result.job
        },
        process: processLuxorEmailJobs,
        loadLatest: async (jobId, fallback) => (await listLuxorEmailJobsForInquiry(inquiry.id, 200)).find((candidate) => candidate.id === jobId) || fallback,
      })
      if (outcome.job.status === 'failed' || outcome.job.status === 'cancelled') {
        return NextResponse.json({ job: outcome.job, error: outcome.job.last_error || 'Delivery failed or is unresolved; do not create a new payment email.' }, { status: 409 })
      }
      return NextResponse.json({ job: outcome.job, delivery: outcome.delivery, replayed: outcome.replayed }, { status: 202 })
    }

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
        invoice_id: invoice.id,
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
