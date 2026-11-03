import 'server-only'

import { luxorMailAddress } from './luxorMailConfig'
import { listLuxorMailboxMessages } from './luxorMailboxServer'
import { luxorEmailHtmlToPlainText } from './luxorConversationalEmailServer'
import { supabaseRest } from './supabaseRestServer'

/** Read current client replies without refreshing providers or changing read state. */
export async function getWorkflowRecentClientMessages(inquiryId: string, email: unknown) {
  const address = typeof email === 'string' ? luxorMailAddress(email) : ''
  const messages = await supabaseRest<Array<{ created_at: string; body: string }>>(
    `luxor_messages?select=created_at,body&inquiry_id=eq.${encodeURIComponent(inquiryId)}&direction=eq.inbound&order=created_at.desc&limit=4`,
  )
  // Mailbox rows do not carry a reliable inquiry ID. Use the current address
  // only when it identifies one client record, rather than mixing event briefs
  // for a family or organization that shares an inbox.
  const matches = address ? await supabaseRest<Array<{ id: string }>>(
    `luxor_inquiries?select=id&email=eq.${encodeURIComponent(address)}&is_test=not.is.true&and=(or(metadata->>is_test_record.is.null,metadata->>is_test_record.eq.false))&limit=2`,
  ) : []
  const mailboxScope = matches.length === 1 && matches[0].id === inquiryId
    ? 'current_client_email_address' : address ? 'not_loaded_shared_or_unlinked_address' : 'no_client_email_address'
  const emails = mailboxScope === 'current_client_email_address'
    ? await listLuxorMailboxMessages({ email: address, limit: 12 }) : []

  return {
    recent_client_texts: messages.map((message) => ({ received_at: message.created_at, body: message.body.slice(0, 2000) })),
    recent_client_email_scope: mailboxScope,
    recent_client_email: emails.filter((message) => message.direction === 'incoming').slice(0, 4).map((message) => ({
      received_at: message.receivedAt, subject: message.subject,
      body: luxorEmailHtmlToPlainText(message.content || message.summary || '').slice(0, 2000),
    })),
  }
}
