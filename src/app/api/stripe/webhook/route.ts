import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { ensureLuxorFinalBalanceInvoice, getInvoice, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate, updateInvoice } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { queuePaymentConfirmationText } from '@/lib/luxorTextCampaignsServer'
import { luxorCollectionAmounts } from '@/lib/luxorPaymentOwnership'
import type { LuxorBooking, LuxorInvoice, LuxorPayment } from '@/lib/luxorInquiryTypes'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { saveLuxorInvoicePdf } from '@/lib/luxorDocumentsServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { hasLuxorOffer, isLuxorOfferExpired, luxorOfferSnapshot } from '@/lib/luxorOffer'

function paymentKind(label: string | undefined, invoiceKind?: string) {
  if (invoiceKind === 'security_deposit') return 'security_deposit'
  if (invoiceKind === 'deposit') return 'deposit'
  if (invoiceKind === 'final_balance') return 'final'
  const normalized = String(label || '').toLowerCase()
  if (normalized.includes('deposit')) return 'deposit'
  if (normalized.includes('remaining') || normalized.includes('balance')) return 'final'
  return 'installment'
}

function configuredFinalPaymentDueDate(booking: LuxorBooking) {
  const dueDate = booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date)
  return typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function getInitialPaymentBreakdown(invoice: LuxorInvoice) {
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const securityDeposit = Math.max(0, Number(lineItems.find((item) =>
    item.paymentBucket === 'security_deposit' || /refundable security deposit/i.test(item.description || ''),
  )?.total || 0))
  const initialBookingPayment = Math.max(0, Number(lineItems.find((item) =>
    item.paymentBucket === 'venue' || /initial booking payment/i.test(item.description || ''),
  )?.total || Number(invoice.total || 0) - securityDeposit))

  return {
    initialBookingPayment,
    securityDeposit,
    total: Number(invoice.total || initialBookingPayment + securityDeposit),
  }
}

async function recordPaidCheckoutSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id || session.client_reference_id
  if (!invoiceId || session.payment_status !== 'paid') return
  const paidAt = new Date().toISOString()
  const kind = paymentKind(session.metadata?.payment_label, session.metadata?.invoice_kind)
  const invoice = await getInvoice(invoiceId)
  if (!invoice) {
    console.error(`Stripe payment ${session.id} references an invoice that no longer exists: ${invoiceId}`)
    return
  }
  const collectionMasterInvoice = invoice.invoice_kind === 'event'
    ? invoice
    : invoice.parent_invoice_id ? await getInvoice(invoice.parent_invoice_id) : null
  const luxorOnlyCollection = Boolean(collectionMasterInvoice && luxorCollectionAmounts(collectionMasterInvoice).scoped)

  const bookingId = session.metadata?.booking_id || invoice.booking_id || null
  const booking = bookingId ? await getLuxorBooking(bookingId) : null
  const inquiryId = invoice.inquiry_id || session.metadata?.inquiry_id || booking?.inquiry_id || null

  // A payment can race with a close-out in the few seconds between a client
  // loading Checkout and Stripe receiving the expiry request. Do not apply a
  // later Stripe payment to a deal that is already closed lost; leave the
  // payment untouched for an owner to review/refund manually.
  const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
  if (inquiry?.status === 'closed_lost') {
    const noteContent = `Stripe reported a payment for a deal already marked lost. It was not applied to the booking or invoice automatically; review the Stripe payment and decide whether a refund is needed.`
    const existingNotes = await listNotesByInquiry(inquiry.id).catch(() => [])
    if (!existingNotes.some((note) => note.content === noteContent)) {
      await createNote(inquiry.id, noteContent, 'note', 'Stripe Safety Guard').catch(() => null)
    }
    console.error(`Blocked Stripe payment ${session.id} because inquiry ${inquiry.id} is closed lost.`)
    return
  }

  // Stripe can still complete a Checkout Session that was created by the
  // former flow. Do not record or apply that payment if its booking has not
  // signed an Event Agreement. Instead, make the exception visible for owner
  // review/refund; acknowledging the webhook prevents duplicate alerts.
  if (booking && booking.contract_status !== 'signed') {
    const previouslyFlagged = booking.metadata?.precontract_stripe_payment_session_id === session.id
    await updateLuxorBooking(booking.id, {
      metadata: {
        ...booking.metadata,
        precontract_stripe_payment_detected_at: booking.metadata?.precontract_stripe_payment_detected_at || paidAt,
        precontract_stripe_payment_session_id: session.id,
        precontract_stripe_payment_invoice_id: invoice.id,
        precontract_stripe_payment_amount: Number(session.amount_total || 0) / 100,
      },
    })
    if (inquiryId && !previouslyFlagged) {
      await createNote(
        inquiryId,
        `Stripe reported a payment from an old link before the Event Agreement was signed. It was not applied to the booking; review the Stripe payment and refund or reconcile it manually before taking further action.`,
        'note',
        'Stripe Safety Guard',
      ).catch(() => null)
    }
    console.error(`Blocked pre-contract Stripe payment ${session.id} for booking ${booking.id}. It was not recorded in Luxor.`)
    return
  }

  const [payment] = await supabaseRest<LuxorPayment[]>('luxor_payments?on_conflict=processor,processor_reference&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
        booking_id: bookingId,
        invoice_id: invoiceId,
        inquiry_id: inquiryId,
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
        offer_percent: session.metadata?.offer_percent || '0',
        offer_savings: session.metadata?.offer_savings || '0',
        offer_expires_at: session.metadata?.offer_expires_at || null,
        stripe_coupon_id: session.metadata?.stripe_coupon_id || null,
      },
    }),
  })

  const paidPayments = await listPaidPaymentsByInvoice(invoiceId)

  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const isFullyPaid = paidTotal + 0.005 >= Number(invoice.total || 0)
  await updateInvoice(invoiceId, {
    status: isFullyPaid ? 'paid' : 'sent',
    paid_at: isFullyPaid ? paidAt : null,
    stripe_invoice_id: typeof session.invoice === 'string' ? session.invoice : session.invoice?.id || null,
  })

  let paymentContact: { phone?: string | null; name: string; inquiryId?: string | null } | null = null
  if (inquiryId) {
    const linkedInquiry = inquiry || await getLuxorInquiry(inquiryId)
    if (linkedInquiry) {
      paymentContact = { phone: linkedInquiry.phone, name: linkedInquiry.full_name, inquiryId: linkedInquiry.id }
      await updateLuxorInquiry(linkedInquiry.id, {
        status: linkedInquiry.status === 'booked' ? linkedInquiry.status : 'proposal_sent',
        pipeline_stage: linkedInquiry.status === 'booked' ? linkedInquiry.pipeline_stage : 'proposal',
        metadata: {
          ...linkedInquiry.metadata,
          latest_payment_at: paidAt,
          latest_paid_invoice_id: invoice.id,
        },
      })
      await cancelQueuedLuxorEmailJobs(linkedInquiry.id, [
        'proposal_view_reminder',
        'proposal_payment_reminder',
        ...(kind === 'final' || isFullyPaid ? ['final_payment_reminder' as const] : []),
      ])
    }
  }

  if (booking) {
      paymentContact ||= { phone: booking.phone, name: booking.client_name, inquiryId: booking.inquiry_id }
      // New bookings can only reach Stripe after the agreement is signed. The
      // Luxor booking payment and the refundable security deposit are separate
      // child invoices for new proposals; legacy invoices may still contain
      // both historical amounts and are handled without rewriting them.
      const fullEventPaymentCoversDeposit = invoice.id === booking.invoice_id && paidTotal + 0.005 >= Number(booking.deposit_required || 0)
      const securityDepositCovered = kind === 'security_deposit' && paidTotal + 0.005 >= Number(invoice.total || 0)
      const depositCovered = (kind === 'deposit' && paidTotal + 0.005 >= Number(invoice.total || 0)) || fullEventPaymentCoversDeposit
      const finalCovered = kind === 'final' && paidTotal + 0.005 >= Number(invoice.total || 0) && !luxorOnlyCollection
      const reservationConfirmed = (depositCovered || Boolean(booking.metadata?.deposit_paid_at)) && booking.contract_status === 'signed'
      const masterInvoiceId = session.metadata?.master_invoice_id || booking.invoice_id
      const masterInvoice = (masterInvoiceId ? await getInvoice(masterInvoiceId) : null) || collectionMasterInvoice
      const finalPaymentDueDate = configuredFinalPaymentDueDate(booking)
      const finalPaymentScheduleMissing = reservationConfirmed && Boolean(masterInvoice) && !finalPaymentDueDate
      // Legacy bookings may have no approved final-payment date. The Stripe
      // payment is already real, so record it safely and flag the booking for
      // configuration rather than throw after the payment has been recorded.
      const finalInvoice = reservationConfirmed && masterInvoice && finalPaymentDueDate
          ? await ensureLuxorFinalBalanceInvoice({
            masterInvoice,
            bookingId: booking.id,
            dueDate: finalPaymentDueDate,
            depositPaid: fullEventPaymentCoversDeposit && paidTotal + 0.005 >= Number(booking.contract_total || masterInvoice.total || 0)
              ? Number(booking.contract_total || masterInvoice.total || 0)
              : Number(booking.deposit_required || 0),
          })
        : null
      const updatedBooking = await updateLuxorBooking(booking.id, {
        // The security deposit is already part of the completed deposit child
        // invoice. It is held after receipt; the final balance never includes it.
        security_deposit_status: securityDepositCovered || (kind === 'deposit' && depositCovered) ? 'held' : booking.security_deposit_status,
        status: reservationConfirmed ? 'confirmed' : booking.status === 'draft' ? 'tentative' : booking.status,
        booked_at: reservationConfirmed ? booking.booked_at || paidAt : booking.booked_at,
        metadata: {
          ...booking.metadata,
          ...(depositCovered ? { deposit_paid_at: paidAt } : {}),
          ...(kind === 'deposit' && depositCovered ? {
            security_deposit_collected_at: paidAt,
            security_deposit_held_at: paidAt,
            security_deposit_payment_invoice_id: invoice.id,
          } : {}),
          ...(securityDepositCovered ? {
            security_deposit_collected_at: booking.metadata?.security_deposit_collected_at || paidAt,
            security_deposit_held_at: booking.metadata?.security_deposit_held_at || paidAt,
            security_deposit_payment_invoice_id: invoice.id,
          } : {}),
          ...(reservationConfirmed ? { reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || paidAt, reservation_state: 'confirmed' } : {}),
          ...(finalInvoice ? { final_balance_invoice_id: finalInvoice.id } : {}),
          ...(finalPaymentScheduleMissing ? {
            final_payment_schedule_configuration_required_at: booking.metadata?.final_payment_schedule_configuration_required_at || paidAt,
          } : {}),
          ...(finalCovered ? { final_payment_paid_at: paidAt } : {}),
          ...(kind === 'final' && luxorOnlyCollection ? { luxor_services_paid_at: paidAt, luxor_services_payment_invoice_id: invoice.id } : {}),
        },
      })
      if (finalPaymentScheduleMissing && inquiryId && !booking.metadata?.final_payment_schedule_configuration_required_at) {
        await createNote(
          inquiryId,
          'The signed booking payment was recorded, but the approved proposal is missing its final payment due date. Configure that date before sending the final balance request.',
          'note',
          'Stripe Payment Automation',
        ).catch(() => null)
      }
      const offerInvoice = masterInvoice || invoice
      const offerDeadline = offerInvoice.offer_expires_at ? new Date(offerInvoice.offer_expires_at).getTime() : null
      const signatureTime = booking.contract_signed_at ? new Date(booking.contract_signed_at).getTime() : null
      const offerSecured = reservationConfirmed && hasLuxorOffer(offerInvoice) && !isLuxorOfferExpired(offerInvoice, new Date(paidAt)) &&
        (!offerDeadline || (signatureTime !== null && signatureTime <= offerDeadline))
      if (offerSecured) {
        await updateInvoice(offerInvoice.id, { offer_status: 'redeemed', offer_redeemed_at: paidAt })
      }
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
            const paidOffer = luxorOfferSnapshot(offerInvoice)
            const securedOfferMessage = reservationConfirmed && hasLuxorOffer(offerInvoice)
              ? `<p>Your ${paidOffer.percent}% limited-time offer, saving ${paidOffer.savings.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, is secured with your completed agreement and payment.</p>`
              : ''
            const paymentBreakdown = getInitialPaymentBreakdown(paidInvoice)
            const paymentExplanation = paymentBreakdown.securityDeposit > 0
              ? `We received your initial booking payment of <strong>${formatMoney(paymentBreakdown.initialBookingPayment)}</strong> and your separate refundable security deposit of <strong>${formatMoney(paymentBreakdown.securityDeposit)}</strong> (total received: ${formatMoney(paymentBreakdown.total)}). The refundable security deposit is held through the event period and returned following the post-event inspection, subject to the Event Agreement.`
              : `We received your initial booking payment of <strong>${formatMoney(paymentBreakdown.total)}</strong>.`
            const paymentSummary = paymentBreakdown.securityDeposit > 0
              ? `We received your initial booking payment of ${formatMoney(paymentBreakdown.initialBookingPayment)} and your separate refundable security deposit of ${formatMoney(paymentBreakdown.securityDeposit)} (total received: ${formatMoney(paymentBreakdown.total)}). The refundable security deposit is now held through the post-event inspection, subject to the Event Agreement.`
              : `We received your initial booking payment of ${formatMoney(paymentBreakdown.total)}.`
            const pdf = await buildLuxorInvoicePdf(paidInvoice, inquiry)
            await saveLuxorInvoicePdf({ invoice: paidInvoice, inquiryId: inquiry.id, pdf, createdBy: 'Stripe Automation' })
            const job = await createUniqueLuxorEmailJob({
              inquiryId: inquiry.id,
              bookingId: booking.id,
              jobType: 'deposit_payment_confirmation',
              recipientEmail: inquiry.email,
              subject: reservationConfirmed ? 'Your Luxor date is officially reserved' : 'Your Luxor booking payment is confirmed',
              body: reservationConfirmed
                ? `${paymentSummary} Your signed agreement and payment are complete, so your event date is officially reserved.`
                : `${paymentSummary} Your date remains pending until the agreement is signed.`,
              scheduledFor: paidAt,
              automationKey: `deposit_payment_confirmation:${session.id}`,
              metadata: {
                automated: true,
                invoice_id: invoice.id,
                stripe_checkout_session_id: session.id,
                includes_paid_invoice: true,
                initial_booking_payment: paymentBreakdown.initialBookingPayment,
                refundable_security_deposit: paymentBreakdown.securityDeposit,
              },
            })
            if (job.status !== 'sent') try {
              await sendLuxorZohoEmail({
                to: inquiry.email,
                subject: reservationConfirmed ? 'Your Luxor date is officially reserved' : 'Your Luxor booking payment is confirmed',
                content: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#f8f3e9;color:#221d18;padding:36px;border-top:4px solid #b98a3d"><p style="letter-spacing:.22em;text-transform:uppercase;color:#9b6d24;font-size:11px;font-weight:700">Luxor Event Space</p><h1 style="font-family:Georgia,serif;font-size:32px">${reservationConfirmed ? 'Your date is officially reserved' : 'Your booking payment is confirmed'}</h1><p>Hi ${inquiry.full_name.split(/\s+/)[0] || inquiry.full_name},</p><p>${paymentExplanation}</p><p>${reservationConfirmed ? 'Your signed agreement and payment are complete, so your event date is officially reserved. We will continue with planning next.' : 'Your date remains pending until the agreement is signed.'}</p>${securedOfferMessage}<p>Your paid booking-payment invoice is attached for your records.</p></div>`,
                from: 'booking@luxoratlaspalmas.com',
                fromName: 'Luxor Event Space',
                attachments: [{ filename: `Luxor-Paid-Booking-Payment-Invoice-${paidInvoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' }],
              })
              await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: new Date().toISOString() })
            } catch (emailError) {
              await updateLuxorEmailJob(job.id, { status: 'failed', last_error: emailError instanceof Error ? emailError.message : 'Email send failed.' })
              console.error('Booking payment recorded, but its paid-invoice email failed:', emailError)
            }
          }
        } catch (confirmationError) {
          console.error('Deposit recorded, but its paid-invoice confirmation workflow failed:', confirmationError)
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
