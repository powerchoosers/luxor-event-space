import 'server-only'

import { normalizePhoneNumber } from './luxorCallsServer'
import { supabaseRestStrict } from './supabaseRestServer'

export const ELENA_CALLER_CATEGORIES = [
  'event_inquiry',
  'vendor',
  'job_seeker',
  'partner',
  'solicitor',
  'wrong_number',
  'other_non_event',
] as const

export type ElenaCallerCategory = (typeof ELENA_CALLER_CATEGORIES)[number]

const KNOWN_VENDOR_TYPES = new Set([
  'DJs & Music',
  'Fine Caterers',
  'Florist Services',
  'Security Crew',
  'Service Company',
])

type LiveCall = {
  id: string
  twilio_call_sid: string
  direction: string
  to_number: string
  status: string
  caller_number: string | null
  inquiry_id: string | null
  contact_name: string | null
  notes: string | null
  metadata: Record<string, unknown>
  updated_at: string
}

type CapturePending = {
  nonce: string
  expires_at: string
  full_name: string
  phone: string
  email: string | null
  email_declined: boolean
  best_callback_time: string | null
  purpose: 'transfer' | 'callback' | 'tour'
  caller_category: ElenaCallerCategory
  call_note?: string | null
  vendor_name?: string | null
  vendor_type?: string | null
}

type VendorRow = {
  id: string
  name: string
  vendor_type: string
  email: string | null
  phone: string | null
  contact_person: string | null
  internal_notes: string | null
  updated_at: string
}

export class ElenaNonEventCaptureError extends Error {}

export function parseElenaCallerCategory(value: unknown): ElenaCallerCategory {
  if (typeof value !== 'string' || !ELENA_CALLER_CATEGORIES.includes(value as ElenaCallerCategory)) {
    throw new ElenaNonEventCaptureError('Classify the caller before saving contact details.')
  }
  return value as ElenaCallerCategory
}

export function isEventInquiryCategory(category: ElenaCallerCategory) {
  return category === 'event_inquiry'
}

export function resolveInboundVendorType(input: { vendorType?: string | null; callNote?: string | null; vendorName?: string | null }) {
  const explicit = typeof input.vendorType === 'string' ? input.vendorType.trim() : ''
  if (explicit && KNOWN_VENDOR_TYPES.has(explicit)) return explicit
  const haystack = `${input.vendorName || ''} ${input.callNote || ''}`.toLowerCase()
  if (/\b(security|guard|officer|deputy|police)\b/.test(haystack)) return 'Security Crew'
  return 'Service Company'
}

function sanitizeNote(value: unknown, max: number) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new ElenaNonEventCaptureError('Please clarify the short call note before saving.')
  }
  return value.trim().replace(/\s+/g, ' ')
}

async function readLiveCall(callSid: string) {
  const [row] = await supabaseRestStrict<LiveCall[]>(
    `luxor_calls?select=id,twilio_call_sid,direction,to_number,status,caller_number,inquiry_id,contact_name,notes,metadata,updated_at&twilio_call_sid=eq.${encodeURIComponent(callSid)}&limit=1`,
  )
  return row || null
}

async function findVendor(phone: string, email: string | null) {
  const clauses = [`phone=eq.${encodeURIComponent(phone)}`]
  if (email) clauses.push(`email=eq.${encodeURIComponent(email)}`)
  const matches = await supabaseRestStrict<VendorRow[]>(
    `luxor_vendors?select=id,name,vendor_type,email,phone,contact_person,internal_notes,updated_at&archived_at=is.null&or=(${clauses.join(',')})&order=updated_at.desc&limit=2`,
  )
  if (!matches.length) return null
  const phoneMatch = matches.find((row) => normalizePhoneNumber(row.phone || '') === phone)
  return phoneMatch || matches[0]
}

function categoryLabel(category: ElenaCallerCategory) {
  switch (category) {
    case 'vendor': return 'Vendor'
    case 'job_seeker': return 'Job seeker'
    case 'partner': return 'Partner'
    case 'solicitor': return 'Solicitor'
    case 'wrong_number': return 'Wrong number'
    default: return 'Non-event caller'
  }
}

/** Saves vendor or other non-event callers without creating inquiries or lead events. */
export async function confirmElenaNonEventContactCapture(input: { callSid: string; sessionId: string; nonce: string }) {
  const liveNumber = process.env.LUXOR_ELENA_LIVE_NUMBER || ''
  const call = await readLiveCall(input.callSid)
  const pending = call?.metadata.capture_pending as CapturePending | undefined
  const existing = call?.metadata.inbound_capture as { nonce?: string; confirmed?: boolean } | undefined
  if (!call || call.direction !== 'inbound' || !['ringing', 'in-progress'].includes(call.status) || call.to_number !== liveNumber
    || call.metadata.scope !== 'elena_live_inbound' || call.metadata.ingress_mode !== 'programmable_sip' || call.metadata.rehearsal_only !== false
    || call.metadata.accepted !== true || call.metadata.openai_session_id !== input.sessionId) {
    throw new ElenaNonEventCaptureError('This live voice session is not authorized.')
  }
  if (existing?.confirmed === true && existing.nonce === input.nonce) {
    return { saved: true, duplicate: true, lead_created: false, caller_category: call.metadata.caller_category }
  }
  if (!pending || pending.nonce !== input.nonce) throw new ElenaNonEventCaptureError('Read back the details and obtain a later explicit yes before saving.')
  if (!Number.isFinite(Date.parse(pending.expires_at)) || Date.parse(pending.expires_at) <= Date.now()) {
    throw new ElenaNonEventCaptureError('That readback expired. Prepare contact capture again.')
  }
  if (isEventInquiryCategory(pending.caller_category)) {
    throw new ElenaNonEventCaptureError('Event inquiries must use the standard contact capture path.')
  }

  const phone = normalizePhoneNumber(pending.phone)
  if (!phone || !pending.full_name?.trim()) throw new ElenaNonEventCaptureError('Confirmed contact details are incomplete.')

  const callNote = sanitizeNote(pending.call_note, 1500)
  const category = pending.caller_category
  let vendorId: string | null = null

  if (category === 'vendor') {
    const vendorName = sanitizeNote(pending.vendor_name, 200) || pending.full_name
    const vendorType = resolveInboundVendorType({ vendorType: pending.vendor_type, callNote, vendorName })
    const noteLine = [
      `Elena inbound call (${new Date().toISOString().slice(0, 10)}).`,
      callNote,
      pending.best_callback_time ? `Preferred callback: ${pending.best_callback_time}.` : null,
    ].filter(Boolean).join(' ')
    const existingVendor = await findVendor(phone, pending.email)
    if (existingVendor) {
      const mergedNotes = [existingVendor.internal_notes, noteLine].filter(Boolean).join('\n').slice(0, 2000)
      const [updated] = await supabaseRestStrict<VendorRow[]>(
        `luxor_vendors?id=eq.${encodeURIComponent(existingVendor.id)}&updated_at=eq.${encodeURIComponent(existingVendor.updated_at)}&select=id`,
        { method: 'PATCH', body: JSON.stringify({
          contact_person: existingVendor.contact_person || pending.full_name,
          email: existingVendor.email || pending.email,
          phone: existingVendor.phone || phone,
          internal_notes: mergedNotes || null,
          updated_at: new Date(Math.max(Date.now(), Date.parse(existingVendor.updated_at) + 1)).toISOString(),
        }) },
      )
      if (!updated) throw new ElenaNonEventCaptureError('The vendor record changed. Read the details back again before saving.')
      vendorId = existingVendor.id
    } else {
      const [created] = await supabaseRestStrict<VendorRow[]>('luxor_vendors?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          name: vendorName,
          vendor_type: vendorType,
          contact_person: pending.full_name,
          email: pending.email,
          phone,
          vendor_category: vendorType,
          internal_notes: noteLine || null,
          coi_active: false,
        }),
      })
      if (!created?.id) throw new Error('Vendor capture was not saved.')
      vendorId = created.id
    }
  }

  const captureNote = [
    `Elena inbound ${categoryLabel(category).toLowerCase()} call.`,
    `Caller confirmed: ${pending.full_name}, ${phone}`,
    pending.email ? `, ${pending.email}` : '',
    pending.best_callback_time ? `. Best callback time: ${pending.best_callback_time}` : '',
    callNote ? `. Note: ${callNote}` : '',
  ].join('').replace(/\s+\./g, '.')

  const capture = {
    ...pending,
    confirmed: true,
    saved_at: new Date().toISOString(),
    inquiry_id: null,
    matching_review_needed: false,
  }
  const { capture_pending: _pending, ...restMetadata } = call.metadata
  const nextMetadata = {
    ...restMetadata,
    inbound_capture: capture,
    inbound_capture_note: captureNote,
    caller_category: category,
    ...(vendorId ? { vendor_id: vendorId } : {}),
  }

  const [changed] = await supabaseRestStrict<LiveCall[]>(
    `luxor_calls?twilio_call_sid=eq.${encodeURIComponent(call.twilio_call_sid)}&updated_at=eq.${encodeURIComponent(call.updated_at)}&metadata->>scope=eq.elena_live_inbound&metadata->>openai_session_id=eq.${encodeURIComponent(input.sessionId)}&select=id`,
    { method: 'PATCH', body: JSON.stringify({
      inquiry_id: null,
      contact_name: pending.full_name,
      notes: call.notes?.trim() ? `${call.notes}\n${captureNote}` : captureNote,
      metadata: nextMetadata,
      updated_at: new Date(Math.max(Date.now(), Date.parse(call.updated_at) + 1)).toISOString(),
    }) },
  )
  if (!changed) throw new ElenaNonEventCaptureError('The call changed. Read the details back again before saving.')

  return {
    saved: true,
    lead_created: false,
    caller_category: category,
    vendor_linked: Boolean(vendorId),
    message: category === 'vendor'
      ? 'The vendor contact was saved for the Luxor team. No event lead was created.'
      : 'The caller details were saved on the call record. No event lead was created.',
  }
}
