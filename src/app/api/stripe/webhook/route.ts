import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { ensureLuxorFinalBalanceInvoice, getInvoice, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate, updateInvoice } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { queuePaymentConfirmationText } from '@/lib/luxorTextCampaignsServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { saveLuxorInvoicePdf } from '@/lib/luxorDocumentsServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

function paymentKind(label: string | undefined, invoiceKind?: string) {
  if (invoiceKind === 'deposit') return 'deposit'
  if (invoiceKind === 'final_balance') return 'final'
  const normalized = String(label || '').toLowerCase()
  if (normalized.includes('deposit')) return 'deposit'
  if (normalized.includes('remaining') || normalized.includes('balance')) return 'final'
  return 'installment'
}

async function recordPaidCheckoutSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id || session.client_reference_id
  if (!invoiceId || session.payment_status !== 'paid') return
  const paidAt = new Date().toISOString()
  const kind = paymentKind(session.metadata?.payment_label, session.metadata?.invoice_kind)

  const [payment] = await supabaseRest<LuxorPayment[]>('luxor_payments?on_conflict=processor,processor_reference&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      booking_id: session.metadata?.booking_id || null,
      invoice_id: invoiceId,
      inquiry_id: session.metadata?.inquiry_id || null,
      amount: Number(session.amount_total || 0) / 100,
      status: 'paid',
      payment_method: 'stripe_checkout',
      paid_at: paidAt,
      processor: 'stripe',
      processor_reference: session.id,
      metadata: {
        payment_intent: session.payment_intent || null,
        payment_label: session.metadata?.payment_label || null,
        payment_kind: kind,
      },
    }),
  })

  const [invoice, paidPayments] = await Promise.all([
    getInvoice(invoiceId),
    listPaidPaymentsByInvoice(invoiceId),
  ])
  if (!invoice) return

  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const isFullyPaid = paidTotal + 0.005 >= Number(invoice.total || 0)
  await updateInvoice(invoiceId, {
    status: isFullyPaid ? 'paid' : 'sent',
    paid_at: isFullyPaid ? paidAt : null,
    stripe_invoice_id: typeof session.invoice === 'string' ? session.invoice : session.invoice?.id || null,
  })

  const inquiryId = invoice.inquiry_id || session.metadata?.inquiry_id || null
  let paymentContact: { phone?: string | null; name: string; inquiryId?: string | null } | null = null
  if (inquiryId) {
    const inquiry = await getLuxorInquiry(inquiryId)
    if (inquiry) {
      paymentContact = { phone: inquiry.phone, name: inquiry.full_name, inquiryId: inquiry.id }
      await updateLuxorInquiry(inquiry.id, {
        status: ['booked', 'closed_lost'].includes(inquiry.status) ? inquiry.status : 'proposal_sent',
        pipeline_stage: ['booked', 'closed_lost'].includes(inquiry.status) ? inquiry.pipeline_stage : 'proposal',
        metadata: {
          ...inquiry.metadata,
          latest_payment_at: paidAt,
          latest_paid_invoice_id: invoice.id,
        },
      })
      await cancelQueuedLuxorEmailJobs(inquiry.id, [
        'proposal_view_reminder',
        'proposal_payment_reminder',
        ...(kind === 'final' || isFullyPaid ? ['final_payment_reminder' as const] : []),
      ])
    }
  }

  const bookingId = session.metadata?.booking_id || null
  if (bookingId) {
    const booking = await getLuxorBooking(bookingId)
    if (booking) {
      paymentContact ||= { phone: booking.phone, name: booking.client_name, inquiryId: booking.inquiry_id }
      const depositCovered = kind === 'deposit' && paidTotal + 0.005 >= Number(invoice.total || 0)
      const finalCovered = kind === 'final' && paidTotal + 0.005 >= Number(invoice.total || 0)
      const reservationConfirmed = (depositCovered || Boolean(booking.metadata?.deposit_paid_at)) && booking.contract_status === 'signed'
      const masterInvoiceId = session.metadata?.master_invoice_id || booking.invoice_id
      const masterInvoice = masterInvoiceId ? await getInvoice(masterInvoiceId) : null
      const finalInvoice = reservationConfirmed && masterInvoice
        ? await ensureLuxorFinalBalanceInvoice({
            masterInvoice,
            bookingId: booking.id,
            dueDate: booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date),
          })
        : null
      const updatedBooking = await updateLuxorBooking(booking.id, {
        security_deposit_status: finalCovered ? 'collected' : booking.security_deposit_status,
        status: reservationConfirmed ? 'confirmed' : booking.status === 'draft' ? 'tentative' : booking.status,
        booked_at: reservationConfirmed ? booking.booked_at || paidAt : booking.booked_at,
        metadata: {
          ...booking.metadata,
          ...(depositCovered ? { deposit_paid_at: paidAt } : {}),
          ...(reservationConfirmed ? { reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || paidAt, reservation_state: 'confirmed' } : {}),
          ...(finalInvoice ? { final_balance_invoice_id: finalInvoice.id } : {}),
          ...(finalCovered ? { final_payment_paid_at: paidAt } : {}),
        },
      })
      if (inquiryId && updatedBooking) {
        const inquiry = await getLuxorInquiry(inquiryId)
        if (inquiry && inquiry.status !== 'closed_lost') {
          const planningComplete = Boolean(updatedBooking.metadata?.planning_completed_at) || updatedBooking.status === 'confirmed'
          const nextStage = updatedBooking.contract_status !== 'signed'
            ? 'contract'
            : finalCovered
              ? 'event'
              : planningComplete
                ? 'final_payment'
                : reservationConfirmed
                ? 'planning'
                : 'deposit'
          await updateLuxorInquiry(inquiry.id, {
            status: 'booked',
            pipeline_stage: nextStage,
            metadata: { ...inquiry.metadata, latest_payment_at: paidAt, latest_paid_invoice_id: invoice.id },
          })
          if (reservationConfirmed) {
            await cancelQueuedLuxorEmailJobs(inquiry.id, ['contract_view_reminder', 'contract_signature_reminder', 'proposal_payment_reminder'])
          }
        }
      }

      if (kind === 'deposit' && inquiryId) {
        try {
          const inquiry = await getLuxorInquiry(inquiryId)
          if (inquiry?.email) {
          const paidInvoice = await getInvoice(invoice.id) || invoice
          const pdf = await buildLuxorInvoicePdf(paidInvoice, inquiry)
          await saveLuxorInvoicePdf({ invoice: paidInvoice, inquiryId: inquiry.id, pdf, createdBy: 'Stripe Automation' })
          const job = await createUniqueLuxorEmailJob({
            inquiryId: inquiry.id,
            bookingId: booking.id,
            jobType: 'deposit_payment_confirmation',
            recipientEmail: inquiry.email,
            subject: reservationConfirmed ? 'Your Luxor date is officially reserved' : 'Your 30% Luxor deposit is paid',
            body: reservationConfirmed
              ? 'Your 30% non-refundable deposit and signed agreement are complete. Your event date is officially reserved.'
              : 'Your 30% non-refundable deposit is paid. Complete the agreement to officially reserve your event date.',
            scheduledFor: paidAt,
            automationKey: `deposit_payment_confirmation:${session.id}`,
            metadata: { automated: true, invoice_id: invoice.id, stripe_checkout_session_id: session.id, includes_paid_invoice: true },
          })
          if (job.status !== 'sent') try {
            await sendLuxorZohoEmail({
              to: inquiry.email,
              subject: reservationConfirmed ? 'Your Luxor date is officially reserved' : 'Your 30% Luxor deposit is paid',
              content: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#f8f3e9;color:#221d18;padding:36px;border-top:4px solid #b98a3d"><p style="letter-spacing:.22em;text-transform:uppercase;color:#9b6d24;font-size:11px;font-weight:700">Luxor Event Space</p><h1 style="font-family:Georgia,serif;font-size:32px">${reservationConfirmed ? 'Your date is officially reserved' : 'Your deposit is confirmed'}</h1><p>Hi ${inquiry.full_name.split(/\s+/)[0] || inquiry.full_name},</p><p>We received your 30% non-refundable booking deposit of ${Number(paidInvoice.total).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.</p><p>${reservationConfirmed ? 'Your agreement is also complete, so your event date is officially reserved. We will continue with planning next.' : 'Your date remains pending until the agreement is signed. Please use the agreement link from your booking-package email.'}</p><p>Your paid deposit invoice is attached for your records.</p></div>`,
              from: 'booking@luxoratlaspalmas.com',
              fromName: 'Luxor Event Space',
              attachments: [{ filename: `Luxor-Paid-Deposit-Invoice-${paidInvoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' }],
            })
            await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: new Date().toISOString() })
          } catch (emailError) {
            await updateLuxorEmailJob(job.id, { status: 'failed', last_error: emailError instanceof Error ? emailError.message : 'Email send failed.' })
            console.error('Deposit recorded, but its paid-invoice email failed:', emailError)
          }
          }
        } catch (confirmationError) {
          console.error('Deposit recorded, but its paid-invoice confirmation workflow failed:', confirmationError)
        }
      }
    }
  }
  if (payment && paymentContact) {
    try {
      await queuePaymentConfirmationText(payment, paymentContact)
    } catch (automationError) {
      console.error('Stripe payment recorded, but its text confirmation could not be queued:', automationError)
    }
  }
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })

  try {
    const stripe = new Stripe(secretKey)
    const signature = request.headers.get('stripe-signature')
    if (!signature) return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
    const event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await recordPaidCheckoutSession(event.data.object)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook.' }, { status: 400 })
  }
}
