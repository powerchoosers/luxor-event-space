import type { LuxorInquiry } from './luxorInquiryTypes'

export type LuxorClientAttentionFields = Pick<
  LuxorInquiry,
  | 'client_attention_at'
  | 'client_attention_reason'
  | 'client_attention_kind'
  | 'client_attention_event_id'
  | 'client_attention_acknowledged_at'
>

export function luxorLeadNeedsClientAttention(
  inquiry: LuxorClientAttentionFields | null | undefined,
): boolean {
  if (!inquiry?.client_attention_at) return false
  if (!inquiry.client_attention_acknowledged_at) return true
  return (
    new Date(inquiry.client_attention_acknowledged_at).getTime()
    < new Date(inquiry.client_attention_at).getTime()
  )
}