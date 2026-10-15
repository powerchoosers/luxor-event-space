import { LUXOR_TEST_IDENTIFICATION_EMAIL } from './luxorTestLeadPolicy'

export type LuxorTestEmailDeliveryEvent =
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed'

export const LUXOR_TEST_EMAIL_RECIPIENT = LUXOR_TEST_IDENTIFICATION_EMAIL

export async function sendLuxorTestEmail(input: {
  subject: string
  body: string
  from?: string
  fromName?: string
  sendProvider: (message: { to: string; subject: string; body: string; from?: string; fromName?: string }) => Promise<{ messageId?: string | null }>
}) {
  const providerResult = await input.sendProvider({
    to: LUXOR_TEST_EMAIL_RECIPIENT,
    subject: input.subject,
    body: input.body,
    from: input.from,
    fromName: input.fromName,
  })
  return {
    recipient: LUXOR_TEST_EMAIL_RECIPIENT,
    providerMessageId: providerResult.messageId || null,
    acceptedAt: new Date().toISOString(),
  }
}

export function luxorTestEmailAcceptedPatch(input: { provider: string; providerMessageId?: string | null }) {
  return {
    status: 'provider_accepted' as const,
    provider: input.provider,
    provider_message_id: input.providerMessageId || null,
    provider_status: 'accepted',
    delivery_status: 'unknown' as const,
    error_message: null,
    updated_at: new Date().toISOString(),
  }
}

export function luxorTestEmailDeliveryPatch(input: {
  event: LuxorTestEmailDeliveryEvent
  providerMessageId: string
  bounceMessage?: string | null
}) {
  const deliveryStatus = input.event === 'email.delivered' ? 'delivered'
    : input.event === 'email.bounced' ? 'bounced'
      : input.event === 'email.complained' ? 'complained' : 'deferred'
  const status = deliveryStatus === 'delivered' ? 'delivered'
    : deliveryStatus === 'bounced' ? 'bounced'
      : deliveryStatus === 'complained' ? 'blocked' : 'provider_accepted'
  return {
    status,
    provider: 'resend',
    provider_message_id: input.providerMessageId,
    provider_status: input.event,
    delivery_status: deliveryStatus,
    error_message: input.event === 'email.bounced' ? String(input.bounceMessage || 'Provider reported a bounce.').slice(0, 1000) : null,
    updated_at: new Date().toISOString(),
  }
}
