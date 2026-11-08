import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken } from '@/lib/luxorElenaConfirmation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Task = { inquiryId: string; title: string; description: string | null; priority: 'low' | 'medium' | 'high'; dueDate: string | null }
export function parseElenaTask(input: unknown): Task {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid task.')
  const v = input as Record<string, unknown>
  if (Object.keys(v).some(k => !['inquiryId', 'title', 'description', 'priority', 'dueDate'].includes(k))) throw new Error('Invalid task.')
  if (typeof v.inquiryId !== 'string' || !UUID.test(v.inquiryId) || typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 200) throw new Error('Invalid task.')
  if (v.description != null && (typeof v.description !== 'string' || v.description.trim().length > 4000)) throw new Error('Invalid task.')
  const priority = v.priority == null ? 'medium' : v.priority
  if (priority !== 'low' && priority !== 'medium' && priority !== 'high') throw new Error('Invalid task.')
  let dueDate: string | null = null
  if (v.dueDate != null && v.dueDate !== '') {
    if (typeof v.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)) throw new Error('Invalid task.')
    const parsed = new Date(`${v.dueDate}T00:00:00Z`)
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== v.dueDate) throw new Error('Invalid task.')
    dueDate = v.dueDate
  }
  return { inquiryId: v.inquiryId.toLowerCase(), title: v.title.trim(), description: typeof v.description === 'string' ? v.description.trim() || null : null, priority, dueDate }
}

async function identity() {
  const [verified, active, store] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession(), cookies()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) throw new Error('Session unavailable.')
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'leads') || !memberCan(member, 'calendar')) throw new Error('Permission unavailable.')
  const cookie = store.get(LUXOR_PORTAL_SESSION_COOKIE)?.value
  if (!cookie) throw new Error('Session unavailable.')
  return { member, issuedAt: verified.issuedAt, sessionHash: createHash('sha256').update(cookie).digest('hex') }
}

export async function issueElenaTaskConfirmation(input: unknown) {
  const task = parseElenaTask(input)
  const auth = await identity()
  const token = newElenaConfirmationToken()
  const result = await supabaseRestStrict<{ expires_at: string; client_name: string }>('rpc/luxor_elena_issue_task_confirmation', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt, p_inquiry_id: task.inquiryId, p_title: task.title, p_description: task.description, p_priority: task.priority, p_due_date: task.dueDate }),
  })
  if (!result || typeof result.expires_at !== 'string' || typeof result.client_name !== 'string') throw new Error('Confirmation unavailable.')
  return { token: token.token, expiresAt: result.expires_at, summary: `Create task for client ${JSON.stringify(result.client_name)} (${task.inquiryId})\nTitle: ${JSON.stringify(task.title)}\nDescription: ${JSON.stringify(task.description)}\nPriority: ${task.priority}\nStatus: pending\nDue date: ${task.dueDate || 'None'}` }
}

export async function consumeElenaTaskConfirmation(input: unknown) {
  const token = parseElenaConfirmationToken(input)
  const auth = await identity()
  const result = await supabaseRestStrict<{ task_id: string }>('rpc/luxor_elena_consume_task_confirmation', {
    method: 'POST', body: JSON.stringify({ p_id: token.id, p_token_hash: token.tokenHash, p_member_id: auth.member.id, p_session_hash: auth.sessionHash, p_session_issued_at_ms: auth.issuedAt }),
  })
  if (!result || typeof result.task_id !== 'string' || !UUID.test(result.task_id)) throw new Error('Confirmation result unavailable.')
  return result
}
