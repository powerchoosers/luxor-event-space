import { NextResponse } from 'next/server'
import { getLuxorSmsConsent } from '@/lib/luxorTextAutomationsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json({ error: 'Phone parameter required.' }, { status: 400 })
  }

  try {
    const consent = await getLuxorSmsConsent(phone)
    if (!consent) {
      return NextResponse.json({ status: 'unknown', phone_number: phone, consent_request_status: null })
    }
    const request = consent.proof?.sms_consent_request
    const consentRequestStatus = typeof request === 'object' && request && 'status' in request
      ? (request as { status?: unknown }).status
      : null
    return NextResponse.json({
      status: consent.status,
      phone_number: consent.phone_number,
      updated_at: consent.updated_at,
      consent_scopes: consent.consent_scopes || [],
      consent_request_status: consentRequestStatus === 'pending' || consentRequestStatus === 'failed' || consentRequestStatus === 'confirmed'
        ? consentRequestStatus
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check SMS consent.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
