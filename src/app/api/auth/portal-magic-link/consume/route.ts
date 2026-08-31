import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createLuxorPortalSessionCookie } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'

export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({}))
  const value = typeof token === 'string' ? token : ''
  if (!/^[A-Za-z0-9_-]{20,}$/.test(value)) return NextResponse.json({ error: 'This sign-in link is invalid or expired.' }, { status: 400 })
  const hash = createHash('sha256').update(value).digest('hex')
  const rows = await supabaseRest<Array<{ id: string; member_id: string }>>(`luxor_portal_invites?token_hash=eq.${hash}&sent_at=not.is.null&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,member_id&limit=1`)
  const invite = rows[0]
  if (!invite) return NextResponse.json({ error: 'This sign-in link is invalid or expired.' }, { status: 400 })
  await supabaseRest(`luxor_portal_invites?id=eq.${invite.id}&used_at=is.null`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) })
  const members = await supabaseRest<Array<{ email: string }>>(`luxor_portal_members?id=eq.${invite.member_id}&select=email&limit=1`)
  const member = members[0] ? await getLuxorPortalMember(members[0].email) : null
  if (!member || member.status === 'suspended') return NextResponse.json({ error: 'This account is no longer active.' }, { status: 403 })
  await supabaseRest(`luxor_portal_members?id=eq.${member.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', last_signed_in_at: new Date().toISOString(), updated_at: new Date().toISOString() }) })
  const response = NextResponse.json({ ok: true })
  const session = createLuxorPortalSessionCookie({ email: member.email, accountId: null, mailboxAddress: member.sender_email || 'booking@luxoratlaspalmas.com' })
  response.cookies.set(session.name, session.value, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: session.maxAge })
  return response
}
