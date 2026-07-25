import { NextRequest, NextResponse } from 'next/server'
import { getLuxorSignatureRequestByToken, recordLuxorSignatureEvent, signLuxorSignatureRequest, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { cancelQueuedLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorContractSignaturePlacement } from '@/lib/luxorSignaturePlacement'
import { LUXOR_CONTRACT_SIGNATURE_PLACEMENT } from '@/lib/luxorSignaturePlacement'

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

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    if (process.env.NODE_ENV === 'development' && token === 'ux-review') {
      return NextResponse.json({
        id: 'ux-review',
        client_name: 'Sophia Martinez',
        client_email: 'sophia@example.com',
        status: 'viewed',
        contract_title: 'Quinceañera Booking Agreement',
        signed_name: null,
        signed_at: null,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        signature_placement: LUXOR_CONTRACT_SIGNATURE_PLACEMENT,
      })
    }
    const signature = await getLuxorSignatureRequestByToken(token)

    if (!signature) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    }

    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now() && signature.status !== 'signed') {
      return NextResponse.json({ error: 'This signing link has expired. Please contact Luxor Event Space for a new agreement.' }, { status: 410 })
    }

    const isInternalOwner = Boolean(request.cookies.get('luxor_portal_session'))

    if (signature.status === 'sent' && !isInternalOwner) {
      await Promise.all([
        updateLuxorSignatureRequest(signature.id, { status: 'viewed' }),
        updateLuxorBooking(signature.booking_id, { contract_status: 'viewed' }),
      ])
      if (signature.inquiry_id) await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder'])
      await recordLuxorSignatureEvent({
        signatureRequestId: signature.id,
        eventType: 'viewed',
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      })
    }

    return NextResponse.json({ ...publicSignature(signature), status: signature.status === 'sent' && !isInternalOwner ? 'viewed' : signature.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const signedName = String(body.signedName || '').trim()

    if (!signedName) {
      return NextResponse.json({ error: 'Please type your legal name.' }, { status: 400 })
    }

    if (!body.accepted) {
      return NextResponse.json({ error: 'Please accept the signing acknowledgement.' }, { status: 400 })
    }

    const signatureDataUrl = String(body.signatureDataUrl || '')
    if (!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(signatureDataUrl)) {
      return NextResponse.json({ error: 'Please add your signature before completing the agreement.' }, { status: 400 })
    }
    if (signatureDataUrl.length > 2_500_000) {
      return NextResponse.json({ error: 'The signature image is too large. Please clear it and try again.' }, { status: 413 })
    }

    const signature = await signLuxorSignatureRequest({
      token: String(body.token || ''),
      signedName,
      signatureDataUrl,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(publicSignature(signature))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit signature.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
