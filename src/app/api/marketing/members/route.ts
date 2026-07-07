import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { addMarketingMember, removeMarketingMember, isMarketingMember } from '@/lib/luxorMarketingServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const subscribed = await isMarketingMember(email)
    return NextResponse.json({ subscribed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to query subscriber status.'
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
    const { email, fullName, source, action } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    if (action === 'subscribe') {
      await addMarketingMember(email, fullName, source)
      return NextResponse.json({ success: true, subscribed: true })
    } else if (action === 'unsubscribe') {
      await removeMarketingMember(email)
      return NextResponse.json({ success: true, subscribed: false })
    } else {
      return NextResponse.json({ error: 'Invalid action. Use subscribe or unsubscribe.' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update subscriber status.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
