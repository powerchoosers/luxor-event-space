import { NextRequest, NextResponse } from 'next/server'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

export async function POST(request: NextRequest) {
  try {
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
