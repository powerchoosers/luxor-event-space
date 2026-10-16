import { createHash } from 'node:crypto'
import type { LuxorPushPayload, LuxorPushResult } from './luxorWebPushServer'

type BouncePushReceipt = { subscriptionIds: string[]; completedAt?: string }
type Metadata = Record<string, unknown>
type BouncePushRest = <T>(path: string, init?: RequestInit) => Promise<T>

export async function sendLuxorResendBouncePush(
  messageId: string,
  inquiryId: string,
  eventId: string,
  dependencies: {
    supabaseRest: BouncePushRest
    sendPush: (type: 'email', payload: LuxorPushPayload, options: { excludeSubscriptionIds: string[] }) => Promise<LuxorPushResult>
  },
) {
  // The webhook worker owns the event lease. Keep receipts on the existing
  // server-only mail row, separate from lead/task deduplication and inbox events.
  const key = createHash('sha256').update(eventId).digest('hex').slice(0, 24)
  const messagePath = `luxor_mail_messages?id=eq.${encodeURIComponent(messageId)}`
  const [message] = await dependencies.supabaseRest<Array<{ metadata: Metadata }>>(`${messagePath}&select=metadata&limit=1`)
  if (!message) throw new Error('Bounced email notification message was not found.')
  const receipts = (message.metadata.bouncePushReceipts || {}) as Record<string, BouncePushReceipt>
  const receipt = receipts[key]
  if (receipt?.completedAt) return

  const result = await dependencies.sendPush('email', {
    title: 'Luxor email bounced',
    body: 'An email could not be delivered. Review the email address in the portal.',
    url: `/portal/leads/${encodeURIComponent(inquiryId)}`,
    tag: `bounce-${key}`,
  }, { excludeSubscriptionIds: receipt?.subscriptionIds || [] })

  // Save accepted devices even when another device failed, so the durable
  // webhook retry only targets failures. Use metadata CAS to preserve concurrent
  // mail updates. A stable tag also coalesces any ambiguous transport retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [latest] = await dependencies.supabaseRest<Array<{ metadata: Metadata }>>(`${messagePath}&select=metadata&limit=1`)
    if (!latest) throw new Error('Bounced email notification message was not found.')
    const current = (latest.metadata.bouncePushReceipts || {}) as Record<string, BouncePushReceipt>
    const subscriptionIds = [...new Set([...(current[key]?.subscriptionIds || []), ...result.deliveredSubscriptionIds])]
    const updated = await dependencies.supabaseRest<Array<{ id: string }>>(
      `${messagePath}&metadata=eq.${encodeURIComponent(JSON.stringify(latest.metadata))}&select=id`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ metadata: { ...latest.metadata, bouncePushReceipts: { ...current,
          [key]: { subscriptionIds, ...(!result.failed ? { completedAt: new Date().toISOString() } : {}) },
        } } }),
      },
    )
    if (!updated?.length) continue
    if (result.failed) throw new Error('Bounced email notification delivery needs a retry.')
    return
  }
  throw new Error('Bounced email notification receipt changed concurrently; retry this event.')
}
