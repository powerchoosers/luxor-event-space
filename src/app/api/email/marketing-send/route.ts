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
    const { to, subject, htmlContent, fromName } = body

    if (!to || typeof to !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid recipient address.' }, { status: 400 })
    }
    if (!subject || typeof subject !== 'string') {
      return NextResponse.json({ error: 'Missing subject line.' }, { status: 400 })
    }
    if (!htmlContent || typeof htmlContent !== 'string') {
      return NextResponse.json({ error: 'Missing HTML content.' }, { status: 400 })
    }

    const result = await sendLuxorZohoEmail({
      to: String(to),
      subject: String(subject),
      content: String(htmlContent),
      fromName: typeof fromName === 'string' ? fromName : 'Luxor Event Space',
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send marketing email.'
    console.error('Luxor marketing email send failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
