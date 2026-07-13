import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const email = session.email.toLowerCase()
    const preferences = await supabaseRest<Array<{ theme: string; notification_emails?: string }>>(
      `luxor_user_preferences?email=eq.${encodeURIComponent(email)}&select=theme,notification_emails`
    )
    const pref = preferences?.[0]

    return NextResponse.json({
      theme: pref?.theme || 'dark',
      notification_emails: pref?.notification_emails || 'booking@luxoratlaspalmas.com',
    })
  } catch (error) {
    console.error('Failed to get user theme preference:', error)
    return NextResponse.json({ error: 'Failed to get user theme preference.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const email = session.email.toLowerCase()

    // Fetch existing preferences to merge them safely
    const preferences = await supabaseRest<Array<{ theme?: string; notification_emails?: string }>>(
      `luxor_user_preferences?email=eq.${encodeURIComponent(email)}&select=theme,notification_emails`
    )
    const existing = preferences?.[0] || {}

    const body = await request.json().catch(() => ({}))
    const theme = body.theme !== undefined ? body.theme : existing.theme || 'dark'
    const notification_emails = body.notification_emails !== undefined
      ? String(body.notification_emails).trim()
      : existing.notification_emails || 'booking@luxoratlaspalmas.com'

    if (theme !== 'light' && theme !== 'dark') {
      return NextResponse.json({ error: 'Invalid theme. Must be "light" or "dark".' }, { status: 400 })
    }

    // Perform an upsert in PostgREST using Prefer: resolution=merge-duplicates (or on-conflict)
    await supabaseRest('luxor_user_preferences', {
      method: 'POST',
      headers: {
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        email,
        theme,
        notification_emails,
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save user theme preference:', error)
    return NextResponse.json({ error: 'Failed to save user theme preference.' }, { status: 500 })
  }
}
