import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { sendLuxorResendEmail } from '@/lib/luxorResendMailServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

const generic = NextResponse.json({ ok: true })

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic
  const member = await getLuxorPortalMember(email)
  if (!member || member.status === 'suspended') return generic
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString()
  await supabaseRest('luxor_portal_invites', { method: 'POST', body: JSON.stringify({ member_id: member.id, token_hash: tokenHash, expires_at: expiresAt }) })
  const url = new URL(request.url)
  const signInUrl = `${url.origin}/portal/activate?token=${encodeURIComponent(token)}`
  await sendLuxorResendEmail({ to: member.email, from: 'booking@luxoratlaspalmas.com', fromName: 'Luxor Event Space', subject: 'Your secure Luxor portal sign-in link', text: `Use this secure link to sign in to Luxor: ${signInUrl}\n\nIt expires in 30 minutes.`, content: `<p>Use this secure link to sign in to Luxor:</p><p><a href="${signInUrl}">Open Luxor portal</a></p><p>This link expires in 30 minutes.</p>`, idempotencyKey: `portal-login/${member.id}/${tokenHash}` })
  return generic
}
