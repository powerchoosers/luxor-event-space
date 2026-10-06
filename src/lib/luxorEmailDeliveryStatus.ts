export type LuxorPublicEmailDeliveryStatus = 'sent' | 'pending' | 'failed' | 'unknown'

/**
 * Only a provider-accepted job is "sent". Queued or in-flight work stays
 * pending, and missing/ambiguous records never become a positive claim.
 */
export function getLuxorPublicEmailDeliveryStatus(status: string | null | undefined): LuxorPublicEmailDeliveryStatus {
  if (status === 'sent') return 'sent'
  if (status === 'queued' || status === 'sending') return 'pending'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'unknown'
}
