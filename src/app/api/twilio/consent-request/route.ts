import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { sendLuxorSmsConsentRequest } from '@/lib/luxorDirectTextServer'
import { assertOwnedLuxorMessagingNumber } from '@/lib/luxorPhoneNumbersServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const input = await request.json() as {
      to?: string
      inquiryId?: string | null
      contactName?: string | null
      fromNumber?: string | null
    }
    if (!input.to) return NextResponse.json({ error: 'A contact phone number is required.' }, { status: 400 })
    const fromNumber = input.fromNumber ? await assertOwnedLuxorMessagingNumber(input.fromNumber) : null
    const result = await sendLuxorSmsConsentRequest({
      to: input.to,
      inquiryId: input.inquiryId,
      contactName: input.contactName,
      ownerEmail: session.email,
      fromNumber,
    })
    return NextResponse.json(result, { status: result.simulated ? 200 : 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request SMS consent.' }, { status: 400 })
  }
}
