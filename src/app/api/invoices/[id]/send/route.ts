import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { ensureLuxorDepositInvoice, getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { buildLuxorDateLockDepositEmail, buildLuxorProposalEmail, buildLuxorPaymentRequestEmail, buildLuxorProposalContractEmail } from '@/lib/luxorProposalEmailServer'
import { downloadLuxorDocument, downloadLuxorPrivatePdf, getLuxorDocumentByInvoice, saveLuxorInvoicePdf, saveLuxorProposalPdf } from '@/lib/luxorDocumentsServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import { cancelQueuedLuxorEmailJobs, createLuxorEmailJob, createUniqueLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildAiOfferReminderEmail, buildContractReminderEmail, buildFinalPaymentReminderEmail, buildPaymentReminderEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { createUniqueTextJob, queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'
import { createLuxorSignatureRequest, getActiveLuxorSignatureRequestByBooking, getLuxorBookingContractFingerprint, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { createLuxorPostContractCheckout, expireLuxorCheckoutForRepricing } from '@/lib/luxorStripeCheckoutServer'
import type { LuxorSignatureRequest } from '@/lib/luxorInquiryTypes'
import { calculateLuxorOfferPricing, isLuxorOfferExpired, luxorOfferSnapshot } from '@/lib/luxorOffer'

const PAYMENT_PLAN_REQUIRED = 'Set the payment plan in Step 5 before publishing this final proposal.'

function offerReminderTimes(expiresAt?: string | null) {
  if (!expiresAt) return []
  const expiry = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiry)) return []
  const now = Date.now()
  const candidates = [now + 24 * 60 * 60_000, expiry - 4 * 60 * 60_000]
  return candidates
    .filter((time, index, values) => time > now + 15 * 60_000 && time < expiry - 5 * 60_000 && values.indexOf(time) === index)
    .sort((a, b) => a - b)
    .map((time) => new Date(time).toISOString())
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let invoiceId = 'unknown'
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    invoiceId = id
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const finalProposalContext = invoice.invoice_kind === 'event' && invoice.proposal_context && typeof invoice.proposal_context === 'object'
      ? invoice.proposal_context
      : null
    // Final proposals are calculated by the dedicated pricing engine and can
    // include an approved fixed-dollar adjustment. The older generic invoice
    // calculator cannot safely validate that snapshot, so it remains only for
    // legacy and payment invoices.
    if (!finalProposalContext) {
      const expectedPricing = calculateLuxorOfferPricing({ lineItems: invoice.line_items, taxRate: Number(invoice.tax_rate) || 0, discountPercent: Number(invoice.discount_percent) || 0 })
      if (Math.abs(expectedPricing.subtotal - Number(invoice.subtotal)) >= 0.005 || Math.abs(expectedPricing.total - Number(invoice.total)) >= 0.005 || Math.abs(expectedPricing.originalTotal - Number(invoice.original_total ?? invoice.total)) >= 0.005) {
        return NextResponse.json({ error: 'The invoice totals no longer match its line items. Recreate the proposal before sending it.' }, { status: 409 })
      }
    }
    if (isLuxorOfferExpired(invoice)) {
      if (invoice.stripe_checkout_session_id) await expireLuxorCheckoutForRepricing(invoice)
      await updateInvoice(invoice.id, {
        offer_status: 'expired',
        stripe_checkout_session_id: null,
        stripe_checkout_url: null,
        stripe_checkout_opened_at: null,
        payment_requested_at: null,
        payment_requested_amount: null,
        payment_requested_label: null,
      })
      return NextResponse.json({ error: 'This proposal offer has expired. Create a new offer before sending or collecting payment.' }, { status: 410 })
    }
    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) return NextResponse.json({ error: 'Add the lead email address before sending.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { mode?: 'proposal' | 'proposal_contract' | 'payment' | 'date_lock_deposit'; paymentAmount?: number; paymentLabel?: string }

    // A final proposal is selected first. It is deliberately a distinct event
    // from contract signature, and neither legacy route is allowed to create
    // a payment session before that agreement has been signed.
    if (body.mode === 'date_lock_deposit') {
      return NextResponse.json({ error: 'Stripe payment links are issued only after the Event Agreement is signed. Send the final proposal first.' }, { status: 409 })
    }
    if (body.mode === 'proposal_contract') {
      return NextResponse.json({ error: 'The client receives the Event Agreement only after selecting the final proposal from their private page.' }, { status: 409 })
    }
    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    let booking = invoice.booking_id
      ? await getLuxorBooking(invoice.booking_id)
      : bookings.find((item) => item.invoice_id === invoice.id) || null

    if ((body.mode as string) === 'date_lock_deposit' && process.env.LUXOR_ENABLE_LEGACY_PRE_SIGN_DEPOSIT_FLOW === 'true') {
      // Legacy pre-sign payment flow retained below temporarily for source
      // history. New requests are rejected after this block.
      if (!booking) {
        return NextResponse.json({ error: 'Create the booking record first so the date reservation is linked to the event.' }, { status: 409 })
      }
      if (balanceDue <= 0) return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 })
      if (!booking.event_date) return NextResponse.json({ error: 'Add the event date before sending the booking package.' }, { status: 409 })
      if (Math.abs(Number(booking.contract_total || 0) - Number(invoice.total || 0)) >= 0.005) {
        return NextResponse.json({ error: 'The booking total and event invoice total must match before the booking package is sent.' }, { status: 409 })
      }
      if (String(booking.email || '').trim().toLowerCase() !== inquiry.email.trim().toLowerCase()) {
        return NextResponse.json({ error: 'The lead email and booking email do not match. Update them before sending.' }, { status: 409 })
      }

      const depositAmount = Number(booking.deposit_required || 0)
      const finalPaymentDueDate = booking.final_payment_due_date
      if (!finalPaymentDueDate) {
        return NextResponse.json({ error: 'Configure the final payment due date in the approved payment plan before sending a booking package.' }, { status: 409 })
      }
      const paymentLabel = 'Non-refundable reservation deposit'
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')

      booking = await updateLuxorBooking(booking.id, {
        deposit_required: depositAmount,
        final_payment_due_date: finalPaymentDueDate,
        status: booking.status === 'draft' ? 'tentative' : booking.status,
        metadata: {
          ...booking.metadata,
          deposit_type: 'negotiated_reservation_deposit',
          proposalLineItems: invoice.line_items,
          proposalTaxRate: invoice.tax_rate,
          proposalInvoiceId: invoice.id,
          proposalOffer: luxorOfferSnapshot(invoice),
        },
      }) || booking

      const now = new Date().toISOString()
      const currentFingerprint = getLuxorBookingContractFingerprint(booking)
      const activeSignature = await getActiveLuxorSignatureRequestByBooking(booking.id)
      let signature: LuxorSignatureRequest | null = activeSignature
      if (activeSignature && activeSignature.metadata?.bookingFingerprint !== currentFingerprint) {
        await updateLuxorSignatureRequest(activeSignature.id, {
          status: 'void',
          metadata: { ...activeSignature.metadata, replacedAt: now, replacedBy: session.email, replacementReason: 'booking_fields_changed' },
        })
        await recordLuxorSignatureEvent({ signatureRequestId: activeSignature.id, eventType: 'voided', metadata: { replacementReason: 'booking_fields_changed', replacedBy: session.email } })
        signature = null
      }
      signature ||= await createLuxorSignatureRequest(booking)
      const signingUrl = `${origin}/secure-portal/sign/${signature.token}`
      const depositInvoice = await ensureLuxorDepositInvoice({ masterInvoice: invoice, bookingId: booking.id, reservationDepositAmount: depositAmount })

      const checkout = await createLuxorPostContractCheckout({
        invoice: depositInvoice,
        inquiry,
        booking,
        origin,
        paymentAmount: depositAmount,
        paymentLabel,
        masterInvoiceId: invoice.id,
      })

      if (!checkout) return NextResponse.json({ error: 'No deposit payment due.' }, { status: 400 })

      const publicToken = depositInvoice.public_token || crypto.randomUUID()
      const depositReviewUrl = `${origin}/proposal/${publicToken}`
      const updatedDepositInvoice = await updateInvoice(depositInvoice.id, {
        public_token: publicToken,
        status: 'sent',
        proposal_sent_at: now,
        payment_requested_at: now,
        payment_requested_amount: depositAmount,
        payment_requested_label: paymentLabel,
        stripe_checkout_session_id: checkout.checkoutId,
        stripe_checkout_url: checkout.checkoutUrl,
      }) || depositInvoice

      const [depositPdf, contractPdf, guide] = await Promise.all([
        buildLuxorInvoicePdf(updatedDepositInvoice, inquiry),
        downloadLuxorPrivatePdf(signature.contract_document_path || ''),
        downloadLuxorPrivatePdf(signature.guest_guide_path || ''),
      ])
      await saveLuxorInvoicePdf({ invoice: updatedDepositInvoice, inquiryId: inquiry.id, pdf: depositPdf, createdBy: session.email })

      const notes = await listNotesByInquiry(inquiry.id).catch(() => [])
      const email = await buildLuxorDateLockDepositEmail({
        invoice: updatedDepositInvoice,
        inquiry,
        booking,
        reviewUrl: depositReviewUrl,
        signingUrl,
        depositAmount,
        finalPaymentDueDate,
        securityDepositAmount: booking.security_deposit_amount,
        notes,
      })

      const job = await createLuxorEmailJob({
        inquiryId: inquiry.id,
        bookingId: booking.id,
        signatureRequestId: signature.id,
        jobType: 'booking_package',
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: `Your booking package is ready. Pay the negotiated reservation deposit: ${checkout.checkoutUrl} Sign the agreement: ${signingUrl}`,
        scheduledFor: now,
        metadata: { manual: true, requestedBy: session.email, deposit_invoice_id: updatedDepositInvoice.id, master_invoice_id: invoice.id, includes_deposit_invoice: true, includes_contract: true, includes_guest_guide: true },
      })
      try {
        await sendLuxorZohoEmail({
          to: inquiry.email,
          subject: email.subject,
          content: email.html,
          from: 'booking@luxoratlaspalmas.com',
          fromName: 'Luxor Event Space',
          attachments: [
            { filename: `Luxor-30-Percent-Deposit-Invoice-${updatedDepositInvoice.id.slice(0, 8)}.pdf`, content: depositPdf, contentType: 'application/pdf' },
            { filename: 'Luxor-Event-Agreement.pdf', content: contractPdf, contentType: 'application/pdf' },
            { filename: 'Luxor-Guest-Guide.pdf', content: guide, contentType: 'application/pdf' },
          ],
        })
        await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: now })
      } catch (sendError) {
        await updateLuxorEmailJob(job.id, { status: 'failed', last_error: sendError instanceof Error ? sendError.message : 'Email send failed.' })
        throw sendError
      }

      const updated = await updateInvoice(invoice.id, { status: 'sent', proposal_sent_at: now })
      booking = await updateLuxorBooking(booking.id, {
        metadata: {
          ...booking.metadata,
          booking_package_sent_at: now,
          deposit_invoice_id: updatedDepositInvoice.id,
          latest_signature_request_id: signature.id,
          reservation_state: 'awaiting_deposit_and_signature',
        },
      }) || booking

      const updatedInquiry = await updateLuxorInquiry(inquiry.id, {
        status: 'booked',
        pipeline_stage: 'contract',
        metadata: {
          ...inquiry.metadata,
          booking_package_sent_at: now,
          latest_proposal_invoice_id: invoice.id,
          latest_deposit_invoice_id: updatedDepositInvoice.id,
          latest_signature_request_id: signature.id,
        },
      }) ?? inquiry

      await createNote(inquiry.id, `Booking package sent to ${inquiry.email}: negotiated reservation-deposit invoice, Stripe payment link, agreement, and Guest Guide. The date remains pending until both payment and signature are complete.`, 'status_change', session.email)
      await cancelQueuedLuxorEmailJobs(inquiry.id, ['proposal_view_reminder', 'proposal_payment_reminder', 'contract_view_reminder', 'contract_signature_reminder'])
      const viewReminder = buildContractReminderEmail({ signature, kind: 'view' })
      const signatureReminder = buildContractReminderEmail({ signature, kind: 'sign' })
      const paymentReminder = buildPaymentReminderEmail({ inquiry, reviewUrl: depositReviewUrl, paymentAmount: depositAmount, paymentLabel })
      const reminderBooking = booking!
      const reminderRecipient = inquiry.email!
      const offerReminderJobs = await Promise.all(offerReminderTimes(updatedDepositInvoice.offer_expires_at).map(async (scheduledFor, index) => {
        const reminder = await buildAiOfferReminderEmail({ inquiry, invoice: updatedDepositInvoice, booking: reminderBooking, reviewUrl: depositReviewUrl, reminderNumber: index + 1, notes })
        return createUniqueLuxorEmailJob({
          inquiryId: inquiry.id,
          bookingId: reminderBooking.id,
          signatureRequestId: signature.id,
          jobType: 'proposal_payment_reminder',
          recipientEmail: reminderRecipient,
          subject: reminder.subject,
          body: reminder.body,
          scheduledFor,
          automationKey: `proposal_offer:${updatedDepositInvoice.id}:${index + 1}`,
          metadata: { invoice_id: updatedDepositInvoice.id, offer_reminder: true, offer_expires_at: updatedDepositInvoice.offer_expires_at, ai_generated: reminder.aiGenerated },
        })
      }))
      await Promise.all([
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_view_reminder', recipientEmail: inquiry.email, subject: viewReminder.subject, body: viewReminder.body, scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_view_reminder', signature.id), metadata: { invoice_id: updatedDepositInvoice.id, offer_expires_at: updatedDepositInvoice.offer_expires_at } }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_signature_reminder', recipientEmail: inquiry.email, subject: signatureReminder.subject, body: signatureReminder.body, scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_signature_reminder', signature.id), metadata: { invoice_id: updatedDepositInvoice.id, offer_expires_at: updatedDepositInvoice.offer_expires_at } }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, jobType: 'proposal_payment_reminder', recipientEmail: inquiry.email, subject: paymentReminder.subject, body: paymentReminder.body, scheduledFor: new Date(Date.now() + 72 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('proposal_payment_reminder', checkout.checkoutId), metadata: { invoice_id: updatedDepositInvoice.id, checkout_session_id: checkout.checkoutId, flow_stage: 'booking_package_deposit', offer_expires_at: updatedDepositInvoice.offer_expires_at } }),
        ...offerReminderJobs,
      ])

      return NextResponse.json({ invoice: updated, depositInvoice: updatedDepositInvoice, inquiry: updatedInquiry, booking, signature, signingUrl, checkoutUrl: checkout.checkoutUrl, paymentAmount: depositAmount, mode: 'date_lock_deposit' })
    }

    if (body.mode === 'proposal') {
      if (invoice.invoice_kind !== 'event') return NextResponse.json({ error: 'Only a final event proposal can be published from this action.' }, { status: 409 })
      const proposalContext = invoice.proposal_context && typeof invoice.proposal_context === 'object' ? invoice.proposal_context : null
      const calculationErrors = Array.isArray(proposalContext?.calculation_errors) ? proposalContext.calculation_errors.filter(Boolean) : []
      const publicationErrors = Array.isArray(proposalContext?.publication_errors) ? proposalContext.publication_errors.filter((error): error is string => typeof error === 'string' && Boolean(error.trim())) : []
      const plan = proposalContext?.payment_plan
      const hasCompletePaymentPlan = Boolean(
        plan &&
        (plan.mode === 'deposit_and_balance' || plan.mode === 'pay_in_full') &&
        Number.isFinite(Number(plan.booking_payment_percent)) &&
        Number(plan.booking_payment_percent) >= 0 &&
        Number(plan.booking_payment_percent) <= 100 &&
        Number.isInteger(Number(plan.final_payment_due_days_before_event)) &&
        Number(plan.final_payment_due_days_before_event) >= 0 &&
        (plan.mode !== 'deposit_and_balance' || Number(plan.booking_payment_percent) > 0),
      )
      // Drafts made before publication errors were stored separately used the
      // generic configuration message for this one missing decision. Keep
      // their publish action useful too instead of treating package rates as
      // unknown.
      const onlyLegacyPaymentPlanError = !hasCompletePaymentPlan && calculationErrors.length === 1 && calculationErrors[0] === 'Pricing configuration required — administrator review.'
      if (!proposalContext) {
        return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
      }
      if (publicationErrors.length) {
        return NextResponse.json({ error: publicationErrors[0] }, { status: 409 })
      }
      if (onlyLegacyPaymentPlanError) {
        return NextResponse.json({ error: PAYMENT_PLAN_REQUIRED }, { status: 409 })
      }
      if (calculationErrors.length) {
        return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
      }
      if (Math.abs(Number(proposalContext.final_event_price || 0) - Number(invoice.total || 0)) >= 0.005) {
        return NextResponse.json({ error: 'The final proposal total no longer matches its immutable pricing snapshot. Create a revised proposal.' }, { status: 409 })
      }
      if (booking && Math.abs(Number(booking.contract_total || 0) - Number(invoice.total || 0)) >= 0.005) return NextResponse.json({ error: 'The linked booking total does not match the final proposal. Create a revised proposal instead of changing a sent price.' }, { status: 409 })
      if (invoice.supersedes_invoice_id) {
        const prior = await getInvoice(invoice.supersedes_invoice_id)
        if (prior?.proposal_accepted_at || prior?.booking_id) {
          return NextResponse.json({ error: 'A proposal that has been accepted cannot be replaced. Contact Luxor to prepare an amendment.' }, { status: 409 })
        }
      }
      const now = new Date().toISOString()
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
      const publicToken = invoice.public_token || crypto.randomUUID()
      // An older workflow could have attached a Checkout Session directly to
      // the event invoice. A final proposal must never leave an old payment
      // link usable, because payment is now issued only after signature.
      if (invoice.stripe_checkout_session_id) {
        await expireLuxorCheckoutForRepricing(invoice)
        await updateInvoice(invoice.id, {
          stripe_checkout_opened_at: null,
          payment_requested_at: null,
          payment_requested_amount: null,
          payment_requested_label: null,
        })
      }
      if (invoice.supersedes_invoice_id) {
        const prior = await getInvoice(invoice.supersedes_invoice_id)
        if (prior?.proposal_accepted_at || prior?.booking_id) {
          return NextResponse.json({ error: 'A proposal that has been accepted cannot be replaced. Contact Luxor to prepare an amendment.' }, { status: 409 })
        }
        if (prior && prior.status !== 'cancelled') {
          await expireLuxorCheckoutForRepricing(prior)
        }
      }
      const frozenInvoice = invoice.price_locked_at
        ? invoice
        : await updateInvoice(invoice.id, { price_locked_at: now, proposal_version: Math.max(1, Number(invoice.proposal_version || 1)) }) || invoice
      const persistedPublicToken = frozenInvoice.public_token || publicToken
      const persistedReviewUrl = `${origin}/proposal/${persistedPublicToken}`
      const existingPdf = await getLuxorDocumentByInvoice(frozenInvoice.id, 'proposal')
      const frozenDeliverySnapshot = frozenInvoice.proposal_context?.delivery_snapshot
      const frozenProposalEmail = frozenDeliverySnapshot && typeof frozenDeliverySnapshot === 'object' && !Array.isArray(frozenDeliverySnapshot)
        ? (frozenDeliverySnapshot as Record<string, unknown>).proposal_email
        : null
      const frozenDeliveryConfirmed = frozenProposalEmail && typeof frozenProposalEmail === 'object' && !Array.isArray(frozenProposalEmail)
        && (frozenProposalEmail as Record<string, unknown>).delivery_state === 'delivered'
      if (frozenDeliveryConfirmed && !existingPdf) {
        return NextResponse.json({ error: 'The frozen proposal PDF is unavailable. Create a revised proposal; do not regenerate this published version.' }, { status: 409 })
      }
      const pdf = existingPdf
        ? await downloadLuxorDocument(existingPdf)
        : await buildLuxorInvoicePdf(frozenInvoice, inquiry)
      if (!existingPdf) await saveLuxorProposalPdf({ invoice: frozenInvoice, inquiryId: invoice.inquiry_id, pdf, createdBy: session.email })
      const attachmentFileName = `Luxor-Final-Proposal-${frozenInvoice.id.slice(0, 8)}.pdf`
      const priorDeliverySnapshot = frozenInvoice.proposal_context?.delivery_snapshot
      const priorProposalEmail = priorDeliverySnapshot && typeof priorDeliverySnapshot === 'object' && !Array.isArray(priorDeliverySnapshot)
        ? (priorDeliverySnapshot as Record<string, unknown>).proposal_email
        : null
      const storedProposalEmail = priorProposalEmail && typeof priorProposalEmail === 'object' && !Array.isArray(priorProposalEmail)
        ? priorProposalEmail as Record<string, unknown>
        : null
      const snapshotSubject = typeof storedProposalEmail?.subject === 'string' ? storedProposalEmail.subject : null
      const snapshotHtml = typeof storedProposalEmail?.html === 'string' ? storedProposalEmail.html : null
      const snapshotRecipient = typeof storedProposalEmail?.recipient_email === 'string' ? storedProposalEmail.recipient_email : null
      const snapshotRecipientName = typeof storedProposalEmail?.recipient_name === 'string' ? storedProposalEmail.recipient_name : null
      const snapshotReviewUrl = typeof storedProposalEmail?.review_url === 'string' ? storedProposalEmail.review_url : null
      const snapshotDeliveryState = typeof storedProposalEmail?.delivery_state === 'string' ? storedProposalEmail.delivery_state : null
      const snapshotDeliverySentAt = typeof storedProposalEmail?.delivery_sent_at === 'string' ? storedProposalEmail.delivery_sent_at : null
      // Once Zoho has confirmed delivery, this snapshot is an audit artifact.
      // Before that point a corrected client name/email should replace the
      // prepared payload on retry rather than sending to stale contact data.
      const hasConfirmedDelivery = snapshotDeliveryState === 'delivered' && Boolean(snapshotDeliverySentAt)
      const hasStoredDeliverySnapshot = hasConfirmedDelivery && Boolean(snapshotSubject && snapshotHtml && snapshotRecipient && snapshotReviewUrl)
      const generatedEmail = hasStoredDeliverySnapshot
        ? null
        : buildLuxorProposalEmail({ invoice: frozenInvoice, inquiry, reviewUrl: persistedReviewUrl })
      const email = {
        subject: hasStoredDeliverySnapshot ? snapshotSubject! : generatedEmail!.subject,
        html: hasStoredDeliverySnapshot ? snapshotHtml! : generatedEmail!.html,
        recipient: hasStoredDeliverySnapshot ? snapshotRecipient! : inquiry.email,
        recipientName: hasStoredDeliverySnapshot ? (snapshotRecipientName || inquiry.full_name) : inquiry.full_name,
        reviewUrl: hasStoredDeliverySnapshot ? snapshotReviewUrl! : persistedReviewUrl,
      }
      const deliverySnapshot = {
        ...(priorDeliverySnapshot && typeof priorDeliverySnapshot === 'object' && !Array.isArray(priorDeliverySnapshot)
          ? priorDeliverySnapshot as Record<string, unknown>
          : {}),
        proposal_email: {
          recipient_email: email.recipient,
          recipient_name: email.recipientName,
          subject: email.subject,
          html: email.html,
          attachment_filename: hasConfirmedDelivery && typeof storedProposalEmail?.attachment_filename === 'string'
            ? storedProposalEmail.attachment_filename
            : attachmentFileName,
          review_url: email.reviewUrl,
          rendered_at: hasConfirmedDelivery && typeof storedProposalEmail?.rendered_at === 'string'
            ? storedProposalEmail.rendered_at
            : now,
          delivery_state: hasConfirmedDelivery ? 'delivered' : 'prepared',
          delivery_sent_at: hasConfirmedDelivery ? snapshotDeliverySentAt : null,
        },
      }
      // The private link and exact email payload must be durable before Zoho
      // receives anything. A mail failure then retries the same immutable
      // proposal version instead of sending a link the client cannot open.
      const preparedInvoice = await updateInvoice(frozenInvoice.id, {
        public_token: persistedPublicToken,
        price_locked_at: frozenInvoice.price_locked_at || now,
        proposal_version: Math.max(1, Number(frozenInvoice.proposal_version || 1)),
        // Once the durable private URL and frozen PDF exist, the proposal is
        // safe for its recipient to open even if the process dies after Zoho
        // accepts the message. `proposal_sent_at` remains the actual delivery
        // receipt and is intentionally written only after Zoho succeeds.
        status: 'sent',
        proposal_context: {
          ...(frozenInvoice.proposal_context || {}),
          version: Number(frozenInvoice.proposal_context?.version || 1),
          delivery_snapshot: deliverySnapshot,
        },
      })
      if (!preparedInvoice || preparedInvoice.public_token !== persistedPublicToken) {
        throw new Error('The final proposal could not be prepared with its private delivery link. Nothing was emailed; please try again.')
      }
      const job = await createLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking?.id || null, jobType: 'booking_package', recipientEmail: email.recipient, subject: email.subject, body: `Your Luxor final proposal is ready: ${email.reviewUrl}`, scheduledFor: now, metadata: { manual: true, requestedBy: session.email, flow_stage: 'final_proposal', proposal_version: preparedInvoice.proposal_version || 1, price_locked_at: preparedInvoice.price_locked_at, review_url: email.reviewUrl, attachment_filename: deliverySnapshot.proposal_email.attachment_filename, rendered_at: deliverySnapshot.proposal_email.rendered_at } })
      const deliveredSnapshot = {
        ...deliverySnapshot,
        proposal_email: {
          ...deliverySnapshot.proposal_email,
          delivery_state: 'delivered',
          delivery_sent_at: now,
        },
      }
      let updated = preparedInvoice
      try {
        await sendLuxorZohoEmail({ to: email.recipient, subject: email.subject, content: email.html, from: 'booking@luxoratlaspalmas.com', fromName: 'Luxor Event Space', attachments: [{ filename: deliverySnapshot.proposal_email.attachment_filename, content: pdf, contentType: 'application/pdf' }] })
        // Persist the actual delivery receipt before the non-critical job
        // bookkeeping. If that later write fails, the owner sees the proposal
        // as delivered instead of being encouraged to send a duplicate.
        updated = await updateInvoice(preparedInvoice.id, {
          status: 'sent',
          proposal_sent_at: now,
          proposal_context: {
            ...(preparedInvoice.proposal_context || {}),
            version: Number(preparedInvoice.proposal_context?.version || 1),
            delivery_snapshot: deliveredSnapshot,
          },
        })
        if (!updated) throw new Error('The final proposal email was accepted, but its delivery receipt could not be saved. Refresh before retrying.')
      } catch (error) {
        await updateLuxorEmailJob(job.id, { status: 'failed', last_error: error instanceof Error ? error.message : 'Email send failed.' })
        throw error
      }
      // The invoice receipt is the client-facing source of truth. A mail-job
      // ledger hiccup must not turn a confirmed delivery into a retry prompt.
      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: now }).catch((error) => {
        console.error('Final proposal was delivered, but the email-job receipt could not be updated:', error)
      })
      if (booking) {
        booking = await updateLuxorBooking(booking.id, { metadata: { ...booking.metadata, proposal_sent_at: now, reservation_state: 'awaiting_proposal_selection', proposalLineItems: frozenInvoice.line_items, proposalInvoiceId: frozenInvoice.id } }) || booking
      }
      if (updated?.supersedes_invoice_id) {
        const prior = await getInvoice(updated.supersedes_invoice_id)
        if (prior && prior.status !== 'cancelled') {
          await updateInvoice(prior.id, { status: 'cancelled', offer_status: 'withdrawn', stripe_checkout_session_id: null, stripe_checkout_url: null, stripe_checkout_opened_at: null, payment_requested_at: null, payment_requested_amount: null, payment_requested_label: null })
        }
      }
      const updatedInquiry = await updateLuxorInquiry(inquiry.id, { status: 'proposal_sent', pipeline_stage: 'proposal', metadata: { ...inquiry.metadata, proposal_sent_at: now, latest_proposal_invoice_id: invoice.id } }) || inquiry
      await createNote(inquiry.id, 'Final proposal sent. The price is locked; the client must select it before the Event Agreement is issued.', 'status_change', session.email)
      return NextResponse.json({ invoice: updated, inquiry: updatedInquiry, reviewUrl: email.reviewUrl, mode: 'proposal' })
    }

    if ((body.mode as string) === 'proposal_contract') {
      if (!booking) {
        return NextResponse.json({ error: 'Create the booking record first so the agreement uses the confirmed event fields, pricing, and notes.' }, { status: 409 })
      }
      if (booking.contract_status === 'signed') {
        return NextResponse.json({ error: 'The agreement is already signed. Send the Stripe payment request from the Deposit stage.' }, { status: 409 })
      }
      if (Math.abs(Number(booking.contract_total || 0) - Number(invoice.total || 0)) >= 0.005) {
        return NextResponse.json({ error: 'The booking contract total does not match the proposal total. Update the booking amount before sending so the proposal and agreement cannot disagree.' }, { status: 409 })
      }
      if (String(booking.email || '').trim().toLowerCase() !== inquiry.email.trim().toLowerCase()) {
        return NextResponse.json({ error: 'The lead email and booking email do not match. Update them before sending so the agreement goes to the correct signer.' }, { status: 409 })
      }

      booking = await updateLuxorBooking(booking.id, {
        metadata: {
          ...booking.metadata,
          proposalLineItems: invoice.line_items,
          proposalTaxRate: invoice.tax_rate,
          proposalInvoiceId: invoice.id,
          proposalOffer: luxorOfferSnapshot(invoice),
        },
      }) || booking

      if (invoice.stripe_checkout_session_id) {
        const secretKey = process.env.STRIPE_SECRET_KEY
        if (!secretKey) {
          return NextResponse.json({ error: 'Stripe must be connected so the old pre-contract payment link can be disabled before this package is sent.' }, { status: 503 })
        }
        const stripe = new Stripe(secretKey)
        const oldCheckout = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
        if (oldCheckout.status === 'open') await stripe.checkout.sessions.expire(oldCheckout.id)
        await updateInvoice(invoice.id, {
          stripe_checkout_session_id: null,
          stripe_checkout_url: null,
          stripe_checkout_opened_at: null,
          payment_requested_at: null,
          payment_requested_amount: null,
          payment_requested_label: null,
        })
      }

      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
      const now = new Date().toISOString()
      const publicToken = invoice.public_token || crypto.randomUUID()
      const activeSignature = await getActiveLuxorSignatureRequestByBooking(booking.id)
      let signature = activeSignature
      const currentFingerprint = getLuxorBookingContractFingerprint(booking)
      if (activeSignature && activeSignature.metadata?.bookingFingerprint !== currentFingerprint) {
        await updateLuxorSignatureRequest(activeSignature.id, {
          status: 'void',
          metadata: { ...activeSignature.metadata, replacedAt: now, replacedBy: session.email, replacementReason: 'booking_fields_changed' },
        })
        await recordLuxorSignatureEvent({ signatureRequestId: activeSignature.id, eventType: 'voided', metadata: { replacementReason: 'booking_fields_changed', replacedBy: session.email } })
        signature = await createLuxorSignatureRequest(booking)
      }
      signature ||= await createLuxorSignatureRequest(booking)
      const signingUrl = `${origin}/secure-portal/sign/${signature.token}`
      const [pdf, notes, guide] = await Promise.all([
        buildLuxorInvoicePdf(invoice, inquiry),
        listNotesByInquiry(inquiry.id).catch(() => []),
        downloadLuxorPrivatePdf(signature.guest_guide_path || ''),
      ])
      await saveLuxorProposalPdf({ invoice, inquiryId: invoice.inquiry_id, pdf, createdBy: session.email })
      const email = await buildLuxorProposalContractEmail({ invoice, inquiry, booking, signingUrl, notes })
      const job = await createLuxorEmailJob({
        inquiryId: inquiry.id,
        bookingId: booking.id,
        signatureRequestId: signature.id,
        jobType: 'contract_signature',
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: `Your Luxor proposal and agreement are ready to review and sign: ${signingUrl}`,
        scheduledFor: now,
        metadata: { manual: true, requestedBy: session.email, includes_proposal: true, includes_guest_guide: true, flow_stage: 'proposal_contract' },
      })
      try {
        await sendLuxorZohoEmail({
          to: inquiry.email,
          subject: email.subject,
          content: email.html,
          from: 'booking@luxoratlaspalmas.com',
          fromName: 'Luxor Event Space',
          attachments: [
            { filename: `Luxor-Proposal-${invoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' },
            { filename: 'Luxor-Guest-Guide.pdf', content: guide, contentType: 'application/pdf' },
          ],
        })
        await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: now })
      } catch (sendError) {
        await updateLuxorEmailJob(job.id, { status: 'failed', last_error: sendError instanceof Error ? sendError.message : 'Email send failed.' })
        throw sendError
      }

      booking = await updateLuxorBooking(booking.id, {
        metadata: {
          ...booking.metadata,
          booking_package_sent_at: now,
          latest_signature_request_id: signature.id,
          reservation_state: 'awaiting_signature',
        },
      }) || booking

      const updated = await updateInvoice(invoice.id, {
        public_token: publicToken,
        status: 'sent',
        proposal_sent_at: now,
        stripe_checkout_session_id: null,
        stripe_checkout_url: null,
        stripe_checkout_opened_at: null,
        payment_requested_at: null,
        payment_requested_amount: null,
        payment_requested_label: null,
      })
      const updatedInquiry = await updateLuxorInquiry(inquiry.id, {
        status: 'booked',
        pipeline_stage: 'contract',
        metadata: { ...inquiry.metadata, proposal_sent_at: now, latest_proposal_invoice_id: invoice.id, latest_signature_request_id: signature.id },
      }) ?? inquiry
      await createNote(inquiry.id, 'Proposal and agreement sent together. Payment will be requested automatically after signature.', 'status_change', session.email)
      await cancelQueuedLuxorEmailJobs(inquiry.id, ['proposal_view_reminder', 'proposal_payment_reminder', 'contract_view_reminder', 'contract_signature_reminder'])
      const viewReminder = buildContractReminderEmail({ signature, kind: 'view' })
      const signatureReminder = buildContractReminderEmail({ signature, kind: 'sign' })
      const reminderBooking = booking!
      const reminderRecipient = inquiry.email!
      const offerReminderJobs = await Promise.all(offerReminderTimes(invoice.offer_expires_at).map(async (scheduledFor, index) => {
        const reminder = await buildAiOfferReminderEmail({ inquiry, invoice, booking: reminderBooking, reviewUrl: `${origin}/proposal/${publicToken}`, reminderNumber: index + 1, notes })
        return createUniqueLuxorEmailJob({
          inquiryId: inquiry.id,
          bookingId: reminderBooking.id,
          signatureRequestId: signature.id,
          jobType: 'proposal_view_reminder',
          recipientEmail: reminderRecipient,
          subject: reminder.subject,
          body: reminder.body,
          scheduledFor,
          automationKey: `proposal_offer:${invoice.id}:${index + 1}`,
          metadata: { invoice_id: invoice.id, offer_reminder: true, offer_expires_at: invoice.offer_expires_at, ai_generated: reminder.aiGenerated },
        })
      }))
      await Promise.all([
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_view_reminder', recipientEmail: inquiry.email, subject: viewReminder.subject, body: viewReminder.body, scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_view_reminder', signature.id), metadata: { invoice_id: invoice.id, offer_expires_at: invoice.offer_expires_at } }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_signature_reminder', recipientEmail: inquiry.email, subject: signatureReminder.subject, body: signatureReminder.body, scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_signature_reminder', signature.id), metadata: { invoice_id: invoice.id, offer_expires_at: invoice.offer_expires_at } }),
        ...offerReminderJobs,
      ])
      return NextResponse.json({ invoice: updated, inquiry: updatedInquiry, signature, signingUrl, mode: 'proposal_contract' })
    }

    if (body.mode !== 'payment') {
      return NextResponse.json({ error: 'Choose a supported final-proposal or post-signature payment action.' }, { status: 400 })
    }
    if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance') {
      return NextResponse.json({ error: 'Create the scheduled booking-payment invoice from the signed agreement before sending a Stripe link.' }, { status: 409 })
    }
    if (!booking || booking.contract_status !== 'signed') {
      return NextResponse.json({ error: 'The client must sign the agreement before a Stripe payment link can be created or sent.' }, { status: 409 })
    }
    if (balanceDue <= 0) return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 })
    const requestedAmount = Number(body.paymentAmount)
    const explicitPaymentAmount = Number.isFinite(requestedAmount) ? Math.round(requestedAmount * 100) / 100 : undefined
    const explicitPaymentLabel = body.paymentLabel ? String(body.paymentLabel).trim().slice(0, 80) : undefined
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    const checkout = await createLuxorPostContractCheckout({ invoice, inquiry, booking, origin, paymentAmount: explicitPaymentAmount, paymentLabel: explicitPaymentLabel })
    if (!checkout) return NextResponse.json({ error: 'No payment remains on this invoice.' }, { status: 400 })
    const { paymentAmount, paymentLabel } = checkout

    const pdf = await buildLuxorInvoicePdf(invoice, inquiry)
    await saveLuxorProposalPdf({ invoice, inquiryId: invoice.inquiry_id, pdf, createdBy: session.email })
    const now = new Date().toISOString()
    const publicToken = invoice.public_token || crypto.randomUUID()
    const paymentUrl = checkout.checkoutUrl
    await updateInvoice(invoice.id, {
      public_token: publicToken,
      payment_requested_at: now,
      payment_requested_amount: paymentAmount,
      payment_requested_label: paymentLabel,
      stripe_checkout_session_id: checkout.checkoutId,
      stripe_checkout_url: checkout.checkoutUrl,
    })
    const notes = await listNotesByInquiry(inquiry.id).catch(() => [])
    const email = await buildLuxorPaymentRequestEmail({ invoice, inquiry, booking, notes, paymentUrl, paymentAmount, paymentLabel, paidTotal, balanceDue })
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
          reviewUrl: paymentUrl,
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
          automationKey: lifecycleAutomationKey('final_payment_reminder', checkout.checkoutId),
          metadata: { invoice_id: invoice.id, checkout_session_id: checkout.checkoutId, reminder_sequence: 1 },
        })
      } else {
        const paymentReminder = buildPaymentReminderEmail({ inquiry, reviewUrl: paymentUrl, paymentAmount, paymentLabel })
        await createUniqueLuxorEmailJob({
          inquiryId: inquiry.id,
          bookingId: booking.id,
          jobType: 'proposal_payment_reminder',
          recipientEmail: inquiry.email,
          subject: paymentReminder.subject,
          body: paymentReminder.body,
          scheduledFor: new Date(Date.now() + 72 * 60 * 60_000).toISOString(),
          automationKey: lifecycleAutomationKey('proposal_payment_reminder', checkout.checkoutId),
          metadata: { invoice_id: invoice.id, checkout_session_id: checkout.checkoutId, reminder_sequence: 1, flow_stage: 'post_signature_payment' },
        })
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
          automationKey: `invoice_payment_request:${invoice.id}:${checkout.checkoutId}`,
          body: `Luxor Event Space: Hi ${inquiry.full_name.split(/\s+/)[0] || 'there'}, this is a reminder that your ${paymentAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment request is still open. Pay securely here: ${paymentUrl} Reply STOP to opt out.`,
          requiredScope: 'invoice',
          metadata: { checkout_session_id: checkout.checkoutId, due_date: invoice.due_date },
        })
      } catch (automationError) {
        console.error('[invoice-payment-request] text reminder queue failed after the proposal was delivered', automationError)
      }
    }
    return NextResponse.json({ invoice: updated, inquiry: updatedInquiry, checkoutUrl: checkout.checkoutUrl, paymentAmount, balanceDue, reusedCheckout: checkout.reused })
  } catch (error) {
    console.error('[invoice-payment-request] failed', {
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send proposal.' }, { status: 500 })
  }
}
