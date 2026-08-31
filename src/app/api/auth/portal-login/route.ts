import { NextResponse } from 'next/server'
import { createLuxorPortalSessionCookie } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { createLuxorSupabaseAuthAdmin } from '@/lib/luxorSupabaseAuthServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 8 * 1024

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON request required.' }, { status: 415 })
  }
  const text = await request.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  let body: { email?: unknown; password?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const member = email.endsWith('@luxoratlaspalmas.com') ? await getLuxorPortalMember(email) : null
  if (!member || member.status !== 'active') {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  const auth = createLuxorSupabaseAuthAdmin()
  const signedIn = await auth.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.user) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  const now = new Date().toISOString()
  await supabaseRest(`luxor_portal_members?id=eq.${member.id}`, { method: 'PATCH', body: JSON.stringify({ last_signed_in_at: now, updated_at: now }) })
  const response = NextResponse.json({ ok: true })
  const session = createLuxorPortalSessionCookie({ email, accountId: null, mailboxAddress: member.sender_email || 'booking@luxoratlaspalmas.com' })
  response.cookies.set(session.name, session.value, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  })
  return response
}
