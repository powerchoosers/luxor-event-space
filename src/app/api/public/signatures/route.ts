import { NextRequest, NextResponse } from 'next/server'
import { getLuxorSignatureRequestByToken, markLuxorSignatureViewed, recordLuxorSignatureEvent, signLuxorSignatureRequest, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { cancelQueuedLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { getLuxorBooking, markLuxorBookingContractViewed } from '@/lib/luxorBookingsServer'
import { getLuxorContractSignaturePlacement } from '@/lib/luxorSignaturePlacement'
import { createNote } from '@/lib/luxorNotesServer'
import { getInvoice, getInvoiceByBookingAndKind } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { getVerifiedLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPaymentSettings } from '@/lib/luxorPaymentSettingsServer'

function publicSignature(signature: Awaited<ReturnType<typeof getLuxorSignatureRequestByToken>>) {
  if (!signature) return null
  return {
    id: signature.id,
    client_name: signature.client_name,
    client_email: signature.client_email,
    client_first_name: signature.client_first_name,
    client_last_name: signature.client_last_name,
    owner_name: signature.owner_name,
    status: signature.status,
    contract_title: signature.contract_title,
    contract_body: signature.contract_body,
    signed_name: signature.signed_name,
    signed_at: signature.signed_at,
    owner_signed_at: signature.owner_signed_at,
    expires_at: signature.expires_at,
    signature_placement: getLuxorContractSignaturePlacement(signature.metadata),
  }
}

async function publicPayment(signature: NonNullable<Awaited<ReturnType<typeof getLuxorSignatureRequestByToken>>>) {
  if (signature.status !== 'signed') return {}
  const booking = await getLuxorBooking(signature.booking_id)
  const masterInvoice = booking?.invoice_id ? await getInvoice(booking.invoice_id) : null
  let invoice = booking ? await getInvoiceByBookingAndKind(booking.id, 'deposit') : null
  invoice ||= masterInvoice
  if (!booking || booking.contract_status !== 'signed' || !invoice) return {}
  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (booking.status === 'cancelled' || inquiry?.status === 'closed_lost') return {}
  const preference = booking.metadata?.client_payment_preference as { method?: unknown } | undefined
  const initialMethod = ['card', 'cash', 'zelle', 'check'].includes(String(preference?.method || '').toLowerCase())
    ? String(preference?.method).toLowerCase()
    : 'card'
  const zelleDetails = await getLuxorPaymentSettings()
    .then((settings) => settings.zelle_recipient || settings.zelle_qr_code_url
      ? { recipient: settings.zelle_recipient, qr_code_url: settings.zelle_qr_code_url }
      : null)
    .catch((error) => {
      console.error('Unable to load configured Zelle payment details:', error)
      return null
    })
  const paymentOptions = masterInvoice?.public_token
    ? {
        proposal_token: masterInvoice.public_token,
        deposit: Number(invoice.total || 0),
        full: Number(masterInvoice.total || invoice.total || 0),
        initial_method: initialMethod,
        ...(zelleDetails ? { zelle: zelleDetails } : {}),
      }
    : null
  // The signature flow creates Checkout only after it has verified the signed
  // agreement. The client may now choose Card, Cash, or Zelle; only Card
  // continues to Stripe, while the other methods remain owner-confirmed.
  if (!invoice.stripe_checkout_url) return paymentOptions ? { payment_options: paymentOptions } : {}
  return {
    payment_url: invoice.stripe_checkout_url,
    payment_amount: Number(invoice.payment_requested_amount || invoice.total || 0),
    payment_label: invoice.payment_requested_label || 'Initial Booking Payment - Luxor at Las Palmas Events',
    ...(paymentOptions ? { payment_options: paymentOptions } : {}),
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const signature = await getLuxorSignatureRequestByToken(token)

    if (!signature) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    }

    if (signature.status === 'void') {
      return NextResponse.json({ error: 'This signing link was cancelled. Please contact Luxor Event Space for a new agreement.' }, { status: 410 })
    }

    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now() && signature.status !== 'signed') {
      return NextResponse.json({ error: 'This signing link has expired. Please contact Luxor Event Space for a new agreement.' }, { status: 410 })
    }

    // Owner PDF previews do not count as a client engagement. This must be a
    // validated session, not merely a cookie name a visitor could provide.
    const isInternalOwner = Boolean(await getVerifiedLuxorPortalSession())
    let responseSignature = signature

    if (signature.status === 'sent' && !isInternalOwner) {
      try {
        // This conditional update is the event gate. A second browser tab or
        // an aggressive refresh cannot generate duplicate owner alerts.
        const firstView = await markLuxorSignatureViewed(signature.id)
        if (firstView) {
          responseSignature = firstView
          const results = await Promise.allSettled([
            markLuxorBookingContractViewed(signature.booking_id),
            ...(signature.inquiry_id
              ? [
                  createNote(signature.inquiry_id, `Event Agreement opened by ${signature.client_name} in the secure signing portal.`, 'status_change', 'Signature Portal'),
                  cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder']),
                ]
              : []),
            recordLuxorSignatureEvent({
              signatureRequestId: signature.id,
              eventType: 'viewed',
              ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
              userAgent: request.headers.get('user-agent'),
            }),
          ])
          results.filter((result) => result.status === 'rejected').forEach((result) => {
            console.error('Agreement view was recorded, but a follow-up activity action failed:', result.reason)
          })
        } else {
          // A concurrent view or signature may already have progressed this
          // agreement. Return the current state instead of a stale "sent" one.
          responseSignature = await getLuxorSignatureRequestByToken(token) || signature
        }
      } catch (viewError) {
        // The agreement itself remains readable even if a non-critical
        // analytics/activity write is temporarily unavailable.
        console.error('Unable to record agreement view activity:', viewError)
      }
    }

    return NextResponse.json({ ...publicSignature(responseSignature), ...await publicPayment(responseSignature), status: responseSignature.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body.token || '').trim()
    const pendingSignature = await getLuxorSignatureRequestByToken(token)
    if (!pendingSignature) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    }
    const recoveryOnly = pendingSignature.status === 'signed'
    const signedName = String(body.signedName || pendingSignature.signed_name || '').trim()

    if (!signedName) {
      return NextResponse.json({ error: 'Please type your legal name.' }, { status: 400 })
    }

    if (!recoveryOnly && !body.accepted) {
      return NextResponse.json({ error: 'Please accept the signing acknowledgement.' }, { status: 400 })
    }

    const signatureDataUrl = String(body.signatureDataUrl || '')
    if (!recoveryOnly && !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(signatureDataUrl)) {
      return NextResponse.json({ error: 'Please add your signature before completing the agreement.' }, { status: 400 })
    }
    if (!recoveryOnly && signatureDataUrl.length > 2_500_000) {
      return NextResponse.json({ error: 'The signature image is too large. Please clear it and try again.' }, { status: 413 })
    }

    const pendingBooking = pendingSignature ? await getLuxorBooking(pendingSignature.booking_id) : null
    const pendingInvoice = pendingBooking?.invoice_id ? await getInvoice(pendingBooking.invoice_id) : null
    if (!recoveryOnly && pendingInvoice && isLuxorOfferExpired(pendingInvoice)) {
      await updateLuxorSignatureRequest(pendingSignature.id, { status: 'void', metadata: { ...pendingSignature.metadata, voidReason: 'proposal_offer_expired', voidedAt: new Date().toISOString() } })
      return NextResponse.json({ error: 'This proposal offer has expired. Luxor will need to send an updated agreement before it can be signed.' }, { status: 410 })
    }

    const signature = await signLuxorSignatureRequest({
      token,
      signedName,
      signatureDataUrl,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ...publicSignature(signature), ...await publicPayment(signature) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit signature.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
