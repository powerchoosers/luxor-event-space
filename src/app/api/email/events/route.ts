import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type EmailEventRow = {
  id: string
  message_id: string | null
  sender_email: string | null
  sender_name: string | null
  recipient_email: string | null
  subject: string
  received_at: string
}

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '25', 10)
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 25, 1), 50)
  const rows = await supabaseRest<EmailEventRow[]>(
    `luxor_email_events?select=id,message_id,sender_email,sender_name,recipient_email,subject,received_at&order=received_at.desc&limit=${limit}`,
  )

  return NextResponse.json({
    messages: (rows || []).map((row) => ({
      id: row.id,
      messageId: row.message_id,
      webhookEvent: true,
      subject: row.subject,
      from: row.sender_name
        ? `${row.sender_name}${row.sender_email ? ` <${row.sender_email}>` : ''}`
        : row.sender_email || 'Unknown sender',
      to: row.recipient_email || '',
      receivedAt: row.received_at,
      direction: 'incoming',
      isRead: false,
    })),
  })
}
