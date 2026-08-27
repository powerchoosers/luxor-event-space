import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorZohoInbox, listLuxorZohoMessagesForAddress, listLuxorZohoSentMessages } from '@/lib/zohoMailServer'
import { listMarketingCampaigns, type MarketingCampaignSummary } from '@/lib/luxorMarketingServer'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { supabaseRest } from '@/lib/supabaseRestServer'

type StoredEmailEvent = {
  id: string
  message_id: string | null
  sender_email: string | null
  sender_name: string | null
  recipient_email: string | null
  subject: string
  received_at: string
  folder_id: string | null
  body_summary: string | null
  body_cached_at: string | null
  thread_id: string | null
  resolved_id: string | null
}

type StoredEmailJob = {
  id: string
  recipient_email: string
  subject: string
  body: string
  status: string
  sent_at: string | null
  scheduled_for: string
}

function plainTextSummary(value: string) {
  return decodeHtmlEntities(value.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 280)
}

type MailboxMessageItem = {
  id: string
  threadId?: string
  subject: string
  from: string
  to: string
  receivedAt: string | null
  summary: string
  hasAttachment: boolean
  direction: 'incoming' | 'outgoing' | 'campaign'
  folder: 'inbox' | 'sent' | 'campaigns'
  isRead?: boolean
  storedLocally?: boolean
  content?: string
  htmlContent?: string
  engagement?: { openCount: number; clickCount: number }
  category?: string
}

async function listStoredMailboxMessages(limit: number, email?: string): Promise<MailboxMessageItem[]> {
  const normalizedEmail = email?.trim().toLowerCase() || ''
  const eventFilter = normalizedEmail
    ? `&or=(sender_email.eq.${encodeURIComponent(normalizedEmail)},recipient_email.eq.${encodeURIComponent(normalizedEmail)})`
    : ''
  const jobFilter = normalizedEmail
    ? `&recipient_email=eq.${encodeURIComponent(normalizedEmail)}`
    : ''

  const [events, jobs] = await Promise.all([
    supabaseRest<StoredEmailEvent[]>(
      `luxor_email_events?select=id,message_id,sender_email,sender_name,recipient_email,subject,received_at,folder_id:metadata->>folderId,body_summary:metadata->cachedMessage->>summary,body_cached_at:metadata->>cachedAt,thread_id:metadata->cachedMessage->>threadId,resolved_id:metadata->cachedMessage->>id${eventFilter}&order=received_at.desc&limit=${limit}`,
    ),
    supabaseRest<StoredEmailJob[]>(
      `luxor_email_jobs?select=id,recipient_email,subject,body,status,sent_at,scheduled_for${jobFilter}&status=in.(sent,sending)&order=sent_at.desc.nullslast&limit=${limit}`,
    ),
  ])

  const messages = [
    ...events.map((event) => ({
      id: event.resolved_id || event.message_id || `event-${event.id}`,
      threadId: event.thread_id || undefined,
      folderId: event.folder_id || undefined,
      subject: decodeHtmlEntities(event.subject) || '(No subject)',
      from: event.sender_name
        ? `${event.sender_name}${event.sender_email ? ` <${event.sender_email}>` : ''}`
        : event.sender_email || 'Unknown sender',
      to: event.recipient_email || '',
      receivedAt: event.received_at,
      summary: event.body_summary || (event.body_cached_at ? 'No text preview.' : 'Email body awaiting sync.'),
      hasAttachment: false,
      direction: 'incoming' as const,
      folder: 'inbox' as const,
      isRead: false,
      storedLocally: true,
    })),
    ...jobs.map((job) => ({
      id: `job-${job.id}`,
      threadId: undefined,
      subject: decodeHtmlEntities(job.subject) || '(No subject)',
      from: 'booking@luxoratlaspalmas.com',
      to: job.recipient_email,
      receivedAt: job.sent_at || job.scheduled_for,
      summary: plainTextSummary(job.body),
      hasAttachment: false,
      direction: 'outgoing' as const,
      folder: 'sent' as const,
      isRead: true,
      storedLocally: true,
    })),
  ].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  // A repaired legacy webhook and a direct reader fetch may reference the same
  // provider email. Keep both database records, but show only one mailbox item.
  return Array.from(new Map(messages.map((message) => [message.id, message])).values()).slice(0, limit)
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get('limit') || '1000', 10)
    const email = searchParams.get('email') || ''
    const folder = (searchParams.get('folder') || 'all').toLowerCase()
    const live = searchParams.get('live') === '1'
    const source = searchParams.get('source') || 'email-client'
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 1000, 1), 1000)

    console.log(JSON.stringify({
      level: 'info',
      message: live ? 'Zoho mailbox request started' : 'Stored mailbox request started',
      route: '/api/email/inbox',
      requestId,
      source,
      provider: live ? 'zoho' : 'supabase',
      folder,
      addressLookup: Boolean(email),
    }))

    if (email && !live) {
      const messages = await listStoredMailboxMessages(safeLimit, email)
      return NextResponse.json({
        mailbox: session.mailboxAddress || session.email,
        email,
        folder,
        source: 'supabase',
        messages,
      })
    }

    if (email) {
      const messages = await listLuxorZohoMessagesForAddress(email, safeLimit)
      return NextResponse.json({
        mailbox: session.mailboxAddress || session.email,
        email,
        folder,
        messages,
      })
    }

    if (!live) {
      const messages = await listStoredMailboxMessages(safeLimit)
      const campaigns = await listMarketingCampaigns(25).catch(() => [])
      campaigns.forEach((camp) => {
        messages.push({
          id: `campaign-${camp.id}`,
          subject: decodeHtmlEntities(camp.subject || camp.name),
          from: 'booking@luxoratlaspalmas.com',
          to: camp.audience_label || `${camp.recipient_count} Recipients`,
          receivedAt: camp.sent_at || camp.created_at,
          summary: `Marketing Campaign Blast: ${camp.name}. ${camp.sent_count} sent, ${camp.open_count} opens, ${camp.click_count} clicks.`,
          hasAttachment: false,
          direction: 'campaign',
          folder: 'campaigns',
          isRead: true,
          storedLocally: true,
        })
      })
      messages.sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())
      return NextResponse.json({
        mailbox: session.mailboxAddress || session.email,
        folder,
        source: 'supabase',
        messages: messages.slice(0, safeLimit),
      })
    }

    const messages: Array<{
      id: string
      threadId?: string
      folderId?: string
      subject: string
      from: string
      to: string
      receivedAt: string | null
      summary: string
      hasAttachment: boolean
      engagement?: { openCount: number; clickCount: number }
      direction: 'incoming' | 'outgoing' | 'campaign'
      folder: 'inbox' | 'sent' | 'campaigns'
      category?: string
      isRead?: boolean
    }> = []
    let zohoMailboxAttempts = 0
    let zohoMailboxFailures = 0
    let firstZohoMailboxError: unknown = null

    // Fetch inbox messages if applicable
    if (folder === 'inbox' || folder === 'all') {
      zohoMailboxAttempts += 1
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
        zohoMailboxFailures += 1
        firstZohoMailboxError ||= err
        console.warn('Failed to load Zoho inbox messages:', err)
      }
    }

    // Fetch sent messages if applicable
    if (folder === 'sent' || folder === 'all') {
      zohoMailboxAttempts += 1
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
        zohoMailboxFailures += 1
        firstZohoMailboxError ||= err
        console.warn('Failed to load Zoho sent messages:', err)
      }
    }

    // Do not return a successful-but-empty mailbox when Zoho failed entirely.
    // The client can then keep showing its last known-good mailbox instead of wiping the UI.
    if (zohoMailboxAttempts > 0 && zohoMailboxFailures === zohoMailboxAttempts) {
      throw firstZohoMailboxError instanceof Error
        ? firstZohoMailboxError
        : new Error('Zoho Mail is temporarily unavailable.')
    }

    // Fetch marketing campaign emails if applicable
    if (folder === 'campaigns' || folder === 'sent' || folder === 'all') {
      try {
        const campaigns = await listMarketingCampaigns(25)
        campaigns.forEach((camp: MarketingCampaignSummary) => {
          messages.push({
            id: `campaign-${camp.id}`,
            subject: decodeHtmlEntities(camp.subject || camp.name),
            from: 'booking@luxoratlaspalmas.com',
            to: camp.audience_label || `${camp.recipient_count} Recipients`,
            receivedAt: camp.sent_at || camp.created_at,
            summary: `Marketing Campaign Blast: ${camp.name}. ${camp.sent_count} sent, ${camp.open_count} opens, ${camp.click_count} clicks.`,
            hasAttachment: false,
            engagement: { openCount: Number(camp.open_count || 0), clickCount: Number(camp.click_count || 0) },
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

    console.log(JSON.stringify({
      level: 'info',
      message: 'Zoho mailbox request completed',
      route: '/api/email/inbox',
      requestId,
      source,
      folder,
      messageCount: Math.min(messages.length, safeLimit),
      durationMs: Date.now() - startedAt,
    }))

    return NextResponse.json({
      mailbox: session.mailboxAddress || session.email,
      folder,
      messages: messages.slice(0, safeLimit),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch email inbox.'
    const scopeError = message.includes('INVALID_OAUTHSCOPE')
    const rateLimited = /too many requests|rate.?limit|briefly rate limiting/i.test(message)

    console.error(JSON.stringify({
      level: rateLimited ? 'warning' : 'error',
      message: 'Zoho mailbox request failed',
      route: '/api/email/inbox',
      requestId,
      rateLimited,
      durationMs: Date.now() - startedAt,
    }))

    return NextResponse.json(
      {
        error: scopeError
          ? 'Zoho needs to be reconnected with email search permission before client email history can load.'
          : rateLimited
            ? 'Zoho is briefly pacing mailbox requests. Your saved emails will stay visible while sync cools down.'
            : message,
        reconnectRequired: scopeError,
      },
      {
        status: scopeError ? 403 : rateLimited ? 503 : 500,
        headers: rateLimited ? { 'Retry-After': '30' } : undefined,
      },
    )
  }
}
