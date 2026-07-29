import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  bulkAddMarketingMembers,
  bulkRemoveMarketingMembers,
  createMarketingList,
  getMarketingListById,
  getMarketingLists,
} from '@/lib/luxorMarketingServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      const list = await getMarketingListById(id)
      if (!list) return NextResponse.json({ error: 'Marketing list not found.' }, { status: 404 })
      return NextResponse.json({ list })
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
    const listId = typeof body.listId === 'string' ? body.listId.trim() : ''
    const listName = typeof body.listName === 'string' ? body.listName.trim() : ''
    const recipients = normalizeRecipients(body.recipients)

    if (!listId && !listName) return NextResponse.json({ error: 'Choose or name a marketing list.' }, { status: 400 })
    if (listName.length > 120 || recipients.length > 1000) return NextResponse.json({ error: 'List names are limited to 120 characters and bulk changes to 1,000 contacts.' }, { status: 400 })

    if (!recipients.length) {
      if (!listName) return NextResponse.json({ error: 'Enter a name for the new list.' }, { status: 400 })
      const created = await createMarketingList(listName, typeof body.description === 'string' ? body.description : null)
      const list = await getMarketingListById(created.id)
      return NextResponse.json({ success: true, list })
    }

    const result = await bulkAddMarketingMembers({ id: listId || null, name: listName || null }, recipients)
    const list = listId ? await getMarketingListById(listId) : null
    return NextResponse.json({ success: true, list, ...result })
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
    const listId = typeof body.listId === 'string' ? body.listId.trim() : ''
    const listName = typeof body.listName === 'string' ? body.listName.trim() : ''
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : []
    if ((!listId && !listName) || !emails.length) return NextResponse.json({ error: 'Choose a list and at least one contact.' }, { status: 400 })
    if (listName.length > 120 || emails.length > 1000) return NextResponse.json({ error: 'List names are limited to 120 characters and bulk changes to 1,000 contacts.' }, { status: 400 })

    const removed = await bulkRemoveMarketingMembers({ id: listId || null, name: listName || null }, emails)
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
      const record = recipient as { email?: unknown; name?: unknown; source?: unknown; metadata?: unknown }
      const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
      if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null
      return {
        email,
        name: typeof record.name === 'string' ? record.name.trim() || null : null,
        source: typeof record.source === 'string' ? record.source.trim() || null : null,
        metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? record.metadata as Record<string, unknown>
          : {},
      }
    })
    .filter((recipient): recipient is { email: string; name: string | null; source: string | null; metadata: Record<string, unknown> } => Boolean(recipient))
}
