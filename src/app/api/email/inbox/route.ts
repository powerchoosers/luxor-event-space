import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorZohoInbox, listLuxorZohoMessagesForAddress } from '@/lib/zohoMailServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get('limit') || '25', 10)
    const email = searchParams.get('email') || ''
    const safeLimit = Number.isFinite(limit) ? limit : 25
    const messages = email
      ? await listLuxorZohoMessagesForAddress(email, safeLimit)
      : await listLuxorZohoInbox(safeLimit)

    return NextResponse.json({
      mailbox: session.mailboxAddress || session.email,
      email: email || null,
      messages,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Zoho inbox.'
    const scopeError = message.includes('INVALID_OAUTHSCOPE')

    return NextResponse.json(
      {
        error: scopeError
          ? 'Zoho needs to be reconnected with email search permission before client email history can load.'
          : message,
        reconnectRequired: scopeError,
      },
      { status: scopeError ? 403 : 500 },
    )
  }
}
