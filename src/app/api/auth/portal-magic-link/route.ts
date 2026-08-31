import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { sendLuxorResendEmail } from '@/lib/luxorResendMailServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

function generic() {
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic()
  const purpose = body.purpose === 'password_reset' ? 'password_reset' : 'activation'
  const member = await getLuxorPortalMember(email)
  if (!member || member.status === 'suspended') return generic()
  if (!member.recovery_email) return generic()
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString()
  const [invite] = await supabaseRest<Array<{ id: string }>>('luxor_portal_invites?select=id', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: member.id, token_hash: tokenHash, expires_at: expiresAt, purpose }),
  })
  if (!invite) throw new Error('The secure sign-in link could not be recorded.')
  const url = new URL(request.url)
  const signInUrl = `${url.origin}/portal/activate?token=${encodeURIComponent(token)}`
  const action = purpose === 'password_reset' ? 'reset your Luxor portal password' : 'activate your Luxor portal login'
  const delivery = await sendLuxorResendEmail({ to: member.recovery_email, from: 'booking@luxoratlaspalmas.com', fromName: 'Luxor Event Space', subject: purpose === 'password_reset' ? 'Reset your Luxor portal password' : 'Activate your Luxor portal login', text: `Use this secure link to ${action}: ${signInUrl}\n\nYour Luxor login is ${member.email}. The link expires in 30 minutes.`, content: `<p>Use this secure link to ${action}:</p><p><a href="${signInUrl}">Continue to Luxor portal</a></p><p>Your Luxor login is <strong>${member.email}</strong>. This link expires in 30 minutes.</p>`, idempotencyKey: `portal-${purpose}/${member.id}/${tokenHash}` })
  const sentAt = new Date().toISOString()
  await Promise.all([
    supabaseRest(`luxor_portal_invites?id=eq.${invite.id}`, { method: 'PATCH', body: JSON.stringify({ sent_at: sentAt, resend_message_id: delivery.providerMessageId || delivery.messageId }) }),
    supabaseRest(`luxor_portal_invites?member_id=eq.${member.id}&used_at=is.null&id=neq.${invite.id}`, { method: 'PATCH', body: JSON.stringify({ used_at: sentAt }) }),
    supabaseRest(`luxor_portal_members?id=eq.${member.id}`, { method: 'PATCH', body: JSON.stringify(purpose === 'password_reset' ? { password_reset_sent_at: sentAt, updated_at: sentAt } : { invited_at: sentAt, updated_at: sentAt }) }),
  ])
  return generic()
}
