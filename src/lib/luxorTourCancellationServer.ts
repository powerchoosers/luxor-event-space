import 'server-only'
import type { LuxorInquiry } from './luxorInquiryTypes'
import { getLuxorCalendarEvent } from './luxorCalendarServer'
import { cancelLuxorLegacyTourForInquiry } from './luxorLegacyTourCancellationServer'
import { supabaseRest } from './supabaseRestServer'

type CancellationRpcResult = { status: 'cancelled' | 'already_cancelled' | 'not_found' | 'unavailable' | 'calendar_attention' | 'slot_attention' | 'contact_attention' | 'stale'; inquiry?: LuxorInquiry; slotReleased?: boolean; calendarSequence?: number }
export type LuxorTourCancellation = {
  ok: boolean; cancelledAt: string; slotReleased: boolean
  calendar: { status: 'not_linked' | 'cancelled' | 'cancellation_queued' | 'already_removed' | 'needs_reconnect' | 'failed'; warning?: string }
  metadataPatch: Record<string, unknown>; errors: string[]; inquiry?: LuxorInquiry; replayed?: boolean
}

export async function cancelLuxorTourForInquiry(input: { inquiry: LuxorInquiry; reason?: string | null; requestedBy: string; token?: string; expectedSequence?: number }): Promise<LuxorTourCancellation> {
  // Preserve the existing owner/deal-lost Zoho path. Public links never use
  // this non-transactional legacy path.
  if (input.token === undefined && typeof input.inquiry.metadata?.zohoCalendarEventUid === 'string'
    && input.inquiry.metadata.zohoCalendarEventUid.trim() && !await getLuxorCalendarEvent(input.inquiry.id)) {
    if (['attended', 'no_show', 'cancelled'].includes(input.inquiry.tour_attendance_status || '')) {
      return { ok: false, cancelledAt: '', slotReleased: false, calendar: { status: 'failed' }, metadataPatch: {}, errors: ['Only a pending or upcoming tour can be cancelled.'] }
    }
    return cancelLuxorLegacyTourForInquiry(input)
  }
  const result = await supabaseRest<CancellationRpcResult>('rpc/luxor_cancel_tour', { method: 'POST', body: JSON.stringify({
    p_inquiry_id: input.inquiry.id, p_token: input.token ?? null, p_requested_by: input.requestedBy,
    p_expected_sequence: input.expectedSequence ?? null,
    p_reason: String(input.reason || '').trim().replace(/\s+/g, ' ').slice(0, 500) || null,
  }) })
  const ok = result.status === 'cancelled' || result.status === 'already_cancelled'
  const message = result.status === 'stale' ? 'The tour changed. Please reopen the link and review the current time before cancelling.'
    : result.status === 'contact_attention' ? 'The contact email needs staff review. Please contact Luxor for help.'
    : result.status === 'slot_attention' ? 'The saved tour time does not match its reservation. Please contact Luxor for help.'
    : result.status === 'calendar_attention' ? 'This tour calendar needs staff review before cancellation. Please contact Luxor for help.'
      : 'This tour is no longer available. Please contact Luxor for help.'
  const metadata = result.inquiry?.metadata || {}
  const cancellation = metadata.tourCancellation as Record<string, unknown> | undefined
  return { ok, cancelledAt: typeof cancellation?.cancelledAt === 'string' ? cancellation.cancelledAt : '',
    slotReleased: Boolean(result.slotReleased), calendar: { status: ok ? 'cancellation_queued' : 'failed', ...(!ok ? { warning: message } : {}) },
    metadataPatch: metadata, errors: ok ? [] : [message], inquiry: result.inquiry, replayed: result.status === 'already_cancelled' }
}
