import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken } from '@/lib/luxorElenaConfirmation'
import { triggerLuxorCursorAutomation } from '@/lib/luxorCursorAutomationServer'
import {
  parseDeveloperSupportAttachmentInputs,
  signDeveloperSupportAttachmentUrls,
  storeDeveloperSupportAttachments,
  type DeveloperSupportStoredAttachment,
} from '@/lib/luxorDeveloperSupportAttachmentsServer'

export type DeveloperSupportTicket = {
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
}

export function parseDeveloperSupportTicket(input: unknown): DeveloperSupportTicket & { attachments: ReturnType<typeof parseDeveloperSupportAttachmentInputs> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid support ticket.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !['title', 'description', 'priority', 'pagePath', 'attachments'].includes(key))) throw new Error('Invalid support ticket.')
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) throw new Error('Invalid support ticket.')
  if (value.description != null && (typeof value.description !== 'string' || value.description.trim().length > 4000)) throw new Error('Invalid support ticket.')
  const priority = value.priority == null ? 'medium' : value.priority
  if (priority !== 'low' && priority !== 'medium' && priority !== 'high' && priority !== 'urgent') throw new Error('Invalid support ticket.')
  let pagePath: string | null = null
  if (value.pagePath != null && value.pagePath !== '') {
    if (typeof value.pagePath !== 'string' || value.pagePath.length > 2048 || !value.pagePath.startsWith('/portal')) throw new Error('Invalid support ticket.')
    pagePath = value.pagePath.trim()
  }
  const attachments = parseDeveloperSupportAttachmentInputs(value.attachments)
  return {
    title: value.title.trim(),
    description: typeof value.description === 'string' ? value.description.trim() || null : null,
    priority,
    pagePath,
    attachments,
  }
}

async function ownerIdentity() {
  const [verified, active, store] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession(), cookies()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) throw new Error('Session unavailable.')
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || member.role !== 'owner') throw new Error('Only the Luxor owner can send developer support tickets from Elena.')
  const cookie = store.get(LUXOR_PORTAL_SESSION_COOKIE)?.value
  if (!cookie) throw new Error('Session unavailable.')
  return { member, issuedAt: verified.issuedAt, sessionHash: createHash('sha256').update(cookie).digest('hex') }
}

function buildCursorContext(
  ticket: DeveloperSupportTicket & {
    reporterEmail: string
    reporterName: string
    confirmationId: string
    attachmentContext: string | null
  },
) {
  return [
    'Luxor portal developer support ticket from Elena.',
    '',
    `Reporter: ${ticket.reporterName} (${ticket.reporterEmail})`,
    `Priority: ${ticket.priority}`,
    `Portal page: ${ticket.pagePath || '/portal'}`,
    `Ticket id: ${ticket.confirmationId}`,
    '',
    `Title: ${ticket.title}`,
    '',
    ticket.description ? `Details:\n${ticket.description}` : 'Details: (none provided)',
    '',
    ticket.attachmentContext ? `${ticket.attachmentContext}\n` : '',
    'Work in the luxor-event-space repository on main. Follow AGENTS.md and docs/luxor-design-skill.md for UI work. Keep changes scoped to the reported issue.',
    'When attachments include signed URLs, download and inspect them for screenshots, PDFs, and context. URLs expire after about seven days.',
    'Run npm run typecheck and npm run lint -- --quiet before finishing. Do not push unless Lewis explicitly asked in this automation run.',
  ].filter((line, index, array) => !(line === '' && index > 0 && array[index - 1] === '')).join('\n')
}

async function buildAttachmentContext(attachments: DeveloperSupportStoredAttachment[]) {
  if (!attachments.length) return null
  const signed = await signDeveloperSupportAttachmentUrls(attachments)
  const lines = [
    'Owner-provided attachments (signed URLs for the cloud worker):',
  ]
  for (const item of signed) {
    if (item.kind === 'text' && item.text_excerpt) {
      lines.push(`- ${item.file_name} (text excerpt):`)
      lines.push(item.text_excerpt)
      continue
    }
    if (item.signed_url) {
      lines.push(`- ${item.file_name} (${item.content_type}): ${item.signed_url}`)
    }
  }
  return lines.join('\n')
}

export async function issueElenaDeveloperSupportConfirmation(input: unknown) {
  const ticket = parseDeveloperSupportTicket(input)
  const auth = await ownerIdentity()
  const token = newElenaConfirmationToken()
  let contextAttachments: DeveloperSupportStoredAttachment[] = []
  if (ticket.attachments.length > 0) {
    contextAttachments = await storeDeveloperSupportAttachments(token.id, ticket.attachments)
  }
  const result = await supabaseRestStrict<{ expires_at: string; reporter_name: string }>('rpc/luxor_elena_issue_developer_support_confirmation', {
    method: 'POST',
    body: JSON.stringify({
      p_id: token.id,
      p_token_hash: token.tokenHash,
      p_member_id: auth.member.id,
      p_session_hash: auth.sessionHash,
      p_session_issued_at_ms: auth.issuedAt,
      p_title: ticket.title,
      p_description: ticket.description,
      p_priority: ticket.priority,
      p_page_path: ticket.pagePath,
      p_context_attachments: contextAttachments,
    }),
  })
  if (!result || typeof result.expires_at !== 'string' || typeof result.reporter_name !== 'string') throw new Error('Confirmation unavailable.')
  const summary = [
    `Send developer support ticket as ${JSON.stringify(result.reporter_name)}`,
    `Title: ${JSON.stringify(ticket.title)}`,
    `Priority: ${ticket.priority}`,
    `Page: ${ticket.pagePath || '/portal'}`,
    ticket.description ? `Details:\n${ticket.description}` : 'Details: (none)',
    '',
    'This will notify Lewis through Cursor to investigate and fix the portal.',
  ].filter(Boolean).join('\n')
  return {
    token: token.token,
    expiresAt: result.expires_at,
    summary,
    reporterName: result.reporter_name,
    attachments: contextAttachments.map((item) => ({
      fileName: item.file_name,
      kind: item.kind,
      storagePath: item.storage_path,
    })),
  }
}

export async function consumeElenaDeveloperSupportConfirmation(input: unknown) {
  const token = parseElenaConfirmationToken(input)
  const auth = await ownerIdentity()
  const consumed = await supabaseRestStrict<{
    confirmation_id: string
    title: string
    description: string | null
    priority: string
    page_path: string | null
    context_attachments: DeveloperSupportStoredAttachment[] | null
    reporter_email: string
    reporter_name: string
  }>('rpc/luxor_elena_consume_developer_support_confirmation', {
    method: 'POST',
    body: JSON.stringify({
      p_id: token.id,
      p_token_hash: token.tokenHash,
      p_member_id: auth.member.id,
      p_session_hash: auth.sessionHash,
      p_session_issued_at_ms: auth.issuedAt,
    }),
  })
  if (
    !consumed
    || typeof consumed.confirmation_id !== 'string'
    || typeof consumed.title !== 'string'
    || typeof consumed.reporter_email !== 'string'
  ) {
    throw new Error('Confirmation result unavailable.')
  }

  const storedAttachments = Array.isArray(consumed.context_attachments) ? consumed.context_attachments : []
  const attachmentContext = await buildAttachmentContext(storedAttachments)
  const context = buildCursorContext({
    confirmationId: consumed.confirmation_id,
    title: consumed.title,
    description: typeof consumed.description === 'string' ? consumed.description : null,
    priority: (consumed.priority === 'low' || consumed.priority === 'medium' || consumed.priority === 'high' || consumed.priority === 'urgent')
      ? consumed.priority
      : 'medium',
    pagePath: typeof consumed.page_path === 'string' ? consumed.page_path : null,
    reporterEmail: consumed.reporter_email,
    reporterName: typeof consumed.reporter_name === 'string' ? consumed.reporter_name : consumed.reporter_email,
    attachmentContext,
  })

  try {
    const dispatch = await triggerLuxorCursorAutomation(context)
    if (dispatch.runUuid || dispatch.backgroundComposerId) {
      await supabaseRestStrict('rpc/luxor_elena_record_developer_support_dispatch', {
        method: 'POST',
        body: JSON.stringify({
          p_id: token.id,
          p_token_hash: token.tokenHash,
          p_member_id: auth.member.id,
          p_cursor_run_uuid: dispatch.runUuid,
          p_cursor_background_composer_id: dispatch.backgroundComposerId,
        }),
      })
    }
    return { confirmation_id: consumed.confirmation_id, dispatch }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Cursor automation could not be notified.')
  }
}
