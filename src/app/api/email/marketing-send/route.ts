import { NextRequest, NextResponse } from 'next/server'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { recordLuxorTestEmailSimulation } from '@/lib/luxorTestLeadServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID, LUXOR_TEST_IDENTIFICATION_EMAIL } from '@/lib/luxorTestLeadPolicy'
import { supabaseRest } from '@/lib/supabaseRestServer'

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

    if (to.trim().toLowerCase() === LUXOR_TEST_IDENTIFICATION_EMAIL) {
      const [lead] = await supabaseRest<Array<{ id: string; is_test: boolean }>>(`luxor_inquiries?select=id,is_test&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&limit=1`)
      if (lead?.is_test) {
        const simulation = await recordLuxorTestEmailSimulation({ inquiryId: lead.id, category: 'direct_message', subject, source: '/api/email/marketing-send' })
        if (!simulation) return NextResponse.json({ error: 'Test workflow is unavailable for email simulation.' }, { status: 409 })
        return NextResponse.json({ success: true, simulated: true, recipient: LUXOR_TEST_IDENTIFICATION_EMAIL, providerStatus: 'not_attempted', deliveryStatus: 'unknown', simulation })
      }
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
