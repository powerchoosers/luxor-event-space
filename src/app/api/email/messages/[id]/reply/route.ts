import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorZohoMessageDetail, normalizeEmailAddress, replyLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createNote } from '@/lib/luxorNotesServer'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const body = await request.json() as { content?: string; folderId?: string | null; inquiryId?: string | null }
    const content = String(body.content || '').trim()
    const original = await getLuxorZohoMessageDetail(id, String(body.folderId || '') || undefined)
    if (!original) throw new Error('The original email could not be loaded for this reply.')

    const recipient = original.direction === 'incoming'
      ? normalizeEmailAddress(original.from)
      : normalizeEmailAddress(original.to)
    const baseSubject = original.subject.replace(/^(\s*re\s*:\s*)+/i, '').trim() || '(No subject)'
    const subject = `Re: ${baseSubject}`
    const result = await replyLuxorZohoEmail({
      messageId: id,
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
