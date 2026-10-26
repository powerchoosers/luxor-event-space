import { NextRequest, NextResponse } from 'next/server'
import { isLuxorZohoAuthorizationError, normalizeEmailAddress, sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { instrumentMarketingHtml } from '@/lib/luxorMarketingServer'
import { buildConversationalEmailHtml } from '@/lib/luxorConversationalEmailServer'
import { LuxorMarketingCampaign, LuxorMarketingRecipient } from '@/lib/luxorInquiryTypes'
import crypto from 'crypto'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { getPublicLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { recordLuxorTestEmailSimulation } from '@/lib/luxorTestLeadServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID, LUXOR_TEST_IDENTIFICATION_EMAIL } from '@/lib/luxorTestLeadPolicy'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, content, from, track, campaignName, format, recipientName, contentMode, inquiryId } = body
    const requestedIdempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
    const idempotencyKey = /^manual\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedIdempotencyKey)
      ? requestedIdempotencyKey
      : `manual/${crypto.randomUUID()}`
    const normalizedRecipient = typeof to === 'string' ? to.trim().toLowerCase() : ''
    // Only the permanent test lead is routed to the simulation. A normal
    // inquiryId is context for recipient verification, not a test-lead flag.
    const testLeadId = inquiryId === LUXOR_PERMANENT_TEST_LEAD_ID
      ? LUXOR_PERMANENT_TEST_LEAD_ID
      : !inquiryId && normalizedRecipient === LUXOR_TEST_IDENTIFICATION_EMAIL
        ? LUXOR_PERMANENT_TEST_LEAD_ID
        : ''
    if (testLeadId) {
      const inquiry = await getLuxorInquiry(testLeadId)
      if (inquiry?.is_test === true) {
        const simulation = await recordLuxorTestEmailSimulation({ inquiryId: testLeadId, category: 'direct_message', subject: String(subject || ''), source: '/api/email/send' })
        if (!simulation) return NextResponse.json({ error: 'The associated inquiry is not the permanent test lead.' }, { status: 409 })
        return NextResponse.json({ success: true, simulated: true, recipient: LUXOR_TEST_IDENTIFICATION_EMAIL, providerStatus: 'not_attempted', deliveryStatus: 'unknown', simulation })
      }
      return NextResponse.json({ error: 'The permanent test lead could not be verified.' }, { status: 409 })
    }
    if (typeof inquiryId === 'string' && inquiryId) {
      const inquiry = await getLuxorInquiry(inquiryId)
      const verifiedLeadEmail = normalizeEmailAddress(inquiry?.email)
      if (!inquiry || inquiry.is_test === true || !verifiedLeadEmail || verifiedLeadEmail !== normalizedRecipient) {
        return NextResponse.json({ error: 'The recipient must match the selected inquiry’s verified email address.' }, { status: 409 })
      }
    }
    const [senderProfile, senderPhone] = await Promise.all([
      getLuxorUserProfile(session.email),
      getPublicLuxorPhoneNumber(),
    ])
    const signatureEmail = typeof from === 'string' && from.trim()
      ? from.trim().toLowerCase()
      : session.mailboxAddress || senderProfile.email

    let finalContent = String(content || '')
    let trackingMetadata: Record<string, string> = {}

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
      // Derive the tracking token from the stable send key so retries produce
      // byte-identical HTML for the provider's idempotency check.
      trackingToken = crypto.createHash('sha256').update(`luxor-direct-email:${idempotencyKey}`).digest('base64url').slice(0, 24)
      const sourcePayloadHash = crypto.createHash('sha256').update(JSON.stringify({
        to: normalizedRecipient,
        from: typeof from === 'string' ? from.trim().toLowerCase() : '',
        subject: String(subject || '').trim(),
        content: finalContent,
      })).digest('hex')

      const existingCampaigns = await supabaseRest<Array<Pick<LuxorMarketingCampaign, 'id' | 'metadata'>>>(
        `luxor_marketing_campaigns?select=id,metadata&metadata->>direct_email_idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
      )
      let campaign = existingCampaigns[0]
      if (campaign && campaign.metadata?.direct_email_payload_hash !== sourcePayloadHash) {
        return NextResponse.json({ error: 'This send key was already used for different email content. Review the draft and try again.' }, { status: 409 })
      }

      if (!campaign) {
        const [createdCampaign] = await supabaseRest<LuxorMarketingCampaign[]>('luxor_marketing_campaigns?select=*', {
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
            metadata: {
              direct_message: true,
              sent_by: session.email,
              direct_email_idempotency_key: idempotencyKey,
              direct_email_payload_hash: sourcePayloadHash,
            },
          }),
        })
        campaign = createdCampaign
      }

      if (!campaign) {
        throw new Error('Failed to register email tracking campaign.')
      }

      const existingRecipients = await supabaseRest<Array<Pick<LuxorMarketingRecipient, 'id' | 'tracking_token'>>>(
        `luxor_marketing_recipients?select=id,tracking_token&campaign_id=eq.${encodeURIComponent(campaign.id)}&email=eq.${encodeURIComponent(normalizedRecipient)}&limit=1`,
      )
      let recipient = existingRecipients[0]
      if (!recipient) {
        const [createdRecipient] = await supabaseRest<LuxorMarketingRecipient[]>('luxor_marketing_recipients?select=*', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            campaign_id: campaign.id,
            email: normalizedRecipient,
            name: typeof recipientName === 'string' ? recipientName : null,
            status: 'sent',
            tracking_token: trackingToken,
            sent_at: new Date().toISOString(),
            metadata: { direct_message: true, direct_email_idempotency_key: idempotencyKey },
          }),
        })
        recipient = createdRecipient
      }

      if (!recipient) {
        throw new Error('Failed to register email tracking recipient.')
      }
      trackingToken = recipient.tracking_token || trackingToken

      trackingMetadata = {
        marketingCampaignId: campaign.id,
        marketingRecipientId: recipient.id,
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
      idempotencyKey,
      metadata: trackingMetadata,
    })

    console.log(JSON.stringify({
      level: 'info',
      message: 'Luxor email send completed',
      route: '/api/email/send',
      requestId,
      tracked: Boolean(track),
      durationMs: Date.now() - startedAt,
    }))

    return NextResponse.json({ success: true, ...result, trackingToken })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email.'
    const missingConfig = message.includes('Missing RESEND_API_KEY') || message.includes('Missing Zoho email credentials')
    const rateLimited = /too many requests|rate.?limit|429/i.test(message)
    const authorizationRequired = isLuxorZohoAuthorizationError(error)

    console.error(JSON.stringify({
      level: rateLimited ? 'warning' : 'error',
      message: 'Luxor email send failed',
      route: '/api/email/send',
      requestId,
      rateLimited,
      durationMs: Date.now() - startedAt,
    }))

    if (rateLimited) {
      return NextResponse.json(
        {
          error: 'Email delivery is temporarily pacing activity. Your draft is safe—please wait about a minute before sending again.',
          code: 'MAIL_RATE_LIMITED',
          retryAfterSeconds: 60,
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }

    if (authorizationRequired) {
      return NextResponse.json(
        {
          error: 'Email delivery is not connected right now. No email was sent. Check the Luxor mail connection, then try again.',
          code: 'MAIL_AUTHORIZATION_REQUIRED',
        },
        { status: 503 },
      )
    }

    return NextResponse.json({ error: message }, { status: missingConfig ? 500 : 400 })
  }
}
