import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken, parseElenaNoteAction } from '@/lib/luxorElenaConfirmation'

async function authorizedMember() {
  // Real signed cookie only: a development convenience session is not a
  // durable identity and cannot authorize an action.
  const [verified, active] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) throw new Error('Session unavailable.')
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'leads')) throw new Error('Permission unavailable.')
  const cookie = (await cookies()).get(LUXOR_PORTAL_SESSION_COOKIE)?.value
  if (!cookie) throw new Error('Session unavailable.')
  const sessionHash = createHash('sha256').update(cookie).digest('hex')
  return { session: verified, member, sessionHash }
}

/** Internal issuer for the chat route, never exposed as a client endpoint.
 * The migration must create a service-only issue RPC that persists this exact
 * validated payload and digest with a database-calculated short expiry. */
export async function issueElenaNoteConfirmation(input: unknown) {
  const action = parseElenaNoteAction(input)
  const { session, member, sessionHash } = await authorizedMember()
  const token = newElenaConfirmationToken()
  const result = await supabaseRestStrict<{ expires_at: string }>('rpc/luxor_elena_issue_note_confirmation', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: member.id, p_session_issued_at_ms: session.issuedAt, p_session_hash: sessionHash, p_inquiry_id: action.inquiryId, p_content: action.content }),
  })
  if (!result?.expires_at) throw new Error('Confirmation could not be prepared.')
  return { token: token.token, expiresAt: result.expires_at, summary: `Add this note to inquiry ${action.inquiryId}:\n\n${action.content}` }
}

/** The consume RPC must lock the stored intent, verify digest/member/session,
 * expiry and current leads permission, insert the note, and mark the intent
 * consumed in the same transaction. No action or summary comes from the client. */
export async function consumeElenaNoteConfirmation(token: unknown) {
  const parsed = parseElenaConfirmationToken(token)
  const { session, member, sessionHash } = await authorizedMember()
  const result = await supabaseRestStrict<{ note_id: string }>('rpc/luxor_elena_consume_note_confirmation', {
    method: 'POST', body: JSON.stringify({ p_id: parsed.id, p_token_hash: parsed.tokenHash, p_member_id: member.id, p_session_issued_at_ms: session.issuedAt, p_session_hash: sessionHash }),
  })
  if (!result || typeof result.note_id !== 'string' || !result.note_id) throw new Error('Confirmation result unavailable.')
  return result
}
