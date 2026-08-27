import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { getLuxorZohoMessageDetail, normalizeEmailAddress, resolveArchivedZohoMessage, ZohoMessageReadError, type ArchivedZohoIdentity, type LuxorZohoMessage } from './zohoMailServer'

type BodySync = { attempts?: number; leaseUntil?: string | null; nextAttemptAt?: string | null; error?: string | null }
type EmailRecord = ArchivedZohoIdentity & {
  id: string
  message_id: string
  metadata: Record<string, unknown> & { bodySync?: BodySync; cachedMessage?: LuxorZohoMessage; folderId?: string }
}

function hasBody(message?: LuxorZohoMessage | null): message is LuxorZohoMessage {
  return Boolean(message && typeof message.content === 'string')
}

async function findRecord(messageId: string) {
  const rows = await supabaseRest<EmailRecord[]>(`luxor_email_events?select=id,message_id,metadata,subject,sender_email,received_at&message_id=eq.${encodeURIComponent(messageId)}&limit=1`)
  return rows[0]
}

// Compare-and-swap prevents two workers from claiming the same record or overwriting a saved body.
function unchangedRecord(row: EmailRecord) {
  return `luxor_email_events?id=eq.${encodeURIComponent(row.id)}&metadata=eq.${encodeURIComponent(JSON.stringify(row.metadata))}`
}

async function syncRecord(row: EmailRecord, folderId?: string): Promise<LuxorZohoMessage | null> {
  if (hasBody(row.metadata.cachedMessage)) return row.metadata.cachedMessage
  const state = row.metadata.bodySync || {}
  if (state.leaseUntil && new Date(state.leaseUntil).getTime() > Date.now()) return null
  const attempts = (state.attempts || 0) + 1
  const claimedMetadata = {
    ...row.metadata,
    bodySync: { ...state, attempts, leaseUntil: new Date(Date.now() + 5 * 60_000).toISOString() },
  }
  const claimed = await supabaseRest<EmailRecord[]>(`${unchangedRecord(row)}&select=id,message_id,metadata`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ metadata: claimedMetadata }),
  })
  if (!claimed?.length) return null
  const claim = claimed[0]
  try {
    let reference = { id: row.message_id, folderId: folderId || row.metadata.folderId }
    if (!reference.folderId) {
      const resolved = await resolveArchivedZohoMessage(row.message_id, row)
      if (!resolved) throw new ZohoMessageReadError(404)
      reference = resolved
    }
    const detail = await getLuxorZohoMessageDetail(reference.id, reference.folderId)
    if (!hasBody(detail)) throw new Error('Zoho did not return an email body.')
    const saved = await supabaseRest<Array<{ id: string }>>(`${unchangedRecord(claim)}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: {
        ...row.metadata, limitedData: false, folderId: detail.folderId, resolvedMessageId: detail.id,
        cachedAt: new Date().toISOString(), cachedMessage: detail,
        bodySync: { attempts, leaseUntil: null, nextAttemptAt: null, error: null },
      } }),
    })
    if (!saved?.length) throw new Error('The email changed while its body was being saved. Please retry.')
    return detail
  } catch (error) {
    const delay = error instanceof ZohoMessageReadError && error.status === 404
      ? 24 * 60 * 60_000 : Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempts, 10))
    await supabaseRest(unchangedRecord(claim), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ metadata: {
        ...row.metadata,
        bodySync: { attempts, leaseUntil: null, nextAttemptAt: new Date(Date.now() + delay).toISOString(),
          error: error instanceof ZohoMessageReadError ? error.message : 'Email body sync failed; another attempt is scheduled.' },
      } }),
    })
    throw error
  }
}

export async function getArchivedLuxorEmail(messageId: string, folderId?: string) {
  let row = await findRecord(messageId)
  if (!row) {
    const detail = await getLuxorZohoMessageDetail(messageId, folderId)
    if (!hasBody(detail)) throw new Error('Zoho did not return an email body.')
    await supabaseRest('luxor_email_events?on_conflict=event_key', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        event_key: messageId, message_id: messageId,
        sender_email: normalizeEmailAddress(detail.from), recipient_email: normalizeEmailAddress(detail.to),
        subject: detail.subject, received_at: detail.receivedAt || new Date().toISOString(),
        metadata: { source: 'zoho-mail-reader', limitedData: false, folderId: detail.folderId,
          cachedAt: new Date().toISOString(), cachedMessage: detail },
      }),
    })
    row = await findRecord(messageId)
    if (!row) throw new Error('The email could not be saved. Please retry.')
  }
  const message = await syncRecord(row, folderId)
  if (!message) throw new Error('This email is syncing in the background. Please try again in a moment.')
  return message
}

/** No mail is sent. Pending webhook records double as the durable body-sync queue. */
export async function syncPendingLuxorEmailBodies(limit = 3) {
  const now = new Date().toISOString()
  const rows = await supabaseRest<EmailRecord[]>(
    `luxor_email_events?select=id,message_id,metadata,subject,sender_email,received_at&message_id=not.is.null&metadata->cachedMessage=is.null`
    + `&and=(or(metadata->bodySync->>nextAttemptAt.is.null,metadata->bodySync->>nextAttemptAt.lte.${now}),or(metadata->bodySync->>leaseUntil.is.null,metadata->bodySync->>leaseUntil.lte.${now}))`
    + `&order=received_at.desc&limit=${Math.min(Math.max(limit, 1), 10)}`,
  )
  const result = { saved: 0, failed: 0, skipped: 0 }
  for (const row of rows) {
    try {
      if (await syncRecord(row)) result.saved += 1
      else result.skipped += 1
    } catch (error) {
      result.failed += 1
      console.warn('[email-archive] body sync deferred', { status: error instanceof ZohoMessageReadError ? error.status : 'unavailable' })
      // Do not amplify an account-wide authorization/rate-limit failure across the batch.
      if (!(error instanceof ZohoMessageReadError) || error.status !== 404) break
    }
  }
  return result
}
