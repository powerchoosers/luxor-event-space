import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { calculateLuxorThirtyPercentDeposit, ensureLuxorDepositInvoice, getInvoice, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { buildLuxorDateLockDepositEmail, buildLuxorPaymentRequestEmail, buildLuxorProposalContractEmail } from '@/lib/luxorProposalEmailServer'
import { downloadLuxorPrivatePdf, saveLuxorInvoicePdf, saveLuxorProposalPdf } from '@/lib/luxorDocumentsServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import { cancelQueuedLuxorEmailJobs, createLuxorEmailJob, createUniqueLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildContractReminderEmail, buildFinalPaymentReminderEmail, buildPaymentReminderEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { createUniqueTextJob, queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'
import { createLuxorSignatureRequest, getActiveLuxorSignatureRequestByBooking, getLuxorBookingContractFingerprint, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'

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
    const body = await request.json().catch(() => ({})) as { mode?: 'proposal_contract' | 'payment' | 'date_lock_deposit'; paymentAmount?: number; paymentLabel?: string }
    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    let booking = invoice.booking_id
      ? await getLuxorBooking(invoice.booking_id)
      : bookings.find((item) => item.invoice_id === invoice.id) || null

    if (body.mode === 'date_lock_deposit') {
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

      const { depositAmount } = calculateLuxorThirtyPercentDeposit(invoice)
      const finalPaymentDueDate = luxorFinalPaymentDueDate(booking.event_date)
      const paymentLabel = '30% non-refundable booking deposit'
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')

      booking = await updateLuxorBooking(booking.id, {
        deposit_required: depositAmount,
        final_payment_due_date: finalPaymentDueDate,
        status: booking.status === 'draft' ? 'tentative' : booking.status,
        metadata: {
          ...booking.metadata,
          deposit_type: 'non_refundable_booking',
          deposit_rate: 0.3,
          proposalLineItems: invoice.line_items,
          proposalTaxRate: invoice.tax_rate,
          proposalInvoiceId: invoice.id,
        },
      }) || booking

      const now = new Date().toISOString()
      const currentFingerprint = getLuxorBookingContractFingerprint(booking)
      const activeSignature = await getActiveLuxorSignatureRequestByBooking(booking.id)
      let signature = activeSignature
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
      const depositInvoice = await ensureLuxorDepositInvoice({ masterInvoice: invoice, bookingId: booking.id })

      const checkout = await createLuxorPostContractCheckout({
        invoice: depositInvoice,
        inquiry,
        booking,
        origin,
        paymentAmount: depositAmount,
        paymentLabel,
        allowPreContract: true,
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
        notes,
      })

      const job = await createLuxorEmailJob({
        inquiryId: inquiry.id,
        bookingId: booking.id,
        signatureRequestId: signature.id,
        jobType: 'booking_package',
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: `Your booking package is ready. Pay the 30% deposit: ${checkout.checkoutUrl} Sign the agreement: ${signingUrl}`,
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

      await createNote(inquiry.id, `Booking package sent to ${inquiry.email}: 30% non-refundable deposit invoice, Stripe payment link, agreement, and Guest Guide. The date remains pending until both payment and signature are complete.`, 'status_change', session.email)
      await cancelQueuedLuxorEmailJobs(inquiry.id, ['proposal_view_reminder', 'proposal_payment_reminder', 'contract_view_reminder', 'contract_signature_reminder'])
      const viewReminder = buildContractReminderEmail({ signature, kind: 'view' })
      const signatureReminder = buildContractReminderEmail({ signature, kind: 'sign' })
      const paymentReminder = buildPaymentReminderEmail({ inquiry, reviewUrl: depositReviewUrl, paymentAmount: depositAmount, paymentLabel })
      await Promise.all([
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_view_reminder', recipientEmail: inquiry.email, subject: viewReminder.subject, body: viewReminder.body, scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_view_reminder', signature.id) }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_signature_reminder', recipientEmail: inquiry.email, subject: signatureReminder.subject, body: signatureReminder.body, scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_signature_reminder', signature.id) }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, jobType: 'proposal_payment_reminder', recipientEmail: inquiry.email, subject: paymentReminder.subject, body: paymentReminder.body, scheduledFor: new Date(Date.now() + 72 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('proposal_payment_reminder', checkout.checkoutId), metadata: { invoice_id: updatedDepositInvoice.id, checkout_session_id: checkout.checkoutId, flow_stage: 'booking_package_deposit' } }),
      ])

      return NextResponse.json({ invoice: updated, depositInvoice: updatedDepositInvoice, inquiry: updatedInquiry, booking, signature, signingUrl, checkoutUrl: checkout.checkoutUrl, paymentAmount: depositAmount, mode: 'date_lock_deposit' })
    }

    if (body.mode === 'proposal_contract') {
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
      await Promise.all([
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_view_reminder', recipientEmail: inquiry.email, subject: viewReminder.subject, body: viewReminder.body, scheduledFor: new Date(Date.now() + 48 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_view_reminder', signature.id) }),
        createUniqueLuxorEmailJob({ inquiryId: inquiry.id, bookingId: booking.id, signatureRequestId: signature.id, jobType: 'contract_signature_reminder', recipientEmail: inquiry.email, subject: signatureReminder.subject, body: signatureReminder.body, scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), automationKey: lifecycleAutomationKey('contract_signature_reminder', signature.id) }),
      ])
      return NextResponse.json({ invoice: updated, inquiry: updatedInquiry, signature, signingUrl, mode: 'proposal_contract' })
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
    const reviewUrl = `${origin}/proposal/${publicToken}`
    await updateInvoice(invoice.id, {
      public_token: publicToken,
      payment_requested_at: now,
      payment_requested_amount: paymentAmount,
      payment_requested_label: paymentLabel,
      stripe_checkout_session_id: checkout.checkoutId,
      stripe_checkout_url: checkout.checkoutUrl,
    })
    const notes = await listNotesByInquiry(inquiry.id).catch(() => [])
    const email = await buildLuxorPaymentRequestEmail({ invoice, inquiry, booking, notes, reviewUrl, paymentAmount, paymentLabel, paidTotal, balanceDue })
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
          automationKey: lifecycleAutomationKey('final_payment_reminder', checkout.checkoutId),
          metadata: { invoice_id: invoice.id, checkout_session_id: checkout.checkoutId, reminder_sequence: 1 },
        })
      } else {
        const paymentReminder = buildPaymentReminderEmail({ inquiry, reviewUrl, paymentAmount, paymentLabel })
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
          body: `Luxor Event Space: Hi ${inquiry.full_name.split(/\s+/)[0] || 'there'}, this is a reminder that your ${paymentAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment request is still open. Review it securely here: ${reviewUrl} Reply STOP to opt out.`,
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
