import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { safeProfileAvatarUrl } from '@/lib/luxorUserProfileServer'

type UserPreferences = {
  theme?: string
  notification_emails?: string
  display_name?: string | null
  role_title?: string | null
  avatar_url?: string | null
}

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const email = session.email.toLowerCase()
    const preferences = await supabaseRest<UserPreferences[]>(
      `luxor_user_preferences?email=eq.${encodeURIComponent(email)}&select=theme,notification_emails,display_name,role_title,avatar_url`
    )
    const pref = preferences?.[0]

    return NextResponse.json({
      theme: pref?.theme || 'dark',
      notification_emails: pref?.notification_emails || 'booking@luxoratlaspalmas.com',
      email,
      display_name: pref?.display_name || '',
      role_title: pref?.role_title || '',
      avatar_url: safeProfileAvatarUrl(pref?.avatar_url),
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
    const preferences = await supabaseRest<UserPreferences[]>(
      `luxor_user_preferences?email=eq.${encodeURIComponent(email)}&select=theme,notification_emails,display_name,role_title,avatar_url`
    )
    const existing = preferences?.[0] || {}

    const body = await request.json().catch(() => ({}))
    const theme = body.theme !== undefined ? body.theme : existing.theme || 'dark'
    const notification_emails = body.notification_emails !== undefined
      ? String(body.notification_emails).trim()
      : existing.notification_emails || 'booking@luxoratlaspalmas.com'
    const displayName = body.display_name !== undefined
      ? String(body.display_name).trim()
      : existing.display_name?.trim() || ''
    const roleTitle = body.role_title !== undefined
      ? String(body.role_title).trim()
      : existing.role_title?.trim() || ''
    const avatarUrl = body.avatar_url !== undefined
      ? safeProfileAvatarUrl(body.avatar_url)
      : safeProfileAvatarUrl(existing.avatar_url)

    if (theme !== 'light' && theme !== 'dark') {
      return NextResponse.json({ error: 'Invalid theme. Must be "light" or "dark".' }, { status: 400 })
    }

    if (!displayName || displayName.length > 100) {
      return NextResponse.json({ error: 'Your sender name is required and must be 100 characters or fewer.' }, { status: 400 })
    }

    if (!roleTitle || roleTitle.length > 120) {
      return NextResponse.json({ error: 'Your title is required and must be 120 characters or fewer.' }, { status: 400 })
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
        display_name: displayName,
        role_title: roleTitle,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save user theme preference:', error)
    return NextResponse.json({ error: 'Failed to save user theme preference.' }, { status: 500 })
  }
}
