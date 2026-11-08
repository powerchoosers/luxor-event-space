import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken } from '@/lib/luxorElenaConfirmation'

export function parseElenaCleaningCompletion(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid cleaning entry.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['taskName', 'notes'].includes(key)) || typeof value.taskName !== 'string') throw new Error('Invalid cleaning entry.')
  const taskName = value.taskName.trim()
  if (!taskName || taskName.length > 200 || /[\u0000-\u001f\u007f]/.test(taskName)) throw new Error('Invalid cleaning entry.')
  if (value.notes != null && typeof value.notes !== 'string') throw new Error('Invalid cleaning entry.')
  const notes = typeof value.notes === 'string' ? value.notes.trim() || null : null
  if (notes && (notes.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes))) throw new Error('Invalid cleaning entry.')
  return { taskName, notes }
}

async function identity() {
  const [verified, active, store] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession(), cookies()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) throw new Error('Session unavailable.')
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'operations')) throw new Error('Permission unavailable.')
  const cookie = store.get(LUXOR_PORTAL_SESSION_COOKIE)?.value
  if (!cookie) throw new Error('Session unavailable.')
  return { member, issuedAt: verified.issuedAt, sessionHash: createHash('sha256').update(cookie).digest('hex') }
}

/** Called only by the authorized chat handler after the user asks to record a completion. */
export async function issueElenaCleaningCompletion(input: unknown) {
  const action = parseElenaCleaningCompletion(input)
  const auth = await identity()
  const token = newElenaConfirmationToken()
  const result = await supabaseRestStrict<{ expires_at: string }>('rpc/luxor_elena_issue_cleaning_completion', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt, p_task_name: action.taskName, p_notes: action.notes }),
  })
  if (!result || typeof result.expires_at !== 'string') throw new Error('Confirmation unavailable.')
  return { kind: 'record_cleaning_completion' as const, token: token.token, expiresAt: result.expires_at, summary: `Record a completed cleaning entry at confirmation time.\nTask: ${JSON.stringify(action.taskName)}\nNotes: ${action.notes === null ? 'None' : JSON.stringify(action.notes)}` }
}

/** Only the token is accepted. The action and reviewed payload stay server-side. */
export async function consumeElenaCleaningCompletion(input: unknown) {
  const token = parseElenaConfirmationToken(input)
  const auth = await identity()
  const result = await supabaseRestStrict<{ cleaning_id: string }>('rpc/luxor_elena_consume_cleaning_completion', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt }),
  })
  if (!result || typeof result.cleaning_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.cleaning_id)) throw new Error('Confirmation result unavailable.')
  return result
}
