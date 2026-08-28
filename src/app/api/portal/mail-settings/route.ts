import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorMailSettings } from '@/lib/luxorMailSettingsServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
    return NextResponse.json(await getLuxorMailSettings(), { headers })
  } catch {
    return NextResponse.json({ error: 'Email settings are unavailable. Please try again.' }, { status: 503, headers })
  }
}
