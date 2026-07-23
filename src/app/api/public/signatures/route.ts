import { NextRequest, NextResponse } from 'next/server'
import { getLuxorSignatureRequestByToken, recordLuxorSignatureEvent, signLuxorSignatureRequest, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { cancelQueuedLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { updateLuxorBooking } from '@/lib/luxorBookingsServer'

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
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const signature = await getLuxorSignatureRequestByToken(token)

    if (!signature) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    }

    if (signature.status === 'sent') {
      await Promise.all([
        updateLuxorSignatureRequest(signature.id, { status: 'viewed' }),
        updateLuxorBooking(signature.booking_id, { contract_status: 'viewed' }),
      ])
    }
    if (signature.inquiry_id) await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder'])
    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'viewed',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ...publicSignature(signature), status: signature.status === 'sent' ? 'viewed' : signature.status })
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

    const signature = await signLuxorSignatureRequest({
      token: String(body.token || ''),
      signedName,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(publicSignature(signature))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit signature.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
