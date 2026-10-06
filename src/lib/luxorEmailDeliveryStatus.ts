export type LuxorPublicEmailDeliveryStatus = 'sent' | 'pending' | 'failed' | 'unknown'

/**
 * Only a provider-accepted job is "sent". Queued or in-flight work stays
 * pending, and missing/ambiguous records never become a positive claim.
 */
export function getLuxorPublicEmailDeliveryStatus(status: string | null | undefined): LuxorPublicEmailDeliveryStatus {
  if (status === 'sent' || status === 'delivered' || status === 'opened' || status === 'clicked') return 'sent'
  if (status === 'queued' || status === 'sending' || status === 'prepared' || status === 'delivery_delayed' || status === 'send_unconfirmed') return 'pending'
  if (status === 'failed' || status === 'bounced' || status === 'suppressed' || status === 'complained' || status === 'cancelled') return 'failed'
  return 'unknown'
}
