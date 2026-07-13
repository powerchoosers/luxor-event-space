import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getMarketingLists, bulkAddMarketingMembers } from '@/lib/luxorMarketingServer'

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
    const { listName, recipients } = body

    if (!listName || !recipients || !Array.isArray(recipients)) {
      return NextResponse.json({ error: 'List name and recipients array are required.' }, { status: 400 })
    }

    await bulkAddMarketingMembers(listName, recipients)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save marketing list.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
