import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import { luxorMailAddress, luxorMailFrom } from './luxorMailConfig'
import { luxorResendApi } from './luxorResendApiServer'
import { prepareLuxorOutbox, saveLuxorMailAttachment, updateLuxorMailRow } from './luxorMailboxServer'
import { supabaseRest } from './supabaseRestServer'

export type LuxorSendMailInput = {
  to: string; subject: string; content: string; from?: string; fromName?: string
  text?: string; idempotencyKey?: string; threadId?: string; inReplyTo?: string; references?: string[]
  attachments?: Array<{ filename: string; content: Uint8Array; contentType?: string }>
  calendar?: { content: string; method: 'REQUEST' | 'CANCEL' | 'REPLY'; filename: string }
  metadata?: Record<string, unknown>
}

export async function sendLuxorResendEmail(input: LuxorSendMailInput) {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('Missing RESEND_API_KEY on the server.')
  const from = luxorMailFrom(input.from)
  const to = luxorMailAddress(input.to)
  if (!to) throw new Error('Please add one valid recipient email address.')
  const subject = input.subject.trim()
  if (!subject || /[\r\n]/.test(subject)) throw new Error('Please add a valid email subject.')
  const content = input.content.trim()
  if (!content) throw new Error('Please add an email message.')
  if (input.calendar && input.attachments?.length) throw new Error('Send calendar invitations separately from other attachments.')
  const fromName = (input.fromName || 'Luxor Event Space').replace(/[\r\n"<>]/g, '').slice(0, 120)
  const html = /<\/?[a-z][\s\S]*>/i.test(content) ? content : null
  const text = input.text ?? (html ? content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : content)
  const references = (input.references || []).filter((value) => /^<[^<>\s]+>$/.test(value)).slice(-50)
  if (input.inReplyTo && !/^<[^<>\s]+>$/.test(input.inReplyTo)) throw new Error('Invalid reply message identifier.')
  const attachments = input.attachments || []
  if (attachments.reduce((size, item) => size + item.content.byteLength, 0) > 25 * 1024 * 1024) throw new Error('Email attachments exceed the 25 MB sending limit.')
  const idempotencyKey = input.idempotencyKey || `manual/${randomUUID()}`
  if (!/^[\x21-\x7E]{1,256}$/.test(idempotencyKey)) throw new Error('Invalid email delivery key.')
  const payloadHash = createHash('sha256').update(JSON.stringify({ from, fromName, to, subject, html, text,
    inReplyTo: input.inReplyTo, references, calendar: input.calendar,
    attachments: attachments.map((a) => ({ filename: a.filename, type: a.contentType, hash: createHash('sha256').update(a.content).digest('hex') })) })).digest('hex')
  const row = await prepareLuxorOutbox({ from, to, subject, html, text, idempotencyKey, payloadHash,
    smtpMessageId: Boolean(input.calendar),
    threadId: input.threadId, references, metadata: { ...input.metadata,
      ...(idempotencyKey.startsWith('email-job/') || idempotencyKey.startsWith('agreement-job/') ? { emailJobId: idempotencyKey.split('/')[1] } : {}),
      hasAttachments: attachments.length > 0 || Boolean(input.calendar) } })
  if (row.accepted_at) return { messageId: `mail-${row.id}`, providerMessageId: row.provider_id, from, to }

  for (const [index, attachment] of attachments.entries()) {
    await saveLuxorMailAttachment({ messageId: row.id, sourceKey: `outbound-${index}`, filename: attachment.filename,
      contentType: attachment.contentType || 'application/octet-stream', bytes: attachment.content })
  }
  if (input.calendar) await saveLuxorMailAttachment({ messageId: row.id, sourceKey: 'calendar', filename: input.calendar.filename,
    contentType: `text/calendar; method=${input.calendar.method}`, bytes: Buffer.from(input.calendar.content) })

  await supabaseRest(`luxor_mail_messages?id=eq.${row.id}&accepted_at=is.null&status=in.(prepared,sending,send_unconfirmed)`, {
    method: 'PATCH', body: JSON.stringify({ attempted_at: row.attempted_at || new Date().toISOString(), status: 'sending', last_error: null }),
  })
  const headers: Record<string, string> = {
    'X-Luxor-Message-ID': row.id,
    ...(input.inReplyTo ? { 'In-Reply-To': input.inReplyTo } : {}),
    ...(references.length ? { References: references.join(' ') } : {}),
  }
  let providerId: string | null = null
  let internetMessageId = row.internet_message_id
  try {
    if (input.calendar) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: key },
        tls: { minVersion: 'TLSv1.2' }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
      })
      try {
        const receipt = await transporter.sendMail({ from: { name: fromName, address: from }, to, replyTo: from,
          subject, text, html: html || undefined, messageId: row.internet_message_id || undefined, date: new Date(row.created_at),
          headers: { ...headers, 'Content-Class': 'urn:content-classes:calendarmessage', 'Resend-Idempotency-Key': idempotencyKey },
          // Keep the invitation as the calendar alternative of the message.
          // Nodemailer's `icalEvent` convenience option also adds a downloadable
          // `application/ics` attachment; Resend/Outlook then treat both parts as
          // ordinary attachments instead of recognizing the meeting request.
          alternatives: [{
            content: input.calendar.content,
            contentType: `text/calendar; method=${input.calendar.method}; charset=UTF-8`,
          }],
        })
        if (!receipt.accepted?.length || receipt.rejected?.length) throw new Error('Resend did not accept the calendar invitation recipient.')
        internetMessageId = receipt.messageId
      } finally { transporter.close() }
    } else {
      const result = await luxorResendApi<{ id: string }>('/emails', { method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], reply_to: from, subject,
          text, ...(html ? { html } : {}), headers,
          attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64'), content_type: a.contentType })),
          tags: [{ name: 'luxor_message_id', value: row.id }],
        }),
      })
      if (!result.id) throw new Error('Resend did not return a delivery identifier.')
      providerId = result.id
      // Resend assigns the final Message-ID; the sent webhook/retrieval reconciles it.
      internetMessageId = null
    }
  } catch (error) {
    // A transport timeout is not a provider rejection. A webhook may already
    // have confirmed delivery while this call was waiting for its response.
    await supabaseRest(`luxor_mail_messages?id=eq.${row.id}&accepted_at=is.null&status=eq.sending`, {
      method: 'PATCH', body: JSON.stringify({ status: 'send_unconfirmed', last_error: 'Delivery was not confirmed; retry using the same delivery key.' }),
    }).catch(() => undefined)
    throw error
  }
  // If this write fails, the caller retries with the SAME provider idempotency key.
  await updateLuxorMailRow(row.id, {
    ...(providerId ? { provider_id: providerId } : {}),
    ...(internetMessageId ? { internet_message_id: internetMessageId } : {}),
    accepted_at: new Date().toISOString(), last_error: null,
  })
  // An early delivered/bounced webhook must not be overwritten by the sender.
  await supabaseRest(`luxor_mail_messages?id=eq.${row.id}&status=in.(prepared,sending,send_unconfirmed)`, {
    method: 'PATCH', body: JSON.stringify({ status: 'sent' }),
  })
  return { messageId: `mail-${row.id}`, providerMessageId: providerId, from, to }
}
