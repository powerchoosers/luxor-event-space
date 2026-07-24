import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { buildLuxorPaymentRequestEmail } from '@/lib/luxorProposalEmailServer'
import { saveLuxorProposalPdf } from '@/lib/luxorDocumentsServer'
import { createNote } from '@/lib/luxorNotesServer'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildFinalPaymentReminderEmail, buildProposalReminderEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { createUniqueTextJob, queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let invoiceId = 'unknown'
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    invoiceId = id
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const expectedSubtotal = Math.round(invoice.line_items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0), 0) * 100) / 100
    const expectedTotal = Math.round(expectedSubtotal * (1 + Math.max(0, Number(invoice.tax_rate) || 0)) * 100) / 100
    if (Math.abs(expectedSubtotal - Number(invoice.subtotal)) >= 0.005 || Math.abs(expectedTotal - Number(invoice.total)) >= 0.005) {
      return NextResponse.json({ error: 'The invoice totals no longer match its line items. Recreate the proposal before sending it.' }, { status: 409 })
    }
    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) return NextResponse.json({ error: 'Add the lead email address before sending.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { paymentAmount?: number; paymentLabel?: string }
    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
    if (balanceDue <= 0) return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 })
    const requestedAmount = Number(body.paymentAmount)
    const paymentAmount = Number.isFinite(requestedAmount) ? Math.round(requestedAmount * 100) / 100 : balanceDue
    if (paymentAmount < 0.5 || paymentAmount > balanceDue) {
      return NextResponse.json({ error: `Payment must be between $0.50 and $${balanceDue.toFixed(2)}.` }, { status: 400 })
    }
    const paymentLabel = String(body.paymentLabel || (paymentAmount === balanceDue ? 'Remaining balance' : 'Installment payment')).trim().slice(0, 80)
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = bookings.find((item) => item.invoice_id === invoice.id) || bookings[0] || null

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in Vercel before sending a payment link.' }, { status: 503 })
    }

    const stripe = new Stripe(secretKey)
    const origin = new URL(request.url).origin
    const checkoutPayload: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer_email: inquiry.email,
      client_reference_id: invoice.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(paymentAmount * 100),
          product_data: { name: `${paymentLabel} - Luxor Event Space` },
        },
      }],
      metadata: {
        invoice_id: invoice.id,
        inquiry_id: invoice.inquiry_id || '',
        booking_id: booking?.id || '',
        payment_label: paymentLabel,
      },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment/cancelled`,
    }
    const checkout = await stripe.checkout.sessions.create(checkoutPayload, {
      idempotencyKey: `invoice-${invoice.id}-${Math.round(paymentAmount * 100)}-${Math.round(paidTotal * 100)}`,
    })
    if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

    const pdf = await buildLuxorInvoicePdf(invoice, inquiry)
    await saveLuxorProposalPdf({ invoice, inquiryId: invoice.inquiry_id, pdf, createdBy: session.email })
    const now = new Date().toISOString()
    const publicToken = invoice.public_token || crypto.randomUUID()
    const reviewUrl = `${origin}/proposal/${publicToken}`
    await updateInvoice(invoice.id, {
      public_token: publicToken,
      payment_requested_at: now,
      payment_requested_amount: paymentAmount,
      payment_requested_label: paymentLabel,
      stripe_checkout_session_id: checkout.id,
      stripe_checkout_url: checkout.url,
    })
    const email = await buildLuxorPaymentRequestEmail({ invoice, inquiry, reviewUrl, paymentAmount, paymentLabel, paidTotal, balanceDue })
    await sendLuxorZohoEmail({
      to: inquiry.email,
      subject: email.subject,
      content: email.html,
      attachments: [{ filename: `Luxor-Proposal-${invoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })

    const updated = await updateInvoice(invoice.id, { status: 'sent', proposal_sent_at: now })
    let updatedInquiry = inquiry
    if (!['booked', 'closed_lost'].includes(inquiry.status)) {
      updatedInquiry = await updateLuxorInquiry(inquiry.id, {
        status: 'proposal_sent',
        pipeline_stage: 'proposal',
        metadata: {
          ...inquiry.metadata,
          proposal_sent_at: now,
          latest_proposal_invoice_id: invoice.id,
        },
      }) ?? inquiry
      if (inquiry.status !== 'proposal_sent') {
        await createNote(inquiry.id, 'Proposal sent. Lead advanced to Proposal.', 'status_change', session.email)
      }
    }

    try {
      const isFinalBalanceRequest = Boolean(booking) && /remaining|balance/i.test(paymentLabel)
      await cancelQueuedLuxorEmailJobs(inquiry.id, [
        'proposal_view_reminder',
        'proposal_payment_reminder',
        'final_payment_reminder',
      ])

      if (isFinalBalanceRequest) {
        const reminder = buildFinalPaymentReminderEmail({
          inquiry,
          invoice,
          reviewUrl,
          balance: paymentAmount,
          dueDate: booking?.final_payment_due_date,
        })
        await createUniqueLuxorEmailJob({
          inquiryId: inquiry.id,
          bookingId: booking?.id,
          jobType: 'final_payment_reminder',
          recipientEmail: inquiry.email,
          subject: reminder.subject,
          body: reminder.body,
          scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
          automationKey: lifecycleAutomationKey('final_payment_reminder', checkout.id),
          metadata: { invoice_id: invoice.id, checkout_session_id: checkout.id, reminder_sequence: 1 },
        })
      } else {
        const viewReminder = buildProposalReminderEmail({ inquiry, invoice, reviewUrl, kind: 'view', paymentAmount })
        const paymentReminder = buildProposalReminderEmail({ inquiry, invoice, reviewUrl, kind: 'payment', paymentAmount })
        await Promise.all([
          createUniqueLuxorEmailJob({
            inquiryId: inquiry.id,
            bookingId: booking?.id,
            jobType: 'proposal_view_reminder',
            recipientEmail: inquiry.email,
            subject: viewReminder.subject,
            body: viewReminder.body,
            scheduledFor: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
            automationKey: lifecycleAutomationKey('proposal_view_reminder', checkout.id),
            metadata: { invoice_id: invoice.id, checkout_session_id: checkout.id, reminder_sequence: 1 },
          }),
          createUniqueLuxorEmailJob({
            inquiryId: inquiry.id,
            bookingId: booking?.id,
            jobType: 'proposal_payment_reminder',
            recipientEmail: inquiry.email,
            subject: paymentReminder.subject,
            body: paymentReminder.body,
            scheduledFor: new Date(Date.now() + 72 * 60 * 60_000).toISOString(),
            automationKey: lifecycleAutomationKey('proposal_payment_reminder', checkout.id),
            metadata: { invoice_id: invoice.id, checkout_session_id: checkout.id, reminder_sequence: 2 },
          }),
        ])
      }
    } catch (automationError) {
      console.error('[invoice-payment-request] reminder queue failed after the proposal was delivered', automationError)
    }
    if (inquiry.phone && updated) {
      try {
        await queueInvoiceReminderTexts(updated, { phone: inquiry.phone, name: inquiry.full_name })
        await createUniqueTextJob({
          jobType: 'invoice_due_reminder',
          phone: inquiry.phone,
          name: inquiry.full_name,
          inquiryId: inquiry.id,
          bookingId: booking?.id,
          invoiceId: invoice.id,
          scheduledFor: new Date(Date.now() + 72 * 60 * 60_000).toISOString(),
          automationKey: `invoice_payment_request:${invoice.id}:${checkout.id}`,
          body: `Luxor Event Space: Hi ${inquiry.full_name.split(/\s+/)[0] || 'there'}, this is a reminder that your ${paymentAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment request is still open. Review it securely here: ${reviewUrl} Reply STOP to opt out.`,
          requiredScope: 'invoice',
          metadata: { checkout_session_id: checkout.id, due_date: invoice.due_date },
        })
      } catch (automationError) {
        console.error('[invoice-payment-request] text reminder queue failed after the proposal was delivered', automationError)
      }
    }
    return NextResponse.json({ invoice: updated, inquiry: updatedInquiry, checkoutUrl: checkout.url, paymentAmount, balanceDue })
  } catch (error) {
    console.error('[invoice-payment-request] failed', {
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send proposal.' }, { status: 500 })
  }
}
