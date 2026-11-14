import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession, LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { SupabaseRestError, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { newElenaConfirmationToken, parseElenaConfirmationToken } from '@/lib/luxorElenaConfirmation'
import { triggerLuxorCursorAutomation } from '@/lib/luxorCursorAutomationServer'
import {
  developerSupportAttachmentsForDispatchRecord,
  developerSupportAttachmentsForWebhook,
  parseDeveloperSupportAttachmentInputs,
  signDeveloperSupportAttachmentUrls,
  storeDeveloperSupportAttachments,
  type DeveloperSupportSignedAttachment,
  type DeveloperSupportStoredAttachment,
  type DeveloperSupportWebhookAttachment,
} from '@/lib/luxorDeveloperSupportAttachmentsServer'
import {
  getDeveloperSupportPageArea,
  isValidDeveloperSupportPagePath,
  normalizeDeveloperSupportPagePath,
} from '@/lib/luxorDeveloperSupportPagePaths'
import type { LuxorDeveloperSupportWebhookPayload } from '@/lib/luxorCursorAutomationServer'
import {
  developerSupportDescriptionLimitMessage,
  LUXOR_DEVELOPER_SUPPORT_DESCRIPTION_MAX,
  LUXOR_DEVELOPER_SUPPORT_TITLE_MAX,
} from '@/lib/luxorDeveloperSupportLimits'

export class DeveloperSupportConfirmationExpiredError extends Error {
  readonly code = 'confirmation_expired' as const

  constructor() {
    super('This confirmation expired. Review the ticket again, then send.')
    this.name = 'DeveloperSupportConfirmationExpiredError'
  }
}

export type DeveloperSupportTicket = {
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
}

export function parseDeveloperSupportTicket(input: unknown): DeveloperSupportTicket & { attachments: ReturnType<typeof parseDeveloperSupportAttachmentInputs> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The ticket form was incomplete. Add a title and try again.')
  }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !['title', 'description', 'priority', 'pagePath', 'attachments'].includes(key))) {
    throw new Error('The ticket could not be read. Refresh Elena and open the developer support card again.')
  }
  if (typeof value.title !== 'string' || !value.title.trim()) {
    throw new Error('Add a short title describing what needs fixing.')
  }
  if (value.title.trim().length > LUXOR_DEVELOPER_SUPPORT_TITLE_MAX) {
    throw new Error(`Shorten the title to ${LUXOR_DEVELOPER_SUPPORT_TITLE_MAX} characters or less.`)
  }
  if (value.description != null && (typeof value.description !== 'string' || value.description.trim().length > LUXOR_DEVELOPER_SUPPORT_DESCRIPTION_MAX)) {
    throw new Error(developerSupportDescriptionLimitMessage())
  }
  const priority = value.priority == null ? 'medium' : value.priority
  if (priority !== 'low' && priority !== 'medium' && priority !== 'high' && priority !== 'urgent') {
    throw new Error('Choose a priority: low, medium, high, or urgent.')
  }
  let pagePath: string | null = null
  if (value.pagePath != null && value.pagePath !== '') {
    if (typeof value.pagePath !== 'string' || !isValidDeveloperSupportPagePath(value.pagePath)) {
      throw new Error('Choose a page from Applies to, or switch to Portal overview.')
    }
    pagePath = normalizeDeveloperSupportPagePath(value.pagePath)
  }
  let attachments: ReturnType<typeof parseDeveloperSupportAttachmentInputs>
  try {
    attachments = parseDeveloperSupportAttachmentInputs(value.attachments)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid support attachments.'
    throw new Error(
      detail.includes('Invalid support attachments')
        ? 'One or more attachments could not be included. Re-add the screenshot or PDF and try again.'
        : detail,
    )
  }
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
  const pagePath = normalizeDeveloperSupportPagePath(ticket.pagePath)
  const pageArea = getDeveloperSupportPageArea(pagePath)
  return [
    'Luxor portal developer support ticket from Elena.',
    '',
    `Reporter: ${ticket.reporterName} (${ticket.reporterEmail})`,
    `Priority: ${ticket.priority}`,
    `Target page path (authoritative route): ${pagePath}`,
    `Page area: ${pageArea}`,
    `Ticket id: ${ticket.confirmationId}`,
    '',
    `Title: ${ticket.title}`,
    '',
    ticket.description ? `Details:\n${ticket.description}` : 'Details: (none provided)',
    '',
    ticket.attachmentContext ? `${ticket.attachmentContext}\n` : '',
    'Work in the luxor-event-space repository on main. Follow AGENTS.md and docs/luxor-design-skill.md for UI work. Keep changes scoped to the reported issue.',
    'When attachments include signed URLs, download and inspect them for screenshots, PDFs, and context. URLs expire after about three days.',
    'Run npm run typecheck and npm run lint:ci -- --quiet before finishing. Do not push unless Lewis explicitly asked in this automation run.',
  ].filter((line, index, array) => !(line === '' && index > 0 && array[index - 1] === '')).join('\n')
}

export function buildDeveloperSupportWebhookPayload(input: {
  confirmationId: string
  title: string
  description: string | null
  priority: DeveloperSupportTicket['priority']
  pagePath: string | null
  reporterEmail: string
  reporterName: string
  attachmentContext: string | null
  attachments: DeveloperSupportWebhookAttachment[]
}): LuxorDeveloperSupportWebhookPayload {
  const pagePath = normalizeDeveloperSupportPagePath(input.pagePath)
  const pageArea = getDeveloperSupportPageArea(pagePath)
  const context = buildCursorContext({
    title: input.title,
    description: input.description,
    priority: input.priority,
    pagePath,
    confirmationId: input.confirmationId,
    reporterEmail: input.reporterEmail,
    reporterName: input.reporterName,
    attachmentContext: input.attachmentContext,
  })
  return {
    context,
    pagePath,
    pageArea,
    title: input.title,
    priority: input.priority,
    ticketId: input.confirmationId,
    attachments: input.attachments,
  }
}

async function buildAttachmentContext(attachments: DeveloperSupportStoredAttachment[]): Promise<{
  attachmentContext: string | null
  signed: DeveloperSupportSignedAttachment[]
  webhookAttachments: DeveloperSupportWebhookAttachment[]
}> {
  if (!attachments.length) {
    return { attachmentContext: null, signed: [], webhookAttachments: [] }
  }
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
  return {
    attachmentContext: lines.join('\n'),
    signed,
    webhookAttachments: developerSupportAttachmentsForWebhook(signed),
  }
}

export async function issueElenaDeveloperSupportConfirmation(input: unknown) {
  const ticket = parseDeveloperSupportTicket(input)
  const auth = await ownerIdentity()
  const token = newElenaConfirmationToken()
  let contextAttachments: DeveloperSupportStoredAttachment[] = []
  if (ticket.attachments.length > 0) {
    contextAttachments = await storeDeveloperSupportAttachments(token.id, ticket.attachments)
  }
  let result: { expires_at: string; reporter_name: string }
  try {
    result = await supabaseRestStrict<{ expires_at: string; reporter_name: string }>('rpc/luxor_elena_issue_developer_support_confirmation', {
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
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '42501') {
      throw new Error('Only an active owner session can prepare a developer ticket. Sign out and sign back in, then try again.')
    }
    if (error instanceof SupabaseRestError && (error.code === '22023' || /confirmation unavailable/i.test(error.message))) {
      throw new Error(`The ticket or a screenshot did not pass the save check. Remove the attachment, or shorten the title (${LUXOR_DEVELOPER_SUPPORT_TITLE_MAX}) and extra details (${LUXOR_DEVELOPER_SUPPORT_DESCRIPTION_MAX.toLocaleString('en-US')}), then try again.`)
    }
    throw error
  }
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
  let token: ReturnType<typeof parseElenaConfirmationToken>
  try {
    token = parseElenaConfirmationToken(input)
  } catch (error) {
    console.error('[developer-support] confirm failed', { step: 'token' })
    throw error
  }
  let auth: Awaited<ReturnType<typeof ownerIdentity>>
  try {
    auth = await ownerIdentity()
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 160) : 'session'
    console.error('[developer-support] confirm failed', { step: 'owner', reason })
    throw error
  }
  let consumed: {
    confirmation_id: string
    title: string
    description: string | null
    priority: string
    page_path: string | null
    context_attachments: DeveloperSupportStoredAttachment[] | null
    reporter_email: string
    reporter_name: string
  }
  try {
    consumed = await supabaseRestStrict<typeof consumed>('rpc/luxor_elena_consume_developer_support_confirmation', {
      method: 'POST',
      body: JSON.stringify({
        p_id: token.id,
        p_token_hash: token.tokenHash,
        p_member_id: auth.member.id,
        p_session_hash: auth.sessionHash,
        p_session_issued_at_ms: auth.issuedAt,
      }),
    })
  } catch (error) {
    const status = error instanceof SupabaseRestError ? error.status : undefined
    const code = error instanceof SupabaseRestError ? error.code : undefined
    console.error('[developer-support] confirm failed', { step: 'consume_rpc', status, code })
    if (error instanceof SupabaseRestError && /confirmation unavailable/i.test(error.message)) {
      throw new DeveloperSupportConfirmationExpiredError()
    }
    throw error
  }
  if (
    !consumed
    || typeof consumed.confirmation_id !== 'string'
    || typeof consumed.title !== 'string'
    || typeof consumed.reporter_email !== 'string'
  ) {
    console.error('[developer-support] confirm failed', { step: 'result' })
    throw new Error('Confirmation result unavailable.')
  }

  const storedAttachments = Array.isArray(consumed.context_attachments) ? consumed.context_attachments : []
  let attachmentContext: string | null
  let webhookAttachments: DeveloperSupportWebhookAttachment[] = []
  let dispatchAttachments: Array<Record<string, unknown>> = []
  try {
    const attachmentBundle = await buildAttachmentContext(storedAttachments)
    attachmentContext = attachmentBundle.attachmentContext
    webhookAttachments = attachmentBundle.webhookAttachments
    dispatchAttachments = developerSupportAttachmentsForDispatchRecord(attachmentBundle.signed)
    if (dispatchAttachments.length > 0) {
      await supabaseRestStrict('rpc/luxor_elena_update_developer_support_context_attachments', {
        method: 'POST',
        body: JSON.stringify({
          p_id: token.id,
          p_token_hash: token.tokenHash,
          p_member_id: auth.member.id,
          p_context_attachments: dispatchAttachments,
        }),
      })
    }
  } catch (error) {
    console.error('[developer-support] confirm failed', { step: 'attachments' })
    throw error
  }
  const priority = (consumed.priority === 'low' || consumed.priority === 'medium' || consumed.priority === 'high' || consumed.priority === 'urgent')
    ? consumed.priority
    : 'medium'
  const webhookPayload = buildDeveloperSupportWebhookPayload({
    confirmationId: consumed.confirmation_id,
    title: consumed.title,
    description: typeof consumed.description === 'string' ? consumed.description : null,
    priority,
    pagePath: typeof consumed.page_path === 'string' ? consumed.page_path : null,
    reporterEmail: consumed.reporter_email,
    reporterName: typeof consumed.reporter_name === 'string' ? consumed.reporter_name : consumed.reporter_email,
    attachmentContext,
    attachments: webhookAttachments,
  })

  try {
    const dispatch = await triggerLuxorCursorAutomation(webhookPayload)
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
    const message = error instanceof Error ? error.message : 'Cursor automation could not be notified.'
    if (!message.startsWith('Cursor automation') && message !== 'Developer support automation is not configured yet.') {
      console.error('[developer-support] confirm failed', { step: 'dispatch_record' })
    }
    throw new Error(message)
  }
}
