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
    const preferences = await supabaseRest<Array<{ theme: string }>>(
      `luxor_user_preferences?email=eq.${encodeURIComponent(email)}&select=theme`
    )
    const pref = preferences?.[0]

    return NextResponse.json({ theme: pref?.theme || 'dark' })
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

    const body = await request.json().catch(() => ({}))
    const theme = body.theme

    if (theme !== 'light' && theme !== 'dark') {
      return NextResponse.json({ error: 'Invalid theme. Must be "light" or "dark".' }, { status: 400 })
    }

    const email = session.email.toLowerCase()

    // Perform an upsert in PostgREST using Prefer: resolution=merge-duplicates (or on-conflict)
    await supabaseRest('luxor_user_preferences', {
      method: 'POST',
      headers: {
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        email,
        theme,
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save user theme preference:', error)
    return NextResponse.json({ error: 'Failed to save user theme preference.' }, { status: 500 })
  }
}
