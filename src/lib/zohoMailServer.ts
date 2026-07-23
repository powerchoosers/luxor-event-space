import 'server-only'

import { decodeHtmlEntities } from './luxorTextUtils'

type ZohoTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type ZohoSendResponse = {
  data?: {
    messageId?: string
    message_id?: string
  }
}

type ZohoCalendarEventResponse = {
  events?: Array<{
    id?: string
    uid?: string
    viewEventURL?: string
  }>
}

type ZohoMessageSummary = {
  messageId?: string
  message_id?: string
  subject?: string
  fromAddress?: string
  sender?: string
  toAddress?: string
  ccAddress?: string
  receivedTime?: string
  receivedtime?: string
  sentDateInGMT?: string
  summary?: string
  hasAttachment?: boolean
  folderId?: string
  threadId?: string
  status?: string
}

export type LuxorZohoMessage = {
  id: string
  threadId: string
  folderId: string
  subject: string
  from: string
  to: string
  cc: string
  receivedAt: string | null
  summary: string
  content?: string
  htmlContent?: string | null
  hasAttachment: boolean
  isRead?: boolean
  direction?: 'incoming' | 'outgoing'
}

const DEFAULT_LOGIN_EMAIL = 'booking@luxoratlaspalmas.com'
const DEFAULT_ALLOWED_SENDERS = ['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com']

let cachedAccessToken: { token: string; expiresAt: number } | null = null
let cachedCalendarUid: string | null = null

function getZohoConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const accountId = process.env.ZOHO_ACCOUNT_ID
  const accountsServer = (process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com').replace(/\/$/, '')
  const baseUrl = (process.env.ZOHO_BASE_URL || 'https://mail.zoho.com/api/v1').replace(/\/$/, '')
  const calendarBaseUrl = (process.env.ZOHO_CALENDAR_BASE_URL || 'https://calendar.zoho.com/api/v1').replace(/\/$/, '')
  const calendarUid = (process.env.LUXOR_ZOHO_CALENDAR_UID || '').trim()
  const loginEmail = (process.env.LUXOR_ZOHO_LOGIN_EMAIL || DEFAULT_LOGIN_EMAIL).toLowerCase()
  const allowedSenders = (process.env.LUXOR_ZOHO_ALLOWED_SENDERS || DEFAULT_ALLOWED_SENDERS.join(','))
    .split(',')
    .map((sender) => sender.trim().toLowerCase())
    .filter(Boolean)

  if (!clientId || !clientSecret || !refreshToken || !accountId) {
    throw new Error('Missing Zoho email credentials. Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, and ZOHO_ACCOUNT_ID.')
  }

  return { clientId, clientSecret, refreshToken, accountId, accountsServer, baseUrl, calendarBaseUrl, calendarUid, loginEmail, allowedSenders }
}

export function normalizeEmailAddress(value: unknown) {
  const raw = String(value || '').trim().toLowerCase()
  const match = raw.match(/<\s*([^>]+)\s*>/)
  const email = (match?.[1] || raw).trim()

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

async function getZohoAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }

  const { clientId, clientSecret, refreshToken, accountsServer } = getZohoConfig()
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const response = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const tokenData = (await response.json().catch(() => ({}))) as ZohoTokenResponse

  if (!response.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || `Zoho token refresh failed with ${response.status}.`)
  }

  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + ((tokenData.expires_in || 3600) - 300) * 1000,
  }

  return cachedAccessToken.token
}

function plainTextToHtml(content: string) {
  const body = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')

  const siteBaseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    'https://luxoratlaspalmas.com'
  ).replace(/\/$/, '')

  return `${body}
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(202,162,76,0.25);text-align:center;font-family:Arial,sans-serif;color:#6f624f;">
      <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.12em;color:#a8792f;text-transform:uppercase;">Luxor</p>
      <p style="margin:0;font-size:12px;line-height:1.8;">
        803 Castroville Rd #402, San Antonio, TX 78237<br />
        <a href="mailto:booking@luxoratlaspalmas.com" style="color:#a8792f;text-decoration:none;">booking@luxoratlaspalmas.com</a><br />
        <a href="https://luxoratlaspalmas.com" style="color:#a8792f;text-decoration:none;">luxoratlaspalmas.com</a>
      </p>
      <p style="margin:18px 0 0;">
        <a href="https://www.instagram.com/luxoratlaspalmas?utm_source=qr" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${siteBaseUrl}/social-instagram.png" width="24" height="24" alt="Instagram" style="display:block;width:24px;height:24px;border:0;" /></a>
        <a href="https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${siteBaseUrl}/social-facebook.png" width="24" height="24" alt="Facebook" style="display:block;width:24px;height:24px;border:0;" /></a>
        <a href="https://www.tiktok.com/@luxoratlaspalmas?_r=1&amp;_t=ZT-97vnzmYjFUM" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${siteBaseUrl}/social-tiktok.png" width="24" height="24" alt="TikTok" style="display:block;width:24px;height:24px;border:0;" /></a>
      </p>
    </div>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeZohoDate(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const numeric = Number(raw)
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function zohoBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
}

export async function sendLuxorZohoEmail(input: {
  to: string
  subject: string
  content: string
  from?: string
  fromName?: string
  attachments?: Array<{ filename: string; content: Uint8Array; contentType?: string }>
}) {
  const { accountId, baseUrl, allowedSenders, loginEmail } = getZohoConfig()
  const to = normalizeEmailAddress(input.to)
  const from = normalizeEmailAddress(input.from) || loginEmail
  const subject = input.subject.trim()
  const content = input.content.trim()

  if (!to) throw new Error('Please add a valid recipient email address.')
  if (!subject) throw new Error('Please add an email subject.')
  if (!content) throw new Error('Please add an email message.')
  if (!allowedSenders.includes(from)) {
    throw new Error(`Sender must be one of: ${allowedSenders.join(', ')}.`)
  }

  const accessToken = await getZohoAccessToken()
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content)

  const uploadAttachments = async () => {
    const uploaded = []
    for (const attachment of input.attachments || []) {
      const uploadResponse = await fetch(
        `${baseUrl}/accounts/${accountId}/messages/attachments?fileName=${encodeURIComponent(attachment.filename)}&isInline=false`,
        {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from(attachment.content),
        },
      )
      const uploadText = await uploadResponse.text()
      if (!uploadResponse.ok) throw new Error(`Zoho attachment upload failed with ${uploadResponse.status}: ${uploadText}`)
      const upload = uploadText ? JSON.parse(uploadText) as { data?: { storeName?: string; attachmentName?: string; attachmentPath?: string } } : {}
      if (!upload.data?.storeName || !upload.data.attachmentName || !upload.data.attachmentPath) {
        throw new Error('Zoho did not return attachment details.')
      }
      uploaded.push({
        storeName: upload.data.storeName,
        attachmentName: upload.data.attachmentName,
        attachmentPath: upload.data.attachmentPath,
      })
    }
    return uploaded
  }

  let response: Response | null = null
  let resultText = ''
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // Zoho attachment references are temporary. A fresh upload on retry avoids
    // reusing a reference that its mail service may have already consumed.
    const uploadedAttachments = await uploadAttachments()
    const payload = {
      // Zoho's documented contract calls for the authenticated mailbox address.
      // The mailbox's configured display name is applied by Zoho.
      fromAddress: from,
      toAddress: to,
      subject,
      content: looksLikeHtml ? content : plainTextToHtml(content),
      mailFormat: 'html',
      ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {}),
    }
    response = await fetch(`${baseUrl}/accounts/${accountId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    resultText = await response.text()
    if (response.ok) break

    if (response.status === 401) cachedAccessToken = null
    const retryable = response.status >= 500 && response.status <= 504
    if (!retryable || attempt === 2) {
      throw new Error(`Zoho send failed with ${response.status}: ${resultText}`)
    }

    console.warn('[zoho-mail] transient send failure; retrying once', {
      status: response.status,
      hasAttachments: Boolean(input.attachments?.length),
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  if (!response?.ok) throw new Error('Zoho send failed without a response.')

  const result = resultText ? (JSON.parse(resultText) as ZohoSendResponse) : {}

  return {
    messageId: result.data?.messageId || result.data?.message_id || null,
    from,
    to,
  }
}

export async function createLuxorZohoCalendarEvent(input: {
  attendeeEmail: string
  title: string
  description: string
  location: string
  startUtc: string
  endUtc: string
  timezone?: string
  existingEventUid?: string | null
}) {
  const attendeeEmail = normalizeEmailAddress(input.attendeeEmail)
  if (!attendeeEmail) throw new Error('Please add a valid attendee email address.')

  const { calendarBaseUrl, calendarUid } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const resolvedCalendarUid = await getZohoCalendarUid(accessToken, calendarBaseUrl, calendarUid)
  const eventData = {
    title: input.title.trim(),
    dateandtime: {
      start: formatZohoUtcDateTime(input.startUtc),
      end: formatZohoUtcDateTime(input.endUtc),
      timezone: input.timezone || 'America/Chicago',
    },
    isallday: false,
    isprivate: true,
    location: input.location.trim(),
    description: input.description.trim().slice(0, 10_000),
    attendees: [{ email: attendeeEmail, permission: 1, attendance: 1 }],
    notify_attendee: 2,
    allowForwarding: true,
    transparency: 0,
  }

  const eventPath = input.existingEventUid
    ? `/calendars/${encodeURIComponent(resolvedCalendarUid)}/events/${encodeURIComponent(input.existingEventUid)}`
    : `/calendars/${encodeURIComponent(resolvedCalendarUid)}/events`
  const response = await fetch(
    `${calendarBaseUrl}${eventPath}?eventdata=${encodeURIComponent(JSON.stringify(eventData))}`,
    {
      method: input.existingEventUid ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  )
  const resultText = await response.text()

  if (!response.ok) {
    if (response.status === 401) cachedAccessToken = null
    throw new Error(`Zoho calendar invite failed with ${response.status}: ${resultText}`)
  }

  const result = resultText ? JSON.parse(resultText) as ZohoCalendarEventResponse : {}
  const event = result.events?.[0]
  if (!event?.uid && !event?.id) throw new Error('Zoho Calendar did not return an event ID.')

  return {
    eventId: event.id || null,
    eventUid: event.uid || null,
    viewEventUrl: event.viewEventURL || null,
  }
}

async function getZohoCalendarUid(accessToken: string, calendarBaseUrl: string, configuredUid: string) {
  if (configuredUid) return configuredUid
  if (cachedCalendarUid) return cachedCalendarUid

  const response = await fetch(`${calendarBaseUrl}/calendars?category=own`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const resultText = await response.text()
  if (!response.ok) {
    if (response.status === 401) cachedAccessToken = null
    throw new Error(`Zoho calendar lookup failed with ${response.status}: ${resultText}`)
  }

  const result = resultText ? JSON.parse(resultText) as { calendars?: Array<{ uid?: string; isdefault?: boolean }> } : {}
  const calendar = result.calendars?.find((item) => item.isdefault) || result.calendars?.[0]
  if (!calendar?.uid) throw new Error('Zoho did not return a writable Calendar ID.')
  cachedCalendarUid = calendar.uid
  return calendar.uid
}

function formatZohoUtcDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('The tour date or time is invalid.')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export async function listLuxorZohoInbox(limit = 25) {
  const { accountId, baseUrl } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 50)),
  })

  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
    cache: 'no-store',
  })

  const resultText = await response.text()

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null
    }

    throw new Error(`Zoho inbox fetch failed with ${response.status}: ${resultText}`)
  }

  const result = resultText ? JSON.parse(resultText) as { data?: ZohoMessageSummary[] } : {}

  return (result.data || []).map((message) => ({
    id: message.messageId || message.message_id || '',
    threadId: message.threadId || message.messageId || message.message_id || '',
    folderId: message.folderId || '',
    subject: decodeHtmlEntities(message.subject) || '(No subject)',
    from: message.fromAddress || message.sender || 'Unknown sender',
    to: message.toAddress || '',
    receivedAt: normalizeZohoDate(message.receivedTime || message.receivedtime || message.sentDateInGMT),
    summary: decodeHtmlEntities(message.summary),
    hasAttachment: zohoBoolean(message.hasAttachment),
    isRead: String(message.status || '') === '1',
  }))
}

export async function listLuxorZohoSentMessages(limit = 50) {
  const { accountId, baseUrl, allowedSenders } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const primarySender = allowedSenders[0] || 'booking@luxoratlaspalmas.com'
  const params = new URLSearchParams({
    searchKey: `sender:${primarySender}`,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    start: '1',
    includeto: 'true',
  })

  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/search?${params.toString()}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const resultText = await response.text()

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null
    }
    throw new Error(`Zoho sent messages fetch failed with ${response.status}: ${resultText}`)
  }

  const result = resultText ? (JSON.parse(resultText) as { data?: ZohoMessageSummary[] }) : {}

  return (result.data || []).map((message) => ({
    id: message.messageId || message.message_id || '',
    threadId: message.threadId || message.messageId || message.message_id || '',
    folderId: message.folderId || '',
    subject: decodeHtmlEntities(message.subject) || '(No subject)',
    from: message.fromAddress || message.sender || primarySender,
    to: message.toAddress || '',
    cc: message.ccAddress || '',
    receivedAt: normalizeZohoDate(message.receivedTime || message.receivedtime || message.sentDateInGMT),
    summary: decodeHtmlEntities(message.summary),
    hasAttachment: zohoBoolean(message.hasAttachment),
    direction: 'outgoing' as const,
    isRead: true,
  }))
}

export async function getLuxorZohoMessageDetail(messageId: string, folderId?: string) {
  if (!messageId) return null
  const { accountId, baseUrl, allowedSenders } = getZohoConfig()
  const accessToken = await getZohoAccessToken()

  // Helper to parse a Zoho message data payload into our detail shape
  function parseMessageData(data: Record<string, unknown>, content: string) {
    const direction = allowedSenders.includes(normalizeEmailAddress(data.fromAddress as string || data.sender as string || ''))
      ? 'outgoing' as const
      : 'incoming' as const
    return {
      id: messageId,
      threadId: String(data.threadId || messageId),
      folderId: String(data.folderId || folderId || ''),
      subject: decodeHtmlEntities(String(data.subject || '')) || '(No subject)',
      from: String(data.fromAddress || data.sender || ''),
      to: String(data.toAddress || ''),
      cc: String(data.ccAddress || ''),
      receivedAt: normalizeZohoDate(data.receivedTime || data.receivedtime || data.sentDateInGMT),
      content,
      htmlContent: content,
      hasAttachment: zohoBoolean(data.hasAttachment),
      direction,
    }
  }

  try {
    // Strategy 1: If folderId is known, use the folder-specific endpoint which reliably returns content
    if (folderId) {
      try {
        const folderDetailRes = await fetch(
          `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/details`,
          { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
        )
        if (folderDetailRes.ok) {
          const folderResult = await folderDetailRes.json().catch(() => ({})) as { data?: Record<string, unknown> }
          const data = folderResult.data || {}

          // Also fetch full HTML content from the content sub-endpoint
          let content = String(data.content || data.summary || '')
          const contentRes = await fetch(
            `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content?includeBlockContent=true`,
            { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
          )
          if (contentRes.ok) {
            const contentData = await contentRes.json().catch(() => ({})) as { data?: { content?: string } }
            content = String(contentData.data?.content || content)
          }

          if (Object.keys(data).length > 0) {
            return parseMessageData(data, content)
          }
        }
      } catch (err) {
        console.warn('Folder-specific Zoho message fetch failed, falling back to generic view:', err)
      }
    }

    // Strategy 2: Generic /messages/view/{id} — always attempt as fallback
    const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/view/${encodeURIComponent(messageId)}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      if (response.status === 401) cachedAccessToken = null
      const errText = await response.text().catch(() => '')
      console.error(`[Zoho] getLuxorZohoMessageDetail strategy-2 failed — status ${response.status}:`, errText.slice(0, 400))
      return null
    }

    const resultText = await response.text()
    const result = resultText ? (JSON.parse(resultText) as { data?: Record<string, unknown> }) : {}
    const data = result.data || {}

    let fullContent = String(data.content || data.summary || '')

    // If we have a folderId hint from the data, try the content endpoint
    const resolvedFolderId = String(data.folderId || folderId || '')
    if (resolvedFolderId) {
      const contentResponse = await fetch(
        `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(resolvedFolderId)}/messages/${encodeURIComponent(messageId)}/content?includeBlockContent=true`,
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
      )
      if (contentResponse.ok) {
        const contentResult = await contentResponse.json().catch(() => ({})) as { data?: { content?: string } }
        fullContent = String(contentResult.data?.content || fullContent)
      } else {
        console.warn(`[Zoho] content endpoint returned ${contentResponse.status} for ${messageId}`)
      }
    }

    // Strategy 3: originalmessage endpoint — works without folderId, returns MIME source
    if (!fullContent.trim()) {
      try {
        const mimeRes = await fetch(
          `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/originalmessage`,
          { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
        )
        if (mimeRes.ok) {
          const mimeData = await mimeRes.json().catch(() => ({})) as { data?: { content?: string; htmlContent?: string } }
          fullContent = String(mimeData.data?.htmlContent || mimeData.data?.content || fullContent)
        } else {
          console.warn(`[Zoho] originalmessage returned ${mimeRes.status} for ${messageId}`)
        }
      } catch (mimeErr) {
        console.warn('[Zoho] originalmessage fallback failed:', mimeErr)
      }
    }

    return parseMessageData(data, fullContent)
  } catch (err) {
    console.error('Failed fetching Zoho message detail:', err)
    return null
  }
}

export async function listLuxorZohoMessagesForAddress(email: string, limit = 50) {
  const clientEmail = normalizeEmailAddress(email)
  if (!clientEmail) return []

  const { accountId, baseUrl } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const params = new URLSearchParams({
    searchKey: `sender:${clientEmail}::or:to:${clientEmail}`,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    start: '1',
    includeto: 'true',
  })

  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/search?${params.toString()}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const resultText = await response.text()

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null
    }

    throw new Error(`Zoho email search failed with ${response.status}: ${resultText}`)
  }

  const result = resultText ? (JSON.parse(resultText) as { data?: ZohoMessageSummary[] }) : {}
  const { allowedSenders } = getZohoConfig()

  return (result.data || []).map((message) => {
    const from = message.fromAddress || message.sender || 'Unknown sender'
    const to = message.toAddress || ''
    const fromEmail = normalizeEmailAddress(from)

    const isOurEmail = allowedSenders.includes(fromEmail)
    const direction = isOurEmail ? ('outgoing' as const) : ('incoming' as const)

    return {
      id: message.messageId || message.message_id || '',
      threadId: message.threadId || message.messageId || message.message_id || '',
      folderId: message.folderId || '',
      subject: decodeHtmlEntities(message.subject) || '(No subject)',
      from,
      to,
      cc: message.ccAddress || '',
      receivedAt: normalizeZohoDate(message.receivedTime || message.receivedtime || message.sentDateInGMT),
      summary: decodeHtmlEntities(message.summary),
      hasAttachment: zohoBoolean(message.hasAttachment),
      direction,
      isRead: direction === 'outgoing' || String(message.status || '') === '1',
    }
  })
}

export async function listLuxorZohoThread(threadId: string, limit = 50): Promise<LuxorZohoMessage[]> {
  if (!threadId.trim()) return []
  const { accountId, baseUrl, allowedSenders } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const params = new URLSearchParams({
    threadId: threadId.trim(),
    limit: String(Math.min(Math.max(limit, 1), 100)),
    includeto: 'true',
  })
  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const resultText = await response.text()
  if (!response.ok) {
    if (response.status === 401) cachedAccessToken = null
    throw new Error(`Zoho thread fetch failed with ${response.status}: ${resultText}`)
  }
  const result = resultText ? (JSON.parse(resultText) as { data?: ZohoMessageSummary[] }) : {}
  const summaries = (result.data || []).map((message) => {
    const from = message.fromAddress || message.sender || ''
    const direction = allowedSenders.includes(normalizeEmailAddress(from)) ? 'outgoing' as const : 'incoming' as const
    return {
      id: message.messageId || message.message_id || '',
      threadId: message.threadId || threadId,
      folderId: message.folderId || '',
      subject: decodeHtmlEntities(message.subject) || '(No subject)',
      from,
      to: message.toAddress || '',
      cc: message.ccAddress || '',
      receivedAt: normalizeZohoDate(message.receivedTime || message.receivedtime || message.sentDateInGMT),
      summary: decodeHtmlEntities(message.summary),
      hasAttachment: zohoBoolean(message.hasAttachment),
      isRead: direction === 'outgoing' || String(message.status || '') === '1',
      direction,
    }
  }).filter((message) => message.id)

  const detailed = await Promise.all(summaries.map(async (message) => {
    const detail = await getLuxorZohoMessageDetail(message.id, message.folderId)
    return detail ? { ...message, ...detail, direction: message.direction } : message
  }))
  return detailed.sort((a, b) => new Date(a.receivedAt || 0).getTime() - new Date(b.receivedAt || 0).getTime())
}

export async function replyLuxorZohoEmail(input: {
  messageId: string
  content: string
  to: string
  subject: string
  from?: string
}) {
  const { accountId, baseUrl, allowedSenders, loginEmail } = getZohoConfig()
  const messageId = input.messageId.trim()
  const content = input.content.trim()
  const from = normalizeEmailAddress(input.from) || loginEmail
  const to = normalizeEmailAddress(input.to)
  const subject = input.subject.trim()
  if (!messageId) throw new Error('The email being replied to is missing.')
  if (!content) throw new Error('Please add a reply message.')
  if (!to) throw new Error('The reply recipient is missing or invalid.')
  if (!subject) throw new Error('The reply subject is missing.')
  if (!allowedSenders.includes(from)) throw new Error(`Sender must be one of: ${allowedSenders.join(', ')}.`)
  const accessToken = await getZohoAccessToken()
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content)
  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fromAddress: from,
      toAddress: to,
      subject,
      content: looksLikeHtml ? content : plainTextToHtml(content),
      mailFormat: 'html',
      action: 'reply',
    }),
  })
  const resultText = await response.text()
  if (!response.ok) {
    if (response.status === 401) cachedAccessToken = null
    throw new Error(`Zoho reply failed with ${response.status}: ${resultText}`)
  }
  const result = resultText ? (JSON.parse(resultText) as ZohoSendResponse) : {}
  return {
    success: true,
    messageId: result.data?.messageId || result.data?.message_id || null,
    from,
    to,
    subject,
  }
}
