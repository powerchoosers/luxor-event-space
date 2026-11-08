import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken } from '@/lib/luxorElenaConfirmation'

export function parseElenaCloseTourDays(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 62) throw new Error('Invalid tour dates.')
  const dates = input.map(value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid tour dates.')
    const date = new Date(`${value}T12:00:00Z`)
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid tour dates.')
    return value
  })
  if (new Set(dates).size !== dates.length) throw new Error('Invalid tour dates.')
  return dates.sort()
}

async function identity() {
  const [verified, active, store] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession(), cookies()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) throw new Error('Session unavailable.')
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'calendar')) throw new Error('Permission unavailable.')
  const cookie = store.get(LUXOR_PORTAL_SESSION_COOKIE)?.value
  if (!cookie) throw new Error('Session unavailable.')
  return { member, issuedAt: verified.issuedAt, sessionHash: createHash('sha256').update(cookie).digest('hex') }
}

/** Internal chat issuer. The dates, action and member are stored in the database. */
export async function issueElenaCloseTourDaysConfirmation(input: unknown) {
  const dates = parseElenaCloseTourDays(input)
  const auth = await identity()
  const token = newElenaConfirmationToken()
  const result = await supabaseRestStrict<{ expires_at: string }>('rpc/luxor_elena_issue_close_tour_days', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt, p_dates: dates }),
  })
  if (!result || typeof result.expires_at !== 'string') throw new Error('Confirmation unavailable.')
  return { kind: 'close_tour_days' as const, token: token.token, expiresAt: result.expires_at, summary: `Make currently available or fully booked tour times on ${dates.join(', ')} unavailable for new online bookings. Existing reservations and held times stay unchanged. Times can be added or reopened later, including by a weekly schedule sync.` }
}

/** No client-supplied dates or action accepted at consumption. */
export async function consumeElenaCloseTourDaysConfirmation(input: unknown) {
  const token = parseElenaConfirmationToken(input)
  const auth = await identity()
  const result = await supabaseRestStrict<{ slots_closed: number }>('rpc/luxor_elena_consume_close_tour_days', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt }),
  })
  if (!result || !Number.isSafeInteger(result.slots_closed) || result.slots_closed < 0) throw new Error('Confirmation result unavailable.')
  return result
}
