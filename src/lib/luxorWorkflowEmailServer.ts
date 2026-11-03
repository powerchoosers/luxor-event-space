import 'server-only'

import type { CustomWorkflowDefinition, CustomWorkflowEmailSettings, CustomWorkflowEmailStep } from './luxorCustomWorkflowDefinition'
import { luxorMailFrom, luxorMailSenders } from './luxorMailConfig'
import { getLuxorUserProfile } from './luxorUserProfileServer'
import { getLuxorPortalMember } from './luxorPortalAccess'
import { getPublicLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { LUXOR_BOOKING_EMAIL, LUXOR_VENUE_ADDRESS, LUXOR_WEBSITE } from './luxorVenue'
import { buildConversationalEmailHtml, decodeLuxorEmailTextEntities } from './luxorConversationalEmailServer'
import { renderThemedEmailToHtml } from '@/app/(portal)/portal/marketing/EmailBuilder/emailRenderer'
import { isSafeWorkflowEmailUrl, mapWorkflowEmailBlocks, validateWorkflowEmailDocument } from './luxorWorkflowEmailDocument'
import { EMAIL_TEMPLATES, type LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'
import { normalizeLuxorEmailTheme } from './luxorEmailDesignSystem'
import { supabaseRest } from './supabaseRestServer'

export async function getCustomWorkflowEmailOptions(actorEmail: string) {
  const [operator, phone] = await Promise.all([getLuxorUserProfile(actorEmail), getPublicLuxorPhoneNumber()])
  return { senders: luxorMailSenders(), operator, venue: { address: LUXOR_VENUE_ADDRESS, phone, email: LUXOR_BOOKING_EMAIL } }
}

export async function pinWorkflowEmailSettings(settings: CustomWorkflowEmailSettings | undefined, actorEmail: string): Promise<CustomWorkflowEmailSettings | undefined> {
  if (!settings) return undefined // Existing versions retain their existing business identity.
  const senderEmail = luxorMailFrom(settings.senderEmail)
  return { senderMode: settings.senderMode, senderEmail, ...(settings.senderMode === 'operator' ? { senderActorEmail: actorEmail } : {}) }
}

/** Pin a legacy selected template into the version so later edits cannot alter a live flow. */
export async function hydrateWorkflowEmailTemplates(definition: CustomWorkflowDefinition) {
  for (const step of definition.steps) {
    if (step.type !== 'email' || !step.templateId || step.emailDocument || step.emailStyle === 'personal') continue
    const builtin = EMAIL_TEMPLATES.find((template) => template.id === step.templateId)
    let document: LuxorEmailDocument | undefined
    if (builtin) document = { schemaVersion: 2, subject: builtin.subject || step.subject, preheader: builtin.preheader || step.previewText, theme: normalizeLuxorEmailTheme(builtin.theme), blocks: structuredClone(builtin.blocks) }
    else if (/^[0-9a-f-]{36}$/i.test(step.templateId)) {
      const [saved] = await supabaseRest<Array<{ subject: string | null; blocks: LuxorEmailDocument['blocks']; metadata: Record<string, unknown> }>>(`luxor_marketing_templates?select=subject,blocks,metadata&id=eq.${encodeURIComponent(step.templateId)}&limit=1`)
      if (saved) document = { schemaVersion: 2, subject: saved.subject || step.subject, preheader: typeof saved.metadata?.preheader === 'string' ? saved.metadata.preheader : step.previewText, theme: normalizeLuxorEmailTheme(saved.metadata?.theme), blocks: saved.blocks }
    }
    if (!document) throw new Error('The selected email template could not be found. Choose a template again before saving or activating.')
    const error = validateWorkflowEmailDocument(document)
    if (error) throw new Error(`The selected email template needs revision: ${error}`)
    step.emailStyle = 'template'
    step.emailDocument = document
  }
  return definition
}

export async function resolveWorkflowEmailSender(settings?: CustomWorkflowEmailSettings, previewActorEmail?: string) {
  const email = luxorMailFrom(settings?.senderEmail)
  if (settings?.senderMode === 'elena') return { displayName: 'Elena', roleTitle: 'Luxor Concierge', email, avatarUrl: null }
  const actorEmail = settings?.senderActorEmail || previewActorEmail
  if (settings?.senderMode === 'operator') {
    if (!actorEmail) throw new Error('This workflow needs a saved sender identity. Save the draft again before activation.')
    const member = await getLuxorPortalMember(actorEmail)
    if (!member || member.status !== 'active') throw new Error('The workflow sender is no longer an active portal member.')
    return { ...await getLuxorUserProfile(actorEmail), email }
  }
  return { displayName: 'Luxor Event Space', roleTitle: 'Venue Team', email, avatarUrl: null }
}

export function escapeWorkflowEmailHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function safeWorkflowRichText(value: string, merge: (value: string) => string) {
  const safe = value.replace(/<(script|style|iframe|object|svg|math|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  return safe.split(/(<[^>]*>)/g).map((part) => {
    if (!part.startsWith('<')) return escapeWorkflowEmailHtml(merge(decodeLuxorEmailTextEntities(part)))
    const match = /^<(\/?)\s*(p|div|br|strong|b|em|i|u|ul|ol|li|a)\b([^>]*)>$/i.exec(part)
    if (!match) return ''
    const tag = match[2].toLowerCase()
    if (match[1]) return tag === 'br' ? '' : `</${tag}>`
    if (tag !== 'a') return `<${tag}>`
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[3])
    const url = merge(decodeLuxorEmailTextEntities(href?.[1] || href?.[2] || href?.[3] || ''))
    return url && isSafeWorkflowEmailUrl(url) ? `<a href="${escapeWorkflowEmailHtml(new URL(url, LUXOR_WEBSITE).toString())}">` : '<a>'
  }).join('')
}

export function mergeWorkflowFields(value: string, inquiry: Record<string, unknown>, venue: { phone?: string | null; email?: string; address?: string } = {}) {
  const fullName = typeof inquiry.full_name === 'string' ? inquiry.full_name.trim() : 'Guest'
  const fields: Record<string, string> = {
    first_name: fullName.split(/\s+/)[0] || 'there', full_name: fullName || 'Guest',
    event_type: String(inquiry.event_type || 'celebration'), guest_count: String(inquiry.guest_count ?? 'To be determined'),
    target_date: String(inquiry.target_date || 'To be determined'),
    tour_date: String(inquiry.tour_date || inquiry.preferred_tour_date || 'To be confirmed'),
    tour_time: String(inquiry.tour_time || inquiry.preferred_tour_time || 'To be confirmed'),
    venue_phone: venue.phone || 'Reply to this email', venue_email: venue.email || LUXOR_BOOKING_EMAIL,
    venue_address: venue.address || LUXOR_VENUE_ADDRESS,
  }
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in fields)) throw new Error(`Unsupported workflow merge field: ${key}`)
    return fields[key]
  })
}

export async function renderCustomWorkflowEmail(step: CustomWorkflowEmailStep, inquiry: Record<string, unknown>, unsubscribeUrl: string, settings?: CustomWorkflowEmailSettings, previewActorEmail?: string) {
  const [sender, phone] = await Promise.all([resolveWorkflowEmailSender(settings, previewActorEmail), getPublicLuxorPhoneNumber()])
  const merge = (value: string) => mergeWorkflowFields(value, inquiry, { phone })
  const subject = merge(step.subject).trim()
  const previewText = merge(step.previewText).trim()
  if (!subject || subject.length > 500 || /[\r\n]/.test(subject)) throw new Error('The generated email needs a valid one-line subject.')
  let body: string
  if (step.emailStyle === 'template') {
    const error = validateWorkflowEmailDocument(step.emailDocument)
    if (error || !step.emailDocument) throw new Error(error || 'Choose a saved template before sending.')
    const doc = step.emailDocument
    const blocks = mapWorkflowEmailBlocks(doc.blocks, (value, field) => {
      if (field === 'unsubscribeUrl') return unsubscribeUrl
      if (field === 'content') return safeWorkflowRichText(value, merge)
      const merged = merge(value)
      if (['backgroundImage', 'imageUrl', 'ctaUrl', 'url', 'instagramUrl', 'facebookUrl', 'tiktokUrl', 'website'].includes(field)) {
        if (!isSafeWorkflowEmailUrl(merged)) throw new Error('A personalized email image or link is invalid.')
        const absolute = merged && !/^https?:\/\//i.test(merged) ? (/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(merged) ? `https://${merged}` : `${LUXOR_WEBSITE}/${merged.replace(/^\//, '')}`) : merged
        return escapeWorkflowEmailHtml(absolute)
      }
      return escapeWorkflowEmailHtml(merged)
    })
    if (!blocks.some((block) => block.type === 'footer')) blocks.push({ id: 'workflow-unsubscribe', type: 'footer', companyName: 'Luxor Event Space', address: LUXOR_VENUE_ADDRESS, phone: phone || '', website: LUXOR_WEBSITE, unsubscribeUrl, showSocial: false, instagramUrl: '', facebookUrl: '' })
    body = renderThemedEmailToHtml(escapeWorkflowEmailHtml(subject), blocks, doc.theme, escapeWorkflowEmailHtml(previewText))
  } else {
    const text = merge(step.body)
    if (step.ctaUrl && !isSafeWorkflowEmailUrl(step.ctaUrl)) throw new Error('The email action URL is invalid.')
    const cta = step.ctaText && step.ctaUrl ? `<p><a href="${escapeWorkflowEmailHtml(new URL(step.ctaUrl, LUXOR_WEBSITE).toString())}">${escapeWorkflowEmailHtml(merge(step.ctaText))}</a></p>` : ''
    const bodyHtml = text.split(/\n\n+/).map((p) => `<p style="margin:0 0 17px">${escapeWorkflowEmailHtml(p).replace(/\n/g, '<br />')}</p>`).join('')
      + cta + `<p style="margin:24px 0 0;font-size:12px;color:#756b60"><a href="${escapeWorkflowEmailHtml(unsubscribeUrl)}" style="color:#756b60">Unsubscribe from these emails</a></p>`
    body = buildConversationalEmailHtml({ to: String(inquiry.email || ''), subject, body: text, bodyHtml, senderName: sender.displayName, senderRole: sender.roleTitle, senderEmail: sender.email, senderPhone: phone, senderImageUrl: sender.avatarUrl })
  }
  if (body.length > 100000) throw new Error('This email exceeds the workflow delivery size limit. Remove a few blocks or shorten the copy.')
  return { subject, previewText, body, sender }
}
