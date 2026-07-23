import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorZohoInbox, listLuxorZohoMessagesForAddress, listLuxorZohoSentMessages } from '@/lib/zohoMailServer'
import { listMarketingCampaigns, type MarketingCampaignSummary } from '@/lib/luxorMarketingServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get('limit') || '50', 10)
    const email = searchParams.get('email') || ''
    const folder = (searchParams.get('folder') || 'all').toLowerCase()
    const safeLimit = Number.isFinite(limit) ? limit : 50

    if (email) {
      const messages = await listLuxorZohoMessagesForAddress(email, safeLimit)
      return NextResponse.json({
        mailbox: session.mailboxAddress || session.email,
        email,
        folder,
        messages,
      })
    }

    const messages: Array<{
      id: string
      subject: string
      from: string
      to: string
      receivedAt: string | null
      summary: string
      hasAttachment: boolean
      direction: 'incoming' | 'outgoing' | 'campaign'
      folder: 'inbox' | 'sent' | 'campaigns'
      category?: string
    }> = []

    // Fetch inbox messages if applicable
    if (folder === 'inbox' || folder === 'all') {
      try {
        const inboxItems = await listLuxorZohoInbox(safeLimit)
        inboxItems.forEach((msg) => {
          messages.push({
            ...msg,
            direction: 'incoming',
            folder: 'inbox',
          })
        })
      } catch (err) {
        console.warn('Failed to load Zoho inbox messages:', err)
      }
    }

    // Fetch sent messages if applicable
    if (folder === 'sent' || folder === 'all') {
      try {
        const sentItems = await listLuxorZohoSentMessages(safeLimit)
        sentItems.forEach((msg) => {
          messages.push({
            ...msg,
            direction: 'outgoing',
            folder: 'sent',
          })
        })
      } catch (err) {
        console.warn('Failed to load Zoho sent messages:', err)
      }
    }

    // Fetch marketing campaign emails if applicable
    if (folder === 'campaigns' || folder === 'sent' || folder === 'all') {
      try {
        const campaigns = await listMarketingCampaigns(25)
        campaigns.forEach((camp: MarketingCampaignSummary) => {
          messages.push({
            id: `campaign-${camp.id}`,
            subject: camp.subject || camp.name,
            from: 'booking@luxoratlaspalmas.com',
            to: camp.audience_label || `${camp.recipient_count} Recipients`,
            receivedAt: camp.sent_at || camp.created_at,
            summary: `Marketing Campaign Blast: ${camp.name}. ${camp.sent_count} sent, ${camp.open_count} opens, ${camp.click_count} clicks.`,
            hasAttachment: false,
            direction: 'campaign',
            folder: 'campaigns',
            category: 'Marketing Blast',
          })
        })
      } catch (err) {
        console.warn('Failed to load marketing campaigns for email client:', err)
      }
    }

    // Sort by date descending
    messages.sort((a, b) => {
      const timeA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0
      const timeB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0
      return timeB - timeA
    })

    return NextResponse.json({
      mailbox: session.mailboxAddress || session.email,
      folder,
      messages: messages.slice(0, safeLimit),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch email inbox.'
    const scopeError = message.includes('INVALID_OAUTHSCOPE')

    return NextResponse.json(
      {
        error: scopeError
          ? 'Zoho needs to be reconnected with email search permission before client email history can load.'
          : message,
        reconnectRequired: scopeError,
      },
      { status: scopeError ? 403 : 500 },
    )
  }
}

