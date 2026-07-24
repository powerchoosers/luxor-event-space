import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorMessages, markLuxorMessageRead } from '@/lib/luxorMessagesServer'
import { assertOwnedLuxorMessagingNumber } from '@/lib/luxorPhoneNumbersServer'
import { sendLuxorDirectText } from '@/lib/luxorDirectTextServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  return NextResponse.json(await listLuxorMessages({ inquiryId: request.nextUrl.searchParams.get('inquiryId'), limit: Number(request.nextUrl.searchParams.get('limit') || 200) }), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const { to, body, inquiryId, contactName, fromNumber } = await request.json() as { to?: string; body?: string; inquiryId?: string; contactName?: string; fromNumber?: string }
    const selectedPhoneNumber = fromNumber ? await assertOwnedLuxorMessagingNumber(fromNumber) : null
    const message = await sendLuxorDirectText({
      to,
      body,
      inquiryId,
      contactName,
      ownerEmail: session.email,
      fromNumber: selectedPhoneNumber,
    })
    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send text message.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const { id } = await request.json() as { id?: string }
  if (!id) return NextResponse.json({ error: 'Message ID required.' }, { status: 400 })
  const message = await markLuxorMessageRead(id)
  return message ? NextResponse.json(message) : NextResponse.json({ error: 'Message not found.' }, { status: 404 })
}
