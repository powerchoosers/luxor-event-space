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
      return NextResponse.json({ status: 'unknown', phone_number: phone })
    }
    return NextResponse.json(consent)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check SMS consent.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
