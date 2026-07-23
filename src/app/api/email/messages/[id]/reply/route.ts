import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { replyLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createNote } from '@/lib/luxorNotesServer'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const body = await request.json() as { content?: string; inquiryId?: string | null }
    const content = String(body.content || '').trim()
    const result = await replyLuxorZohoEmail({ messageId: id, content, from: session.mailboxAddress || session.email })
    if (body.inquiryId) {
      await createNote(body.inquiryId, `Email reply sent by ${session.email}: ${content.slice(0, 500)}`, 'email_log', session.email)
        .catch((error) => console.warn('Reply sent, but email note logging failed:', error))
    }
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send this reply.'
    console.error('Luxor email reply failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
