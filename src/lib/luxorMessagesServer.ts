import 'server-only'

import { findLuxorInquiryByPhone } from './luxorCallsServer'
import type { LuxorMessage, LuxorMessageDirection, LuxorMessageStatus } from './luxorMessageTypes'
import { supabaseRest } from './supabaseRestServer'

export async function createOrUpdateLuxorMessage(input: {
  sid: string; direction: LuxorMessageDirection; status: LuxorMessageStatus; from: string; to: string; body: string
  inquiryId?: string | null; contactName?: string | null; ownerEmail?: string | null; mediaUrls?: string[]; isRead?: boolean
}) {
  const [message] = await supabaseRest<LuxorMessage[]>('luxor_messages?on_conflict=twilio_message_sid&select=*', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ twilio_message_sid: input.sid, direction: input.direction, status: input.status, from_number: input.from, to_number: input.to, body: input.body, inquiry_id: input.inquiryId ?? null, contact_name: input.contactName ?? null, owner_email: input.ownerEmail ?? null, media_urls: input.mediaUrls ?? [], is_read: input.isRead ?? input.direction === 'outbound', updated_at: new Date().toISOString() }),
  })
  return message ?? null
}

export async function saveInboundLuxorMessage(input: { sid: string; from: string; to: string; body: string; mediaUrls: string[] }) {
  const inquiry = await findLuxorInquiryByPhone(input.from)
  return createOrUpdateLuxorMessage({ ...input, direction: 'inbound', status: 'received', inquiryId: inquiry?.id, contactName: inquiry?.full_name, isRead: false })
}

export async function listLuxorMessages(options: { inquiryId?: string | null; limit?: number } = {}) {
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: String(Math.min(Math.max(options.limit ?? 200, 1), 1000)) })
  if (options.inquiryId) params.set('inquiry_id', `eq.${options.inquiryId}`)
  return supabaseRest<LuxorMessage[]>(`luxor_messages?${params}`)
}

export async function updateLuxorMessageStatus(sid: string, status: LuxorMessageStatus, errorCode?: string | null, errorMessage?: string | null) {
  const [message] = await supabaseRest<LuxorMessage[]>(`luxor_messages?select=*&twilio_message_sid=eq.${encodeURIComponent(sid)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status, error_code: errorCode ?? null, error_message: errorMessage ?? null, updated_at: new Date().toISOString() }) })
  return message ?? null
}

export async function markLuxorMessageRead(id: string) {
  const [message] = await supabaseRest<LuxorMessage[]>(`luxor_messages?select=*&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ is_read: true, updated_at: new Date().toISOString() }) })
  return message ?? null
}
