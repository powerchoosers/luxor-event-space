import { NextRequest, NextResponse } from 'next/server'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { instrumentMarketingHtml } from '@/lib/luxorMarketingServer'
import { LuxorMarketingCampaign, LuxorMarketingRecipient } from '@/lib/luxorInquiryTypes'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, content, from, fromName, track, campaignName } = body

    let finalContent = content
    let trackingToken = ''

    if (track) {
      // 1. Generate unique tracking token
      trackingToken = crypto.randomBytes(18).toString('base64url')

      // 2. Create one-off campaign in luxor_marketing_campaigns
      const [campaign] = await supabaseRest<LuxorMarketingCampaign[]>('luxor_marketing_campaigns?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          name: campaignName || `Direct Email: ${subject}`,
          subject: subject,
          html_body: content,
          status: 'sent',
          audience_label: 'Direct Message',
          scheduled_for: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          recipient_count: 1,
          metadata: { direct_message: true, sent_by: session.email }
        }),
      })

      if (!campaign) {
        throw new Error('Failed to register email tracking campaign.')
      }

      // 3. Create recipient record in luxor_marketing_recipients
      const [recipient] = await supabaseRest<LuxorMarketingRecipient[]>('luxor_marketing_recipients?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          campaign_id: campaign.id,
          email: String(to || '').trim().toLowerCase(),
          name: fromName || null,
          status: 'sent',
          tracking_token: trackingToken,
          sent_at: new Date().toISOString(),
          metadata: { direct_message: true }
        }),
      })

      if (!recipient) {
        throw new Error('Failed to register email tracking recipient.')
      }

      // 4. Instrument HTML content with open/click tracking token
      finalContent = instrumentMarketingHtml(content, trackingToken)
    }

    const result = await sendLuxorZohoEmail({
      to: String(to || ''),
      subject: String(subject || ''),
      content: String(finalContent || ''),
      from: typeof from === 'string' ? from : undefined,
      fromName: typeof fromName === 'string' ? fromName : undefined,
    })

    return NextResponse.json({ success: true, ...result, trackingToken })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email.'
    const missingConfig = message.includes('Missing Zoho email credentials')

    console.error('Luxor Zoho email send failed:', message)
    return NextResponse.json({ error: message }, { status: missingConfig ? 500 : 400 })
  }
}
