import { NextRequest, NextResponse } from 'next/server'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { instrumentMarketingHtml } from '@/lib/luxorMarketingServer'
import { buildConversationalEmailHtml } from '@/lib/luxorConversationalEmailServer'
import { LuxorMarketingCampaign, LuxorMarketingRecipient } from '@/lib/luxorInquiryTypes'
import crypto from 'crypto'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { getPublicLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, content, from, track, campaignName, format, recipientName, contentMode } = body
    const [senderProfile, senderPhone] = await Promise.all([
      getLuxorUserProfile(session.email),
      getPublicLuxorPhoneNumber(),
    ])
    const signatureEmail = typeof from === 'string' && from.trim()
      ? from.trim().toLowerCase()
      : session.mailboxAddress || senderProfile.email

    let finalContent = String(content || '')

    // Convert plain text or explicitly requested conversational format to HTML
    if (format === 'conversational' || (!finalContent.toLowerCase().includes('<!doctype html') && !finalContent.toLowerCase().includes('<html'))) {
      finalContent = buildConversationalEmailHtml({
        to: String(to || ''),
        recipientName: typeof recipientName === 'string' ? recipientName : undefined,
        subject: String(subject || ''),
        body: finalContent,
        bodyHtml: contentMode === 'rich' ? finalContent : undefined,
        senderName: senderProfile.displayName,
        senderRole: senderProfile.roleTitle,
        senderEmail: signatureEmail,
        senderPhone,
        senderImageUrl: senderProfile.avatarUrl,
      })
    }
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
          html_body: finalContent,
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
          name: typeof recipientName === 'string' ? recipientName : null,
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
      finalContent = instrumentMarketingHtml(finalContent, trackingToken)
    }

    const result = await sendLuxorZohoEmail({
      to: String(to || ''),
      subject: String(subject || ''),
      content: String(finalContent || ''),
      from: typeof from === 'string' ? from : undefined,
      fromName: senderProfile.displayName,
    })

    console.log(JSON.stringify({
      level: 'info',
      message: 'Zoho email send completed',
      route: '/api/email/send',
      requestId,
      tracked: Boolean(track),
      durationMs: Date.now() - startedAt,
    }))

    return NextResponse.json({ success: true, ...result, trackingToken })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email.'
    const missingConfig = message.includes('Missing Zoho email credentials')
    const rateLimited = /too many requests|rate.?limit|429/i.test(message)

    console.error(JSON.stringify({
      level: rateLimited ? 'warning' : 'error',
      message: 'Zoho email send failed',
      route: '/api/email/send',
      requestId,
      rateLimited,
      durationMs: Date.now() - startedAt,
    }))

    if (rateLimited) {
      return NextResponse.json(
        {
          error: 'Zoho is temporarily pacing email activity. Your draft is safe—please wait about a minute before sending again.',
          code: 'ZOHO_RATE_LIMITED',
          retryAfterSeconds: 60,
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }

    return NextResponse.json({ error: message }, { status: missingConfig ? 500 : 400 })
  }
}
