import { NextRequest, NextResponse } from 'next/server'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, content, from, fromName } = body

    const result = await sendLuxorZohoEmail({
      to: String(to || ''),
      subject: String(subject || ''),
      content: String(content || ''),
      from: typeof from === 'string' ? from : undefined,
      fromName: typeof fromName === 'string' ? fromName : undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email.'
    const missingConfig = message.includes('Missing Zoho email credentials')

    console.error('Luxor Zoho email send failed:', message)
    return NextResponse.json({ error: message }, { status: missingConfig ? 500 : 400 })
  }
}
