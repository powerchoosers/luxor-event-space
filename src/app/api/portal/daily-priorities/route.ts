import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  listLuxorDailyPriorities,
  generateAndSaveLuxorDailyPriorities,
  toggleLuxorDailyPriority,
} from '@/lib/luxorDailyPrioritiesServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || undefined
    const refresh = searchParams.get('refresh') === '1'

    const priorities = refresh
      ? await generateAndSaveLuxorDailyPriorities(date, true)
      : await listLuxorDailyPriorities(date)

    return NextResponse.json({ ok: true, priorities })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch daily priorities.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id, completed } = body

    if (!id || typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'Missing id or completed boolean flag.' }, { status: 400 })
    }

    const updated = await toggleLuxorDailyPriority(id, completed)
    return NextResponse.json({ ok: true, priority: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update priority status.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
