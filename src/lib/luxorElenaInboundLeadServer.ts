import 'server-only'
import { randomUUID } from 'node:crypto'
import { normalizePhoneNumber } from './luxorCallsServer'
import { supabaseRestStrict } from './supabaseRestServer'

type Call = { twilio_call_sid: string; direction: string; to_number: string; status: string; inquiry_id: string | null; metadata: Record<string, unknown>; updated_at: string }
type Inquiry = { id: string; full_name: string; phone: string | null; email: string | null; updated_at: string; archived_at: string | null; is_test: boolean }
type Contact = { confirmed?: boolean; nonce?: string; inquiry_id?: string; matching_review_needed?: boolean; full_name?: string; phone?: string; email?: string | null }
export class ElenaLeadUpdateError extends Error {}
const text = (v: unknown, max: number) => {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max || /[\x00-\x1f\x7f]/.test(v)) throw new ElenaLeadUpdateError('Please clarify those details before saving.')
  return v.trim().replace(/\s+/g, ' ')
}
const equalName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/** Prepare only updates for a confirmed, uniquely matched lead; does not write lead data. */
export async function prepareElenaLeadUpdate(input: { callSid: string; sessionId: string; fields: Record<string, unknown> }) {
  const fields = input.fields
  if (Object.keys(fields).some(k => !['full_name', 'phone', 'email', 'event_type', 'target_date', 'guest_count', 'budget', 'package_interest', 'notes'].includes(k))) throw new ElenaLeadUpdateError('Only caller-confirmed contact and event details can be updated.')
  const fullName = text(fields.full_name, 120)
  const rawPhone = text(fields.phone, 32)
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null
  const email = text(fields.email, 254)?.toLowerCase() || null
  const notes = text(fields.notes, 1500)
  const eventType = text(fields.event_type, 120), targetDate = text(fields.target_date, 10)
  const budget = text(fields.budget, 120), packageInterest = text(fields.package_interest, 120)
  const guests = fields.guest_count == null ? null : fields.guest_count
  if ((rawPhone && !phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T00:00:00Z`)) || new Date(`${targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== targetDate))
    || (guests !== null && (!Number.isInteger(guests) || Number(guests) < 1 || Number(guests) > 180))
    || (packageInterest && !['Essentials', 'Signature', 'Luxor'].includes(packageInterest))
    || (!fullName && !phone && !email && !notes && !eventType && !targetDate && guests === null && !budget && !packageInterest)) throw new ElenaLeadUpdateError('Please check the caller’s contact and event details before saving.')
  const [call] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,inquiry_id,metadata,updated_at&twilio_call_sid=eq.${encodeURIComponent(input.callSid)}&limit=1`)
  const capture = call?.metadata.inbound_capture as Contact | undefined
  if (!call || call.direction !== 'inbound' || !['ringing', 'in-progress'].includes(call.status) || call.to_number !== process.env.LUXOR_ELENA_LIVE_NUMBER
    || call.metadata.scope !== 'elena_live_inbound' || call.metadata.ingress_mode !== 'programmable_sip' || call.metadata.rehearsal_only !== false
    || call.metadata.accepted !== true || call.metadata.openai_session_id !== input.sessionId || !call.inquiry_id
    || !capture?.confirmed || capture.matching_review_needed !== false || capture.inquiry_id !== call.inquiry_id || !capture.nonce || !capture.full_name || !capture.phone) throw new ElenaLeadUpdateError('Save confirmed contact details first. Arianna must review an ambiguous match.')
  const [lead] = await supabaseRestStrict<Inquiry[]>(`luxor_inquiries?select=id,full_name,phone,email,updated_at,archived_at,is_test&id=eq.${call.inquiry_id}&limit=1`)
  if (!lead || lead.archived_at || lead.is_test || !equalName(lead.full_name, capture.full_name) || normalizePhoneNumber(lead.phone || '') !== normalizePhoneNumber(capture.phone)
    || (lead.email && capture.email && lead.email.trim().toLowerCase() !== capture.email.trim().toLowerCase())
    || (email && lead.email && !capture.email && lead.email.trim().toLowerCase() !== email)) throw new ElenaLeadUpdateError('The existing lead details need Arianna’s review before updating them.')
  const nonce = randomUUID(), expiresAt = new Date(Date.now() + 180_000).toISOString()
  const pending = { nonce, expires_at: expiresAt, inquiry_id: lead.id, inquiry_updated_at: lead.updated_at, contact_nonce: capture.nonce,
    full_name: fullName, phone, email, notes, event_type: eventType, target_date: targetDate, guest_count: guests, budget, package_interest: packageInterest }
  const [changed] = await supabaseRestStrict<Call[]>(`luxor_calls?twilio_call_sid=eq.${encodeURIComponent(input.callSid)}&updated_at=eq.${encodeURIComponent(call.updated_at)}&metadata->>scope=eq.elena_live_inbound&metadata->>openai_session_id=eq.${encodeURIComponent(input.sessionId)}&select=twilio_call_sid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ metadata: { ...call.metadata, lead_update_pending: pending }, updated_at: new Date(Math.max(Date.now(), Date.parse(call.updated_at) + 1)).toISOString() }),
  })
  if (!changed) throw new ElenaLeadUpdateError('The call changed. Please repeat the details before saving.')
  const parts = [fullName && `name ${fullName}`, phone && `phone ${phone}`, email && `email ${email}`, eventType && `event type ${eventType}`, targetDate && `event date ${targetDate}`, guests !== null && `${guests} guests`, budget && `budget ${budget}`, packageInterest && `package interest ${packageInterest}`, notes && `call note: ${notes}`].filter(Boolean)
  return { nonce, expiresAt, question: `I have ${parts.join(', ')}. Is that correct, and may I save ${parts.length === 1 ? 'this' : 'these details'} for the Luxor team?` }
}

/** The caller-facing MCP handler verifies a signed token and a later affirmative before calling. */
export async function confirmElenaLeadUpdate(input: { callSid: string; sessionId: string; nonce: string }) {
  return supabaseRestStrict<{ saved: boolean; duplicate?: boolean }>('rpc/luxor_confirm_elena_lead_update', { method: 'POST', body: JSON.stringify({ p_call_sid: input.callSid, p_session_id: input.sessionId, p_nonce: input.nonce }) })
}
