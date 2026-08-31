import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createLuxorPortalSessionCookie } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { createLuxorSupabaseAuthAdmin } from '@/lib/luxorSupabaseAuthServer'

async function findInvite(token: unknown) {
  const value = typeof token === 'string' ? token : ''
  if (!/^[A-Za-z0-9_-]{20,}$/.test(value)) return null
  const hash = createHash('sha256').update(value).digest('hex')
  const rows = await supabaseRest<Array<{ id: string; member_id: string; purpose: 'activation' | 'password_reset' }>>(`luxor_portal_invites?token_hash=eq.${hash}&sent_at=not.is.null&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,member_id,purpose&limit=1`)
  return rows[0] || null
}

export async function GET(request: NextRequest) {
  const invite = await findInvite(request.nextUrl.searchParams.get('token'))
  if (!invite) return NextResponse.json({ error: 'This link is invalid or expired.' }, { status: 400 })
  const members = await supabaseRest<Array<{ email: string; display_name: string }>>(`luxor_portal_members?id=eq.${invite.member_id}&select=email,display_name&limit=1`)
  if (!members[0]) return NextResponse.json({ error: 'This account is no longer available.' }, { status: 404 })
  return NextResponse.json({ email: members[0].email, displayName: members[0].display_name, purpose: invite.purpose })
}

export async function POST(request: NextRequest) {
  const { token, password } = await request.json().catch(() => ({}))
  const invite = await findInvite(token)
  if (!invite) return NextResponse.json({ error: 'This sign-in link is invalid or expired.' }, { status: 400 })
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return NextResponse.json({ error: 'Use at least 12 characters for your password.' }, { status: 400 })
  const members = await supabaseRest<Array<{ email: string }>>(`luxor_portal_members?id=eq.${invite.member_id}&select=email&limit=1`)
  const member = members[0] ? await getLuxorPortalMember(members[0].email) : null
  if (!member || member.status === 'suspended') return NextResponse.json({ error: 'This account is no longer active.' }, { status: 403 })
  if (!member.auth_user_id) return NextResponse.json({ error: 'This login identity needs administrator attention.' }, { status: 409 })
  const auth = createLuxorSupabaseAuthAdmin()
  const updated = await auth.auth.admin.updateUserById(member.auth_user_id, { password })
  if (updated.error) return NextResponse.json({ error: 'Unable to set the password. Request a new link and try again.' }, { status: 400 })
  const signedIn = await auth.auth.signInWithPassword({ email: member.email, password })
  if (signedIn.error) return NextResponse.json({ error: 'Password saved, but sign-in could not be completed.' }, { status: 400 })
  const now = new Date().toISOString()
  await Promise.all([
    supabaseRest(`luxor_portal_invites?id=eq.${invite.id}&used_at=is.null`, { method: 'PATCH', body: JSON.stringify({ used_at: now }) }),
    supabaseRest(`luxor_portal_members?id=eq.${member.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', password_set_at: now, last_signed_in_at: now, sessions_revoked_at: now, updated_at: now }) }),
  ])
  const response = NextResponse.json({ ok: true })
  const session = createLuxorPortalSessionCookie({ email: member.email, accountId: null, mailboxAddress: member.sender_email || 'booking@luxoratlaspalmas.com' })
  response.cookies.set(session.name, session.value, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: session.maxAge })
  return response
}
