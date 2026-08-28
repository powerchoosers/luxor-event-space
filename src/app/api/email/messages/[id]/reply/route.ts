import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorZohoMessageDetail, normalizeEmailAddress, replyLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorMailboxMessage, resolveLuxorMailboxRow } from '@/lib/luxorMailboxServer'
import { sendLuxorResendEmail } from '@/lib/luxorResendMailServer'
import { luxorResendApi } from '@/lib/luxorResendApiServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const body = await request.json() as { content?: string; folderId?: string | null; inquiryId?: string | null; deliveryKey?: string }
    const content = String(body.content || '').trim()
    const mailRow = await resolveLuxorMailboxRow(id)
    if (id.startsWith('mail-') && !mailRow) return NextResponse.json({ error: 'Mailbox message not found.' }, { status: 404 })
    const useResend = mailRow?.provider === 'resend' || luxorMailProvider() === 'resend'
    if (useResend && !mailRow) throw new Error('Import the complete original Zoho message before replying through Resend.')
    const original = mailRow ? await getLuxorMailboxMessage(`mail-${mailRow.id}`) : await getLuxorZohoMessageDetail(id, String(body.folderId || '') || undefined)
    if (!original) throw new Error('The original email could not be loaded for this reply.')

    const recipient = original.direction === 'incoming'
      ? normalizeEmailAddress(original.from)
      : normalizeEmailAddress(original.to)
    const baseSubject = original.subject.replace(/^(\s*re\s*:\s*)+/i, '').trim() || '(No subject)'
    const subject = `Re: ${baseSubject}`
    let internetMessageId = mailRow?.internet_message_id
    if (useResend && mailRow?.provider === 'resend' && !internetMessageId && mailRow.provider_id) {
      const sent = await luxorResendApi<{ message_id: string }>(`/emails/${encodeURIComponent(mailRow.provider_id)}`)
      internetMessageId = sent.message_id
    }
    if (useResend && !internetMessageId) throw new Error('The original email identifier is missing or still syncing. Review the original before replying.')
    const result = useResend && mailRow ? await sendLuxorResendEmail({
      content, to: mailRow.direction === 'incoming' ? mailRow.reply_to_addresses[0] || recipient : recipient,
      subject, from: session.mailboxAddress || session.email, inReplyTo: internetMessageId!,
      references: [...mailRow.reference_ids, internetMessageId!], threadId: mailRow.thread_key,
      idempotencyKey: body.deliveryKey ? `reply/${body.deliveryKey}` : undefined,
    }) : await replyLuxorZohoEmail({
      messageId: mailRow ? String(mailRow.metadata.zohoMessageId || '') : id,
      content,
      to: recipient,
      subject,
      from: session.mailboxAddress || session.email,
    })
    if (body.inquiryId) {
      await createNote(body.inquiryId, `Email reply sent by ${session.email}: ${content.slice(0, 500)}`, 'email_log', session.email)
        .catch((error) => console.warn('Reply sent, but email note logging failed:', error))
    }
    const now = new Date().toISOString()
    return NextResponse.json({
      ...result,
      message: {
        id: result.messageId || `sent-${Date.now()}`,
        threadId: original.threadId,
        folderId: '',
        subject,
        from: result.from,
        to: result.to,
        cc: '',
        receivedAt: now,
        summary: content,
        content,
        htmlContent: null,
        hasAttachment: false,
        isRead: true,
        direction: 'outgoing',
        folder: 'sent',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send this reply.'
    console.error('Luxor email reply failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
