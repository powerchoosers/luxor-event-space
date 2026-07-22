import 'server-only'

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
  const fromName = input.fromName?.trim() || 'Luxor Event Space'

  if (!to) throw new Error('Please add a valid recipient email address.')
  if (!subject) throw new Error('Please add an email subject.')
  if (!content) throw new Error('Please add an email message.')
  if (!allowedSenders.includes(from)) {
    throw new Error(`Sender must be one of: ${allowedSenders.join(', ')}.`)
  }

  const accessToken = await getZohoAccessToken()
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content)
  const senderName = fromName.replace(/"/g, '')
  const uploadedAttachments = []
  for (const attachment of input.attachments || []) {
    const uploadResponse = await fetch(
      `${baseUrl}/accounts/${accountId}/messages/attachments?fileName=${encodeURIComponent(attachment.filename)}&isInline=false`,
      {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          Accept: 'application/json',
          // Zoho's raw-file upload endpoint expects the binary body with
          // application/octet-stream, rather than the attachment's own MIME type.
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
    uploadedAttachments.push({
      storeName: upload.data.storeName,
      attachmentName: upload.data.attachmentName,
      attachmentPath: upload.data.attachmentPath,
    })
  }

  const payload = {
    fromAddress: `"${senderName}" <${from}>`,
    toAddress: to,
    subject,
    content: looksLikeHtml ? content : plainTextToHtml(content),
    mailFormat: 'html',
    ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {}),
  }

  const response = await fetch(`${baseUrl}/accounts/${accountId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const resultText = await response.text()

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null
    }

    throw new Error(`Zoho send failed with ${response.status}: ${resultText}`)
  }

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
    subject: message.subject || '(No subject)',
    from: message.fromAddress || message.sender || 'Unknown sender',
    to: message.toAddress || '',
    receivedAt: message.receivedTime || message.receivedtime || message.sentDateInGMT || null,
    summary: message.summary || '',
    hasAttachment: Boolean(message.hasAttachment),
  }))
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

  const result = resultText ? JSON.parse(resultText) as { data?: ZohoMessageSummary[] } : {}
  const { allowedSenders } = getZohoConfig()

  return (result.data || []).map((message) => {
    const from = message.fromAddress || message.sender || 'Unknown sender'
    const to = message.toAddress || ''
    const fromEmail = normalizeEmailAddress(from)

    const isOurEmail = allowedSenders.includes(fromEmail)
    const direction = isOurEmail ? 'outgoing' : 'incoming'

    return {
      id: message.messageId || message.message_id || '',
      subject: message.subject || '(No subject)',
      from,
      to,
      cc: message.ccAddress || '',
      receivedAt: message.receivedTime || message.receivedtime || message.sentDateInGMT || null,
      summary: message.summary || '',
      hasAttachment: Boolean(message.hasAttachment),
      direction,
    }
  })
}
