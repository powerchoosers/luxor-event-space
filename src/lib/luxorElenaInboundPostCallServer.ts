import 'server-only'

import { createHash } from 'node:crypto'
import { getLuxorCallBySid, getLuxorTranscriptSegments, normalizePhoneNumber } from './luxorCallsServer'
import { luxorElenaLiveInboundTranscriptUsesSipBridge, luxorTranscriptSpeaker, type LuxorCall } from './luxorCallTypes'
import { supabaseRestStrict } from './supabaseRestServer'
import { resolveElenaCallerEventType } from './luxorElenaCallerEventType'
import { queueBrochureDelivery } from './luxorBrochureDeliveryQueue'
import type { LuxorInquiry } from './luxorInquiryTypes'
import { ELENA_LIVE_SCOPE } from './luxorElenaInboundServer'
import type { ElenaCallerCategory } from './luxorElenaInboundNonEventServer'

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/
const GUEST_COUNT = /\b(?:about\s+|approximately\s+|around\s+)?(\d{2,3})\s+guests?\b/i
const PACKAGE_PROMISE = /\b(?:email|send).{0,40}\b(?:package|brochure|pricing|information|details)\b/i
const NAME =
  /\b(?:caller(?:'s)?\s+name|name(?:\s+is)?|identified as)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)*)\b/i
const CALLER_NAME = /\bCaller\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)*)\b/
const ACTION_NAME = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)*)\s+(?:called|is planning|planned|requested|returned|is returning)\b/

export type ElenaInboundPostCallExtract = {
  full_name: string | null
  phone: string | null
  email: string | null
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  call_note: string | null
  caller_category: ElenaCallerCategory | null
  purpose: 'transfer' | 'callback' | 'tour' | null
  package_email_promised: boolean
  source: 'summary' | 'transcript' | 'llm'
}

export function isElenaInboundPostCallNonEvent(extract: ElenaInboundPostCallExtract) {
  return Boolean(extract.caller_category && extract.caller_category !== 'event_inquiry')
}

export function postCallExtractIsSufficient(extract: ElenaInboundPostCallExtract) {
  if (!extract.full_name || !extract.phone) return false
  if (isElenaInboundPostCallNonEvent(extract)) return Boolean(extract.call_note?.trim())
  const hasEvent = extract.event_type || extract.target_date || extract.guest_count
  if (!hasEvent) return false
  return Boolean(extract.email || extract.event_type)
}

function inferCallerCategory(text: string, eventType: string | null): ElenaCallerCategory | null {
  const lower = text.toLowerCase()
  if (eventType) return 'event_inquiry'
  if (/\b(wrong number|misdial|wrong line)\b/.test(lower)) return 'wrong_number'
  if (/\b(vendor|supplier|security company|dj service|caterer|florist)\b/.test(lower)) return 'vendor'
  if (/\b(job|hiring|employment|resume)\b/.test(lower)) return 'job_seeker'
  if (/\b(partner|partnership|collaborat)\b/.test(lower)) return 'partner'
  if (/\b(solicitor|soliciting|marketing call)\b/.test(lower)) return 'solicitor'
  if (/\b(callback|returning.{0,40}call|message for arianna|line of credit|bank|loan|personal)\b/.test(lower)) return 'other_non_event'
  return null
}

function inferCallNote(text: string, eventType: string | null) {
  if (eventType) return null
  const returnedCall = text.match(/\breturn(?:ing|ed).{0,40}call about\s+([^.!\n]{8,240})/i)
  if (returnedCall?.[1]) return returnedCall[1].trim().slice(0, 1500)
  const topic = text.match(/\b(?:regarding|about|re:|message about|regarding a)\s+([^.!\n]{8,240})/i)
  if (topic?.[1]) return topic[1].trim().slice(0, 1500)
  const callback = text.match(/\b(?:callback request|left a message|wants arianna|returning).{0,200}/i)
  return callback?.[0]?.trim().slice(0, 1500) || null
}

export function parseElenaInboundPostCallExtract(text: string, defaultPhone: string | null = null): ElenaInboundPostCallExtract | null {
  const source = text.trim()
  if (!source) return null
  const emailMatch = source.match(EMAIL)
  const dateMatch = source.match(ISO_DATE)
  const guestMatch = source.match(GUEST_COUNT)
  const eventType = resolveElenaCallerEventType(source, source)
  const nameMatch = source.match(NAME) || source.match(CALLER_NAME) || source.match(ACTION_NAME)
  const phone = defaultPhone && defaultPhone !== 'anonymous' ? normalizePhoneNumber(defaultPhone) : null
  const callerCategory = inferCallerCategory(source, eventType)
  const callNote = inferCallNote(source, eventType)
  const extract: ElenaInboundPostCallExtract = {
    full_name: nameMatch?.[1]?.trim().slice(0, 120) || null,
    phone,
    email: emailMatch?.[0]?.toLowerCase() || null,
    event_type: eventType,
    target_date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null,
    guest_count: guestMatch ? Number(guestMatch[1]) : null,
    call_note: callNote,
    caller_category: callerCategory,
    purpose: callerCategory && callerCategory !== 'event_inquiry' ? 'callback' : null,
    package_email_promised: PACKAGE_PROMISE.test(source),
    source: 'summary',
  }
  return postCallExtractIsSufficient(extract) ? extract : null
}

async function buildTranscriptText(call: LuxorCall) {
  const segments = await getLuxorTranscriptSegments(call.id)
  if (!segments.length) return ''
  return segments
    .map((segment) => {
      const sipBridge = luxorElenaLiveInboundTranscriptUsesSipBridge(call.metadata)
      const speaker = luxorTranscriptSpeaker(segment.track, { elenaSipBridge: sipBridge })
      return `${speaker === 'caller' ? 'Caller' : 'Luxor'}: ${segment.segment_text}`
    })
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
                call_note: { type: ['string', 'null'] },
                caller_category: {
                  type: ['string', 'null'],
                  enum: ['event_inquiry', 'vendor', 'job_seeker', 'partner', 'solicitor', 'wrong_number', 'other_non_event', null],
                },
                purpose: { type: ['string', 'null'], enum: ['transfer', 'callback', 'tour', null] },
                package_email_promised: { type: 'boolean' },
              },
              required: ['full_name', 'phone', 'email', 'event_type', 'target_date', 'guest_count', 'call_note', 'caller_category', 'purpose', 'package_email_promised'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: 'Extract caller-confirmed facts from a Luxor inbound Elena phone call. Return null when unsure. Use Quinceañera spelling when appropriate. For vendors, job seekers, personal or business callbacks, and other non-event callers, set caller_category accordingly, set call_note to the message or reason, and leave event fields null. First names alone are valid when that is what the caller gave. package_email_promised is true only when Elena clearly committed to emailing package, brochure, or pricing details.',
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
  if (call.inquiry_id) return false
  const receipt = call.metadata?.lead_update_receipt as { saved_at?: string } | undefined
  const capture = call.metadata?.inbound_capture as { confirmed?: boolean; caller_category?: ElenaCallerCategory } | undefined
  const category = (typeof call.metadata?.caller_category === 'string' ? call.metadata.caller_category : capture?.caller_category) as ElenaCallerCategory | undefined
  if (capture?.confirmed === true) {
    if (category && category !== 'event_inquiry') return false
    if (receipt?.saved_at) return false
  }
  return !capture?.confirmed || !receipt?.saved_at
}

async function hasBrochureJob(inquiryId: string) {
  const rows = await supabaseRestStrict<Array<{ id: string }>>(
    `luxor_email_jobs?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&job_type=eq.booking_package&metadata->>flow_stage=eq.brochure_delivery&limit=1`,
  )
  return rows.length > 0
}

export async function reconcileElenaInboundAfterSummary(callSid: string) {
  const call = await getLuxorCallBySid(callSid)
  if (!call) return { status: 'skipped' as const, reason: 'call_not_found' }
  if (call.inquiry_id) return { status: 'skipped' as const, reason: 'inquiry_linked' }
  if (!needsReconcile(call)) return { status: 'skipped' as const, reason: 'already_persisted' }
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
  if (!postCallExtractIsSufficient(extract || { full_name: null, phone: null, email: null, event_type: null, target_date: null, guest_count: null, call_note: null, caller_category: null, purpose: null, package_email_promised: false, source: 'summary' })) {
    const transcript = await buildTranscriptText(call)
    const llm = await extractWithLlm([call.summary_text, transcript].filter(Boolean).join('\n\n'))
    if (llm) extract = extract ? { ...extract, ...llm, full_name: extract.full_name || llm.full_name, call_note: extract.call_note || llm.call_note } : llm
  }
  if (!extract || !postCallExtractIsSufficient(extract)) {
    console.warn('[Elena Inbound] Post-call reconcile skipped: insufficient extracted fields', {
      callSid,
      fingerprint: createHash('sha256').update(call.summary_text).digest('hex').slice(0, 12),
    })
    return { status: 'skipped' as const, reason: 'insufficient_fields' }
  }

  try {
    const result = await supabaseRestStrict<{ saved: boolean; duplicate?: boolean; non_event?: boolean; inquiry_id?: string | null }>(
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
            call_note: extract.call_note,
            caller_category: extract.caller_category,
            purpose: extract.purpose,
            package_email_promised: extract.package_email_promised,
            source: extract.source,
          },
        }),
      },
    )
    if (!result.saved) {
      console.error('[Elena Inbound] Post-call reconcile RPC returned without save', { callSid, result })
      return { status: 'failed' as const, reason: 'rpc_not_saved' }
    }
    const nonEvent = isElenaInboundPostCallNonEvent(extract) || result.non_event === true
    if (!nonEvent && !result.inquiry_id) {
      console.error('[Elena Inbound] Post-call reconcile RPC returned without inquiry', { callSid, result })
      return { status: 'failed' as const, reason: 'rpc_not_saved' }
    }
    if (extract.package_email_promised && extract.email && result.inquiry_id) {
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
    console.info('[Elena Inbound] Post-call reconcile saved call details', {
      callSid,
      inquiryId: result.inquiry_id || null,
      nonEvent,
      packageEmailPromised: extract.package_email_promised,
      source: extract.source,
    })
    return { status: 'completed' as const, inquiryId: result.inquiry_id || undefined, nonEvent }
  } catch (error) {
    console.error('[Elena Inbound] Post-call reconcile failed', {
      callSid,
      error: error instanceof Error ? error.message : error,
    })
    return { status: 'failed' as const }
  }
}