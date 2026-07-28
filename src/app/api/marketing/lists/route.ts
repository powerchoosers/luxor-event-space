import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getMarketingLists, bulkAddMarketingMembers, bulkRemoveMarketingMembers } from '@/lib/luxorMarketingServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const lists = await getMarketingLists()
    return NextResponse.json({ lists })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load marketing lists.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const listName = typeof body.listName === 'string' ? body.listName.trim() : ''
    const recipients = normalizeRecipients(body.recipients)

    if (!listName || !recipients.length) {
      return NextResponse.json({ error: 'List name and recipients array are required.' }, { status: 400 })
    }
    if (listName.length > 120 || recipients.length > 1000) return NextResponse.json({ error: 'List names are limited to 120 characters and bulk changes to 1,000 contacts.' }, { status: 400 })

    const result = await bulkAddMarketingMembers(listName, recipients)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save marketing list.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json()
    const listName = typeof body.listName === 'string' ? body.listName.trim() : ''
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : []
    if (!listName || !emails.length) return NextResponse.json({ error: 'Choose a list and at least one contact.' }, { status: 400 })
    if (listName.length > 120 || emails.length > 1000) return NextResponse.json({ error: 'List names are limited to 120 characters and bulk changes to 1,000 contacts.' }, { status: 400 })

    const removed = await bulkRemoveMarketingMembers(listName, emails)
    return NextResponse.json({ success: true, removed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove contacts from the marketing list.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((recipient) => {
      if (!recipient || typeof recipient !== 'object') return null
      const record = recipient as { email?: unknown; name?: unknown }
      const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
      if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null
      return { email, name: typeof record.name === 'string' ? record.name.trim() || null : null }
    })
    .filter((recipient): recipient is { email: string; name: string | null } => Boolean(recipient))
}
