import 'server-only'

import { createHash } from 'node:crypto'
import { getLuxorCallBySid, getLuxorTranscriptSegments, normalizePhoneNumber } from './luxorCallsServer'
import { luxorTranscriptSpeaker, type LuxorCall } from './luxorCallTypes'
import { supabaseRestStrict } from './supabaseRestServer'
import { resolveElenaCallerEventType } from './luxorElenaCallerEventType'
import { queueBrochureDelivery } from './luxorBrochureDeliveryQueue'
import type { LuxorInquiry } from './luxorInquiryTypes'
import { ELENA_LIVE_SCOPE } from './luxorElenaInboundServer'

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/
const GUEST_COUNT = /\b(?:about\s+|approximately\s+|around\s+)?(\d{2,3})\s+guests?\b/i
const PACKAGE_PROMISE = /\b(?:email|send).{0,40}\b(?:package|brochure|pricing|information|details)\b/i

export type ElenaInboundPostCallExtract = {
  full_name: string | null
  phone: string | null
  email: string | null
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  package_email_promised: boolean
  source: 'summary' | 'transcript' | 'llm'
}

export function parseElenaInboundPostCallExtract(text: string, defaultPhone: string | null = null): ElenaInboundPostCallExtract | null {
  const source = text.trim()
  if (!source) return null
  const emailMatch = source.match(EMAIL)
  const dateMatch = source.match(ISO_DATE)
  const guestMatch = source.match(GUEST_COUNT)
  const eventType = resolveElenaCallerEventType(source, source)
  const nameMatch = source.match(/\b(?:caller(?:'s)?\s+name|name(?:\s+is)?)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)/i)
    || source.match(/\bCaller\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)\b/)
    || source.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)\s+(?:called|is planning|planned|requested)\b/)
  const phone = defaultPhone && defaultPhone !== 'anonymous' ? normalizePhoneNumber(defaultPhone) : null
  const extract: ElenaInboundPostCallExtract = {
    full_name: nameMatch?.[1]?.trim().slice(0, 120) || null,
    phone,
    email: emailMatch?.[0]?.toLowerCase() || null,
    event_type: eventType,
    target_date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null,
    guest_count: guestMatch ? Number(guestMatch[1]) : null,
    package_email_promised: PACKAGE_PROMISE.test(source),
    source: 'summary',
  }
  const hasEvent = extract.event_type || extract.target_date || extract.guest_count
  if (!extract.full_name || !extract.phone || !hasEvent) return null
  if (!extract.email && !extract.event_type) return null
  return extract
}

async function buildTranscriptText(call: LuxorCall) {
  const segments = await getLuxorTranscriptSegments(call.id)
  if (!segments.length) return ''
  return segments
    .map((segment) => `${luxorTranscriptSpeaker(segment.track) === 'caller' ? 'Caller' : 'Luxor'}: ${segment.segment_text}`)
    .join('\n')
    .slice(0, 40_000)
}

async function extractWithLlm(content: string): Promise<ElenaInboundPostCallExtract | null> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey || !content.trim()) return null
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
        'X-Title': 'Luxor Elena Inbound Reconcile',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'elena_inbound_capture',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                full_name: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
                email: { type: ['string', 'null'] },
                event_type: { type: ['string', 'null'] },
                target_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when known' },
                guest_count: { type: ['integer', 'null'] },
                package_email_promised: { type: 'boolean' },
              },
              required: ['full_name', 'phone', 'email', 'event_type', 'target_date', 'guest_count', 'package_email_promised'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: 'Extract only caller-confirmed facts from a Luxor inbound Elena phone call. Return null fields when unsure. Use Quinceañera spelling when appropriate. package_email_promised is true only when Elena clearly committed to emailing package, brochure, or pricing details.',
          },
          { role: 'user', content: content.slice(0, 50_000) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = payload.choices?.[0]?.message?.content
    if (!raw) return null
    const parsed = JSON.parse(raw) as ElenaInboundPostCallExtract
    return { ...parsed, source: 'llm' }
  } catch (error) {
    console.error('[Elena Inbound] Post-call LLM extraction failed:', error instanceof Error ? error.message : error)
    return null
  }
}

function needsReconcile(call: LuxorCall) {
  if (call.metadata?.scope !== ELENA_LIVE_SCOPE || call.metadata?.accepted !== true) return false
  const receipt = call.metadata?.lead_update_receipt as { saved_at?: string } | undefined
  const capture = call.metadata?.inbound_capture as { confirmed?: boolean } | undefined
  if (capture?.confirmed === true && receipt?.saved_at && call.inquiry_id) return false
  return !call.inquiry_id || capture?.confirmed !== true || !receipt?.saved_at
}

async function hasBrochureJob(inquiryId: string) {
  const rows = await supabaseRestStrict<Array<{ id: string }>>(
    `luxor_email_jobs?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&job_type=eq.booking_package&metadata->>flow_stage=eq.brochure_delivery&limit=1`,
  )
  return rows.length > 0
}

export async function reconcileElenaInboundAfterSummary(callSid: string) {
  const call = await getLuxorCallBySid(callSid)
  if (!call || !needsReconcile(call)) return { status: 'skipped' as const, reason: 'already_persisted' }
  if (call.metadata?.post_call_reconcile) return { status: 'skipped' as const, reason: 'duplicate' }
  if (call.summary_status !== 'completed' || !call.summary_text?.trim()) {
    return { status: 'skipped' as const, reason: 'summary_not_ready' }
  }

  const callerPhone = typeof call.caller_number === 'string' && call.caller_number !== 'anonymous'
    ? call.caller_number
    : null
  let extract = parseElenaInboundPostCallExtract(call.summary_text, callerPhone)
  if (!extract?.email) {
    const transcript = await buildTranscriptText(call)
    const fromTranscript = parseElenaInboundPostCallExtract(`${call.summary_text}\n${transcript}`, callerPhone)
    if (fromTranscript) {
      extract = extract ? { ...extract, ...fromTranscript, email: extract.email || fromTranscript.email, full_name: extract.full_name || fromTranscript.full_name, source: 'transcript' } : fromTranscript
    }
  }
  if (!extract?.full_name || !extract.phone || !extract.email) {
    const transcript = await buildTranscriptText(call)
    const llm = await extractWithLlm([call.summary_text, transcript].filter(Boolean).join('\n\n'))
    if (llm) extract = extract ? { ...extract, ...llm } : llm
  }
  if (!extract?.full_name || !extract.phone || (!extract.email && !extract.event_type)) {
    console.warn('[Elena Inbound] Post-call reconcile skipped: insufficient extracted fields', {
      callSid,
      fingerprint: createHash('sha256').update(call.summary_text).digest('hex').slice(0, 12),
    })
    return { status: 'skipped' as const, reason: 'insufficient_fields' }
  }

  try {
    const result = await supabaseRestStrict<{ saved: boolean; duplicate?: boolean; inquiry_id?: string }>(
      'rpc/luxor_reconcile_elena_inbound_after_call',
      {
        method: 'POST',
        body: JSON.stringify({
          p_call_sid: callSid,
          p_fields: {
            full_name: extract.full_name,
            phone: extract.phone,
            email: extract.email,
            event_type: extract.event_type,
            target_date: extract.target_date,
            guest_count: extract.guest_count,
            package_email_promised: extract.package_email_promised,
            source: extract.source,
          },
        }),
      },
    )
    if (!result.saved || !result.inquiry_id) {
      console.error('[Elena Inbound] Post-call reconcile RPC returned without inquiry', { callSid, result })
      return { status: 'failed' as const, reason: 'rpc_not_saved' }
    }
    if (extract.package_email_promised && extract.email) {
      const inquiryQueued = await hasBrochureJob(result.inquiry_id)
      if (!inquiryQueued) {
        const [inquiry] = await supabaseRestStrict<LuxorInquiry[]>(
          `luxor_inquiries?select=*&id=eq.${encodeURIComponent(result.inquiry_id)}&limit=1`,
        )
        if (inquiry?.email) {
          const job = await queueBrochureDelivery({ ...inquiry, source: inquiry.source || 'inbound_phone' })
          console.info('[Elena Inbound] Post-call brochure job queued', { callSid, inquiryId: inquiry.id, jobId: job.id })
        }
      }
    }
    console.info('[Elena Inbound] Post-call reconcile saved inquiry details', {
      callSid,
      inquiryId: result.inquiry_id,
      packageEmailPromised: extract.package_email_promised,
      source: extract.source,
    })
    return { status: 'completed' as const, inquiryId: result.inquiry_id }
  } catch (error) {
    console.error('[Elena Inbound] Post-call reconcile failed', {
      callSid,
      error: error instanceof Error ? error.message : error,
    })
    return { status: 'failed' as const }
  }
}