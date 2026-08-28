import 'server-only'

import { Resolver } from 'node:dns/promises'
import PostalMime from 'postal-mime'
import { dkimVerify, type DKIMResult } from 'mailauth'
import { parseLuxorCalendarReply, type LuxorCalendarReply } from './luxorCalendarReply'
import { luxorMailAddress } from './luxorMailConfig'
import { supabaseRest } from './supabaseRestServer'

type FullDkimResult = DKIMResult & { signingHeaders?: { keys: string }; signatureTimeValid?: boolean }

export async function inspectLuxorCalendarReply(raw: Uint8Array, expectedSender: string, resolverOverride?: (name: string, type: string) => Promise<string[][]>) {
  // Malformed or oversized MIME must not make an otherwise archived email
  // poison the webhook retry queue. Database failures still propagate below.
  const parsed = await PostalMime.parse(raw, { maxNestingDepth: 30, maxHeadersSize: 128_000, forceRfc822Attachments: true, maxRfc822NestingDepth: 0 }).catch(() => null)
  if (!parsed) return { replies: [], verified: false }
  const sender = luxorMailAddress(parsed.from?.address || '')
  const replies = parsed.attachments.filter((part) => /^(text\/calendar|application\/ics)$/i.test(part.mimeType))
    .map((part) => parseLuxorCalendarReply(typeof part.content === 'string' ? part.content : new TextDecoder().decode(part.content)))
    .filter((reply): reply is LuxorCalendarReply => Boolean(reply))
  // Duplicate MIME alternatives are normal; conflicting payloads are not.
  const unique = Array.from(new Map(replies.map((reply) => [JSON.stringify(reply), reply])).values())
  if (unique.length !== 1 || !sender || sender !== expectedSender || unique[0].attendeeEmail !== sender
    || parsed.headers.filter((h) => h.key === 'from').length !== 1) return { replies: [], verified: false }
  const resolver = new Resolver({ timeout: 3000, tries: 1 })
  let queries = 0
  const verification = await dkimVerify(Buffer.from(raw), {
    resolver: resolverOverride || (async (name, type) => {
      if (++queries > 8 || type !== 'TXT') throw new Error('DKIM DNS lookup limit reached.')
      return resolver.resolveTxt(name)
    }),
  })
  const contentHeaders = ['content-type', 'content-transfer-encoding'].filter((key) => parsed.headers.some((h) => h.key === key))
  const verified = verification.results.some((signature: FullDkimResult) => {
    const signed = (signature.signingHeaders?.keys || '').toLowerCase().split(':').map((key) => key.trim())
    return signature.status.result === 'pass' && Boolean(signature.status.aligned) && !signature.status.underSized
      && signature.signatureTimeValid !== false && signed.includes('from')
      && contentHeaders.every((key) => signed.includes(key) && parsed.headers.filter((h) => h.key === key).length === 1)
  })
  return { replies: unique, verified }
}

export async function recordLuxorCalendarReplies(messageId: string, raw: Uint8Array, sender: string) {
  const { replies, verified } = await inspectLuxorCalendarReply(raw, sender)
  for (const reply of replies) {
    await supabaseRest('rpc/luxor_record_calendar_response', { method: 'POST', body: JSON.stringify({
      p_uid: reply.uid, p_message_id: messageId, p_email: reply.attendeeEmail, p_sequence: reply.sequence,
      p_partstat: reply.partstat, p_stamp: reply.stamp, p_verified: verified,
    }) })
  }
  return { count: replies.length, verified }
}
