import 'server-only'

import type { CustomWorkflowEmailStep, CustomWorkflowTextStep } from './luxorCustomWorkflowDefinition'
import { composeCustomWorkflowText, validateCustomWorkflowDefinition } from './luxorCustomWorkflowDefinition'
import { normalizeLuxorEmailTheme } from './luxorEmailDesignSystem'
import { getLuxorAiVenueContext } from './luxorAiContextServer'
import { LUXOR_WEBSITE } from './luxorVenue'
import { LUXOR_UNSLOP_COPY_RULES } from './luxorUnslop'
import type { LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'

type WorkflowMessageStep = CustomWorkflowEmailStep | CustomWorkflowTextStep
type SenderContext = { displayName: string; email?: string; roleTitle?: string }

/** AI may move and reuse supplied assets, but must never invent an image URL. */
export function validateGeneratedWorkflowImages(document: LuxorEmailDocument, sources: LuxorEmailDocument[]) {
  const imageKey = (value: string) => new URL(value, LUXOR_WEBSITE).toString()
  const allowed = new Set(sources.flatMap((source) => source.blocks.flatMap((block) =>
    block.type === 'hero' && block.backgroundImage ? [imageKey(block.backgroundImage)]
      : block.type === 'image_text' && block.imageUrl ? [imageKey(block.imageUrl)] : [])))
  for (const block of document.blocks) {
    const image = block.type === 'hero' ? block.backgroundImage : block.type === 'image_text' ? block.imageUrl : ''
    if (image && !allowed.has(imageKey(image))) throw new Error('Elena introduced an image outside the selected design. Choose the image in the template editor, then try again.')
  }
}

function removeGeneratedSignoff(body: string, sender?: SenderContext) {
  const lines = body.trim().split(/\r?\n/)
  const normalizedName = sender?.displayName.trim().toLowerCase()
  for (let index = Math.max(0, lines.length - 7); index < lines.length; index += 1) {
    if (!/^(?:warmly|warm regards|best(?: regards| wishes)?|kind regards|sincerely|thank you|thanks|regards|with appreciation|cheers)[,!]?$/i.test(lines[index].trim())) continue
    const signature = lines.slice(index + 1).map((line) => line.trim().toLowerCase()).filter(Boolean)
    if (signature.length && normalizedName && signature.some((line) => line === normalizedName || line === normalizedName.split(/\s+/)[0])) return lines.slice(0, index).join('\n').trim()
  }
  return body.trim()
}

export const WORKFLOW_EMAIL_BLOCK_GUIDANCE = `An emailDocument is a version 2 object with subject, preheader, theme (retain the supplied theme), and blocks in display order. You may rewrite all copy, add/remove/move blocks, and change placement. Preserve useful brand images unless asked to remove them. Use only these structured blocks, with unique id strings:
hero: {id,type:"hero",headline,subheadline,backgroundImage,overlayOpacity:0.55,textAlign:"center",ctaLabel,ctaUrl,ctaVisible:true}
text: {id,type:"text",content,fontSize:15,textAlign:"left",color:"#201b16"} (use the supplied theme text color)
image_text: {id,type:"image_text",imageUrl,imageAlt,imagePosition:"left",headline,body,ctaLabel,ctaUrl}
button: {id,type:"button",label,url,align:"center",bgColor:"#b88732",textColor:"#fffdf9"}
two_column: {id,type:"two_column",leftHeadline,leftBody,rightHeadline,rightBody}
divider: {id,type:"divider",color:"#dfd3c0",thickness:1,style:"solid"}
spacer: {id,type:"spacer",height:24}
footer: {id,type:"footer",companyName,address,phone,website,unsubscribeUrl,showSocial,instagramUrl,facebookUrl,tiktokUrl?}. You may revise its wording and placement when requested. Keep approved Luxor identification and current venue facts; never invent contact details or remove the unsubscribe option. The server supplies the working unsubscribe link.
Never emit raw HTML, scripts, CSS, forms or external tracking. Text copy is plain text with paragraph breaks. Image URLs must exactly reuse a supplied template image URL or be empty; never invent a file path, stock image URL or placeholder. You may move, remove, or reuse those image elements and change their placement. CTA links must be canonical https://www.luxoratlaspalmas.com pages; use /tour, /gallery, /pricing, /visit, /events or /spaces. Do not invent proposal/payment links. No fake placeholders or unsupported merge fields.`

export async function generateWorkflowMessage(
  step: WorkflowMessageStep,
  inquiryContext: Record<string, unknown>,
  senderContext?: SenderContext,
  options: { preview?: boolean } = {},
): Promise<{ step: WorkflowMessageStep; source: 'ai' }> {
  const prompt = step.aiPrompt?.trim()
  if (!prompt || prompt.length > 6000) throw new Error('Enter message instructions of 1 to 6000 characters.')
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) throw new Error('Elena message generation is unavailable. No generic message was substituted.')
  const venueContext = await getLuxorAiVenueContext()
  const template = step.type === 'email' && step.emailStyle === 'template'
  const resultShape = step.type === 'text'
    ? '{"body":"The SMS copy"}'
    : template
      ? '{"subject":"Subject", "previewText":"Preview", "body":"Plain text summary", "emailDocument":{"schemaVersion":2,"subject":"Subject","preheader":"Preview","theme":{},"blocks":[]}}'
      : '{"subject":"Subject", "previewText":"Preview", "body":"Plain text email with paragraphs", "ctaText":"Optional label or empty", "ctaUrl":"Canonical Luxor URL or empty"}'
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.luxoratlaspalmas.com', 'X-Title': 'Luxor Elena Workflow Message',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash', temperature: 0.3, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `You are Elena writing a concise, warm, useful Luxor workflow message.\n${venueContext}\nSender identity: ${JSON.stringify(senderContext || { displayName: 'Luxor Event Space Team' })}. Do not impersonate another staff member. Do not add a signature; the renderer adds the selected sender signature. Ask for one useful next step only when it is actually useful. Internal notes are private staff background: never quote or expose them, staff opinions, or internal operations. Use only client-appropriate planning facts. Review recent sent emails to avoid repeating the same ask without a new reason. Review recent client email and text replies before writing: use the latest answers and requests, and never ask for information the client already supplied. If recent_client_email_scope says the address is shared or unlinked, email reply history was deliberately not loaded; do not claim the client has not replied or invent missing conversation details.\n${LUXOR_UNSLOP_COPY_RULES}\n${options.preview ? 'This is an editable sample, not a sent message. Preserve supported workflow merge fields where no client value is supplied.' : 'Write this message afresh for this specific client from their supplied record and the owner prompt. Use concrete supplied facts, omit missing details, and emit no merge fields.'}\n${step.type === 'text' ? 'Return SMS with Luxor Events identification and Reply STOP to opt out. Maximum 480 characters including those required elements.' : `Return subject (max 180 characters), previewText (max 200) and a body (max 12000). ${template ? WORKFLOW_EMAIL_BLOCK_GUIDANCE : 'Keep body plain text; the sender uses the same lightly styled email design as the compose modal. Buttons are optional; only return a CTA label and URL together.'}`}\nReturn ONLY JSON matching ${resultShape}` },
        { role: 'user', content: JSON.stringify({ prompt, client: inquiryContext, currentStep: step }) },
      ],
    }),
    signal: AbortSignal.timeout(22_000),
  })
  if (!response.ok) throw new Error(`Elena message generation is temporarily unavailable (${response.status}). No message was queued.`)
  const completion = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = completion.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Elena returned an empty message. No message was queued.')
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { throw new Error('Elena returned an invalid message. Please try again.') }
  let generated: WorkflowMessageStep
  if (step.type === 'text') {
    if (typeof parsed.body !== 'string') throw new Error('Elena returned invalid SMS copy.')
    generated = { ...step, body: composeCustomWorkflowText(parsed.body) }
  } else {
    if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') throw new Error('Elena returned invalid email copy.')
    generated = { ...step, subject: parsed.subject.trim(), body: template ? parsed.body : removeGeneratedSignoff(parsed.body, senderContext), previewText: typeof parsed.previewText === 'string' ? parsed.previewText : '' }
    if (template) {
      const doc = parsed.emailDocument
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('Elena returned no editable template document.')
      const candidate = doc as Record<string, unknown>
      generated.emailDocument = {
        schemaVersion: 2, subject: generated.subject, preheader: generated.previewText,
        theme: normalizeLuxorEmailTheme(step.emailDocument?.theme || candidate.theme),
        blocks: Array.isArray(candidate.blocks) ? candidate.blocks : [],
      } as NonNullable<CustomWorkflowEmailStep['emailDocument']>
      validateGeneratedWorkflowImages(generated.emailDocument, step.emailDocument ? [step.emailDocument] : [])
    } else {
      generated.ctaText = typeof parsed.ctaText === 'string' ? parsed.ctaText : ''
      generated.ctaUrl = typeof parsed.ctaUrl === 'string' ? parsed.ctaUrl : ''
    }
  }
  // Validate the generated copy as fixed content; generation flags must not bypass validation.
  const fixedStep = { ...generated, generationMode: 'manual' as const }
  const issues = validateCustomWorkflowDefinition({ schemaVersion: 1, trigger: 'manual', steps: [fixedStep, { id: 'ai-validation-end', type: 'end', name: 'End' }] })
  if (issues.length) throw new Error(`Elena's draft needs revision: ${issues.slice(0, 2).map((issue) => issue.message).join(' ')}`)
  if (!options.preview && /\{\{|\}\}/.test(JSON.stringify(generated.type === 'email' ? [generated.subject, generated.body, generated.emailDocument] : generated.body))) {
    throw new Error('Elena left unresolved client fields. No message was queued.')
  }
  return { step: generated, source: 'ai' }
}
