import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorZohoMessageDetail } from '@/lib/zohoMailServer'
import { getMarketingCampaignDetail } from '@/lib/luxorMarketingServer'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Message ID is required.' }, { status: 400 })
    }

    // Check if it's a marketing campaign message ID
    if (id.startsWith('campaign-')) {
      const campaignId = id.replace(/^campaign-/, '')
      const report = await getMarketingCampaignDetail(campaignId)
      if (!report) {
        return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
      }

      const campaign = report.campaign
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #27272a; line-height: 1.6;">
          <div style="background: #09090b; padding: 24px; border-radius: 12px; border: 1px solid rgba(202, 162, 76, 0.2); color: #ffffff; margin-bottom: 24px;">
            <p style="text-transform: uppercase; font-size: 10px; font-weight: 900; letter-spacing: 0.2em; color: #caa24c; margin: 0 0 8px 0;">Marketing Campaign Blast</p>
            <h2 style="font-size: 20px; font-weight: bold; margin: 0 0 8px 0;">${campaign.name}</h2>
            <p style="font-size: 13px; color: #a1a1aa; margin: 0;">Subject: ${campaign.subject}</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; text-align: center;">
            <div style="background: #f4f4f5; padding: 12px; border-radius: 8px;">
              <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #71717a;">Recipients</div>
              <div style="font-size: 16px; font-weight: bold; font-family: monospace;">${campaign.recipient_count}</div>
            </div>
            <div style="background: #f4f4f5; padding: 12px; border-radius: 8px;">
              <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #71717a;">Sent</div>
              <div style="font-size: 16px; font-weight: bold; font-family: monospace;">${campaign.sent_count}</div>
            </div>
            <div style="background: #ecfdf5; padding: 12px; border-radius: 8px;">
              <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #059669;">Open Rate</div>
              <div style="font-size: 16px; font-weight: bold; font-family: monospace; color: #059669;">${campaign.open_rate}%</div>
            </div>
            <div style="background: #eff6ff; padding: 12px; border-radius: 8px;">
              <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #2563eb;">Click Rate</div>
              <div style="font-size: 16px; font-weight: bold; font-family: monospace; color: #2563eb;">${campaign.click_rate}%</div>
            </div>
          </div>
          <div style="padding: 20px; border: 1px solid #e4e4e7; border-radius: 8px; background: #ffffff;">
            <h4 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a;">Audience Target</h4>
            <p style="margin: 0; font-size: 14px;">Audience: <strong>${campaign.audience_label || 'All Contacts'}</strong></p>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #71717a;">Sent date: ${campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : 'Scheduled / Sending'}</p>
          </div>
        </div>
      `

      return NextResponse.json({
        id,
        subject: campaign.subject || campaign.name,
        from: 'booking@luxoratlaspalmas.com',
        to: campaign.audience_label || 'Subscriber List',
        receivedAt: campaign.sent_at || campaign.created_at,
        content: `Campaign Blast: ${campaign.name}\nSubject: ${campaign.subject}\nAudience: ${campaign.audience_label}\nSent: ${campaign.sent_count} | Opens: ${campaign.open_count} (${campaign.open_rate}%) | Clicks: ${campaign.click_count} (${campaign.click_rate}%)`,
        htmlContent: htmlBody,
        hasAttachment: false,
        direction: 'campaign',
      })
    }

    // Otherwise fetch from Zoho Mail API
    const folderId = new URL(request.url).searchParams.get('folderId') || undefined
    const detail = await getLuxorZohoMessageDetail(id, folderId)
    if (!detail) {
      return NextResponse.json(
        { error: 'Zoho could not retrieve this email body. Refresh the mailbox and try again.' },
        { status: 502 },
      )
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('Error fetching email message detail:', error)
    return NextResponse.json({ error: 'Failed to fetch email message detail.' }, { status: 500 })
  }
}
