import 'server-only'

import { decodeHtmlEntities } from './luxorTextUtils'
import { supabaseRest } from './supabaseRestServer'

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

type ZohoCalendarEventDetailsResponse = {
  events?: Array<{
    uid?: string
    etag?: string | number
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
  attachments?: LuxorZohoAttachment[]
  engagement?: {
    openCount: number
    clickCount: number
  }
  isRead?: boolean
  direction?: 'incoming' | 'outgoing'
}

export type LuxorZohoAttachment = {
  filename: string
  mimeType?: string
  size?: number
  messageId: string
  attachmentId?: string
  attachmentPath?: string
}

const DEFAULT_LOGIN_EMAIL = 'booking@luxoratlaspalmas.com'
const DEFAULT_ALLOWED_SENDERS = ['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com']

let cachedAccessToken: { token: string; expiresAt: number } | null = null
let cachedCalendarUid: string | null = null
let cachedInboxListing: { items: LuxorZohoMessage[]; expiresAt: number; staleUntil: number } | null = null
let inboxListingRequest: Promise<LuxorZohoMessage[]> | null = null
let cachedSentListing: { items: LuxorZohoMessage[]; expiresAt: number; staleUntil: number } | null = null
let sentListingRequest: Promise<LuxorZohoMessage[]> | null = null
const messageDetailCache = new Map<string, { message: LuxorZohoMessage; expiresAt: number }>()
const messageDetailRequests = new Map<string, Promise<LuxorZohoMessage | null>>()
const threadListingCache = new Map<string, { messages: LuxorZohoMessage[]; expiresAt: number; staleUntil: number }>()
const threadListingRequests = new Map<string, Promise<LuxorZohoMessage[]>>()

const ZOHO_READ_CONCURRENCY = 2
let activeZohoReads = 0
let zohoReadCooldownUntil = 0
const zohoReadQueue: Array<() => void> = []

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function acquireZohoReadSlot() {
  if (activeZohoReads < ZOHO_READ_CONCURRENCY) {
    activeZohoReads += 1
    return
  }
  await new Promise<void>((resolve) => zohoReadQueue.push(resolve))
  activeZohoReads += 1
}

function releaseZohoReadSlot() {
  activeZohoReads = Math.max(0, activeZohoReads - 1)
  zohoReadQueue.shift()?.()
}

function retryAfterMilliseconds(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after')
  const seconds = retryAfter ? Number.parseFloat(retryAfter) : Number.NaN
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 5 * 60_000)
  return [1_200, 3_000, 7_000][attempt] || 10_000
}

async function waitForZohoReadCooldown() {
  let remaining = zohoReadCooldownUntil - Date.now()
  while (remaining > 0) {
    await wait(Math.min(remaining, 30_000))
    remaining = zohoReadCooldownUntil - Date.now()
  }
}

async function fetchZohoMailRead(url: string, init: RequestInit = {}) {
  await waitForZohoReadCooldown()
  await acquireZohoReadSlot()
  try {
    await waitForZohoReadCooldown()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, init)
      if (response.ok) return response

      const responseText = await response.clone().text().catch(() => '')
      const rateLimited = response.status === 429 || /too many requests|rate.?limit/i.test(responseText)
      if (rateLimited) {
        // Do not retry a rate-limited request inside the same function invocation.
        // Repeated retries extend Zoho's lock and multiply traffic across Vercel instances.
        zohoReadCooldownUntil = Date.now() + Math.max(retryAfterMilliseconds(response, attempt), 60_000)
        return response
      }

      const transient = response.status >= 500 && response.status <= 504
      if (!transient || attempt === 3) {
        return response
      }

      const delay = retryAfterMilliseconds(response, attempt)
      await wait(delay)
      if (zohoReadCooldownUntil <= Date.now()) zohoReadCooldownUntil = 0
    }
    throw new Error('Zoho Mail request failed without a response.')
  } finally {
    releaseZohoReadSlot()
  }
}

function cacheMessageDetail(key: string, message: LuxorZohoMessage) {
  if (messageDetailCache.size >= 300) {
    const oldestKey = messageDetailCache.keys().next().value
    if (oldestKey) messageDetailCache.delete(oldestKey)
  }
  messageDetailCache.set(key, { message, expiresAt: Date.now() + 10 * 60_000 })
}

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

async function getLuxorEmailEngagement(to: string, subject: string) {
  const recipientEmail = normalizeEmailAddress(to)
  if (!recipientEmail || !subject.trim()) return undefined

  try {
    const recipients = await supabaseRest<Array<{
      campaign_id: string
      open_count?: number
      click_count?: number
    }>>(
      `luxor_marketing_recipients?select=campaign_id,open_count,click_count&email=eq.${encodeURIComponent(recipientEmail)}&order=sent_at.desc&limit=25`,
    )
    if (!recipients.length) return undefined

    const campaignIds = Array.from(new Set(recipients.map((recipient) => recipient.campaign_id).filter(Boolean)))
    const campaigns = await supabaseRest<Array<{ id: string; subject?: string }>>(
      `luxor_marketing_campaigns?select=id,subject&id=in.(${campaignIds.join(',')})`,
    )
    const matchingIds = new Set(
      campaigns
        .filter((campaign) => String(campaign.subject || '').trim().toLowerCase() === subject.trim().toLowerCase())
        .map((campaign) => campaign.id),
    )
    const matchingRecipients = recipients.filter((recipient) => matchingIds.has(recipient.campaign_id))
    if (!matchingRecipients.length) return undefined

    return {
      openCount: matchingRecipients.reduce((sum, recipient) => sum + Number(recipient.open_count || 0), 0),
      clickCount: matchingRecipients.reduce((sum, recipient) => sum + Number(recipient.click_count || 0), 0),
    }
  } catch (error) {
    console.warn('[Zoho] Email engagement lookup skipped:', error)
    return undefined
  }
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
    const providerMessage = tokenData.error_description || tokenData.error || `Zoho token refresh failed with ${response.status}.`
    if (tokenData.error === 'invalid_code' || /invalid code|invalid_code/i.test(providerMessage)) {
      throw new Error('Zoho connection needs reconnecting. The saved authorization was rejected by Zoho.')
    }
    throw new Error(`Zoho connection check failed: ${providerMessage}`)
  }

  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + ((tokenData.expires_in || 3600) - 300) * 1000,
  }

  return cachedAccessToken.token
}

/**
 * Safely verifies that Zoho still accepts the saved authorization. This only
 * requests an access token; it never sends, reads, or changes an email.
 */
export async function verifyLuxorZohoMailConnection() {
  await getZohoAccessToken()
}

export function isLuxorZohoAuthorizationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /Zoho connection needs reconnecting|invalid[_ ]code/i.test(message)
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
            'Content-Type': attachment.contentType || 'application/octet-stream',
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
  cachedSentListing = null

  return {
    messageId: result.data?.messageId || result.data?.message_id || null,
    from,
    to,
  }
}

export async function createLuxorZohoCalendarEvent(input: {
  attendeeEmails: string[]
  title: string
  description: string
  location: string
  startUtc: string
  endUtc: string
  timezone?: string
  existingEventUid?: string | null
}) {
  const attendeeEmails = Array.from(new Set(input.attendeeEmails.map(normalizeEmailAddress).filter(Boolean)))
  if (attendeeEmails.length === 0) throw new Error('Please add at least one valid attendee email address.')

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
    attendees: attendeeEmails.map((email) => ({ email, permission: 1, attendance: 1 })),
    notify_attendee: 2,
    allowForwarding: true,
    transparency: 0,
  }

  const calendarPath = `/calendars/${encodeURIComponent(resolvedCalendarUid)}`
  const collectionPath = `${calendarPath}/events`
  let response: Response

  if (input.existingEventUid) {
    const eventPath = `${collectionPath}/${encodeURIComponent(input.existingEventUid)}`
    const detailsResponse = await fetch(`${calendarBaseUrl}${eventPath}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
    const detailsText = await detailsResponse.text()

    if (detailsResponse.status === 404) {
      console.warn('[zoho-calendar] saved event was not found; creating a replacement')
      response = await createZohoCalendarEvent(calendarBaseUrl, collectionPath, accessToken, eventData)
    } else {
      if (!detailsResponse.ok) {
        throwZohoCalendarRequestError('look up the saved event', detailsResponse, detailsText)
      }

      const details = parseZohoCalendarResponse<ZohoCalendarEventDetailsResponse>(detailsText)
      const existingEvent = details.events?.[0]
      if (!existingEvent?.etag) {
        throw new Error('Zoho Calendar did not return the version required to update this event. Please try again.')
      }

      const updateData = {
        ...eventData,
        uid: existingEvent.uid || input.existingEventUid,
        etag: String(existingEvent.etag),
      }
      response = await fetch(
        `${calendarBaseUrl}${eventPath}?eventdata=${encodeURIComponent(JSON.stringify(updateData))}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            Accept: 'application/json',
            etag: String(existingEvent.etag),
          },
          cache: 'no-store',
        },
      )

      if (response.status === 404) {
        console.warn('[zoho-calendar] saved event disappeared during update; creating a replacement')
        response = await createZohoCalendarEvent(calendarBaseUrl, collectionPath, accessToken, eventData)
      }
    }
  } else {
    response = await createZohoCalendarEvent(calendarBaseUrl, collectionPath, accessToken, eventData)
  }

  const resultText = await response.text()
  if (!response.ok) throwZohoCalendarRequestError('schedule the tour', response, resultText)

  const result = parseZohoCalendarResponse<ZohoCalendarEventResponse>(resultText)
  const event = result.events?.[0]
  if (!event?.uid && !event?.id) throw new Error('Zoho Calendar did not return an event ID.')

  return {
    eventId: event.id || null,
    eventUid: event.uid || null,
    viewEventUrl: event.viewEventURL || null,
  }
}

async function createZohoCalendarEvent(
  calendarBaseUrl: string,
  collectionPath: string,
  accessToken: string,
  eventData: Record<string, unknown>,
) {
  return fetch(
    `${calendarBaseUrl}${collectionPath}?eventdata=${encodeURIComponent(JSON.stringify(eventData))}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  )
}

function parseZohoCalendarResponse<T>(resultText: string): T {
  if (!resultText) return {} as T
  try {
    return JSON.parse(resultText) as T
  } catch {
    console.error('[zoho-calendar] provider returned a non-JSON success response')
    throw new Error('Zoho Calendar returned an unreadable response. Please try again.')
  }
}

function throwZohoCalendarRequestError(operation: string, response: Response, resultText: string): never {
  if (response.status === 401) cachedAccessToken = null

  let providerCode: string | undefined
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      const payload = JSON.parse(resultText) as { code?: unknown; error?: unknown }
      const candidate = payload.code || payload.error
      if (typeof candidate === 'string') providerCode = candidate.slice(0, 80)
    } catch {
      // The user-facing error below intentionally excludes malformed provider content.
    }
  }
  console.error('[zoho-calendar] request failed', {
    operation,
    status: response.status,
    providerCode,
    responseType: response.headers.get('content-type') || 'unknown',
  })

  if (response.status === 401) {
    throw new Error('Zoho Calendar authorization expired. Reconnect Zoho in Settings → Integrations and try again.')
  }
  if (response.status === 403) {
    throw new Error('Zoho Calendar denied access to this calendar. Reconnect Zoho in Settings → Integrations and try again.')
  }
  if (response.status === 429) {
    throw new Error('Zoho Calendar is temporarily busy. Please wait a moment and try again.')
  }
  if (response.status >= 500) {
    throw new Error('Zoho Calendar is temporarily unavailable. Please try again shortly.')
  }
  throw new Error(`Zoho Calendar could not ${operation} (status ${response.status}). Please try again.`)
}

/**
 * Remove a Luxor-created calendar invite and notify its attendees. The event
 * UID is stored with the inquiry when a portal user schedules a tour, so this
 * never searches or changes an unrelated calendar entry.
 */
export async function cancelLuxorZohoCalendarEvent(eventUid: string) {
  const normalizedEventUid = eventUid.trim()
  if (!normalizedEventUid) return { status: 'not_linked' as const }

  const { calendarBaseUrl, calendarUid } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const resolvedCalendarUid = await getZohoCalendarUid(accessToken, calendarBaseUrl, calendarUid)
  const eventPath = `/calendars/${encodeURIComponent(resolvedCalendarUid)}/events/${encodeURIComponent(normalizedEventUid)}`

  // Zoho requires the latest ETag when removing an event. Reading it first
  // also lets a repeated owner action treat an already-removed invite as a
  // successful, idempotent cancellation.
  const detailsResponse = await fetch(`${calendarBaseUrl}${eventPath}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const detailsText = await detailsResponse.text()

  if (detailsResponse.status === 404) return { status: 'already_removed' as const }
  if (!detailsResponse.ok) {
    throwZohoCalendarRequestError('look up the calendar event', detailsResponse, detailsText)
  }

  const details = detailsText ? JSON.parse(detailsText) as ZohoCalendarEventDetailsResponse : {}
  const event = details.events?.[0]
  if (!event?.uid) return { status: 'already_removed' as const }
  const eventData = {
    uid: event.uid,
    ...(event?.etag !== undefined && event?.etag !== null ? { etag: String(event.etag) } : {}),
    // Notify both Luxor and the client that the event was cancelled.
    notify_attendee: 2,
  }
  const response = await fetch(
    `${calendarBaseUrl}${eventPath}?eventdata=${encodeURIComponent(JSON.stringify(eventData))}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  )
  const resultText = await response.text()

  if (response.status === 404) return { status: 'already_removed' as const }
  if (!response.ok) {
    throwZohoCalendarRequestError('cancel the calendar event', response, resultText)
  }

  return { status: 'cancelled' as const }
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
    throwZohoCalendarRequestError('find the Luxor calendar', response, resultText)
  }

  const result = parseZohoCalendarResponse<{ calendars?: Array<{ uid?: string; isdefault?: boolean }> }>(resultText)
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

export async function listLuxorZohoInbox(limit = 1000) {
  const safeLimit = Math.min(Math.max(limit, 1), 1000)
  if (cachedInboxListing && cachedInboxListing.expiresAt > Date.now()) {
    return cachedInboxListing.items.slice(0, safeLimit)
  }

  if (!inboxListingRequest) {
    inboxListingRequest = (async () => {
      const { accountId, baseUrl } = getZohoConfig()
      const accessToken = await getZohoAccessToken()
      const batchSize = 200
      const totalPages = Math.min(Math.ceil(safeLimit / batchSize), 5)

      const pagePromises = Array.from({ length: totalPages }, (_, pageIndex) => {
        const start = pageIndex * batchSize + 1
        const pageLimit = Math.min(batchSize, safeLimit - pageIndex * batchSize)
        const params = new URLSearchParams({
          limit: String(pageLimit),
          start: String(start),
        })
        return fetchZohoMailRead(`${baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          cache: 'no-store',
        }).then(async (response) => {
          const resultText = await response.text()
          if (!response.ok) {
            if (response.status === 401) cachedAccessToken = null
            throw new Error(`Zoho inbox fetch failed with ${response.status}: ${resultText}`)
          }
          const result = resultText ? (JSON.parse(resultText) as { data?: ZohoMessageSummary[] }) : {}
          return (result.data || []).map((message): LuxorZohoMessage => ({
            id: message.messageId || message.message_id || '',
            threadId: message.threadId || message.messageId || message.message_id || '',
            folderId: message.folderId || '',
            subject: decodeHtmlEntities(message.subject) || '(No subject)',
            from: message.fromAddress || message.sender || 'Unknown sender',
            to: message.toAddress || '',
            cc: message.ccAddress || '',
            receivedAt: normalizeZohoDate(message.receivedTime || message.receivedtime || message.sentDateInGMT),
            summary: decodeHtmlEntities(message.summary),
            hasAttachment: zohoBoolean(message.hasAttachment),
            isRead: String(message.status || '') === '1',
            direction: 'incoming',
          }))
        })
      })

      const pages = await Promise.all(pagePromises)
      return pages.flat()
    })()
  }

  try {
    const items = await inboxListingRequest
    cachedInboxListing = {
      items,
      expiresAt: Date.now() + 90_000,
      staleUntil: Date.now() + 60 * 60_000,
    }
    return items.slice(0, safeLimit)
  } catch (error) {
    if (cachedInboxListing) {
      console.warn('[Zoho Inbox] Fetch error or rate limit, serving cached inbox listing:', error instanceof Error ? error.message : error)
      return cachedInboxListing.items.slice(0, safeLimit)
    }
    const isRateLimited = error instanceof Error && /too many requests|rate.?limit|429/i.test(error.message)
    if (isRateLimited) {
      console.warn('[Zoho Inbox] Rate limited without cached items, returning empty inbox gracefully.')
      return []
    }
    throw error
  } finally {
    inboxListingRequest = null
  }
}

export async function listLuxorZohoSentMessages(limit = 1000) {
  const safeLimit = Math.min(Math.max(limit, 1), 1000)
  if (cachedSentListing && cachedSentListing.expiresAt > Date.now()) {
    return cachedSentListing.items.slice(0, safeLimit)
  }

  if (!sentListingRequest) {
    sentListingRequest = (async () => {
      const { accountId, baseUrl, allowedSenders } = getZohoConfig()
      const accessToken = await getZohoAccessToken()
      const primarySender = allowedSenders[0] || 'booking@luxoratlaspalmas.com'
      const batchSize = 200
      const totalPages = Math.min(Math.ceil(safeLimit / batchSize), 5)

      const pagePromises = Array.from({ length: totalPages }, (_, pageIndex) => {
        const start = pageIndex * batchSize + 1
        const pageLimit = Math.min(batchSize, safeLimit - pageIndex * batchSize)
        const params = new URLSearchParams({
          searchKey: `sender:${primarySender}`,
          limit: String(pageLimit),
          start: String(start),
          includeto: 'true',
        })
        return fetchZohoMailRead(`${baseUrl}/accounts/${accountId}/messages/search?${params.toString()}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
          cache: 'no-store',
        }).then(async (response) => {
          const resultText = await response.text()
          if (!response.ok) {
            if (response.status === 401) cachedAccessToken = null
            throw new Error(`Zoho sent messages fetch failed with ${response.status}: ${resultText}`)
          }
          const result = resultText ? (JSON.parse(resultText) as { data?: ZohoMessageSummary[] }) : {}
          return (result.data || []).map((message): LuxorZohoMessage => ({
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
            direction: 'outgoing',
            isRead: true,
          }))
        })
      })

      const pages = await Promise.all(pagePromises)
      return pages.flat()
    })()
  }

  try {
    const items = await sentListingRequest
    cachedSentListing = {
      items,
      expiresAt: Date.now() + 90_000,
      staleUntil: Date.now() + 60 * 60_000,
    }
    return items.slice(0, safeLimit)
  } catch (error) {
    if (cachedSentListing) {
      console.warn('[Zoho Sent] Fetch error or rate limit, serving cached sent listing:', error instanceof Error ? error.message : error)
      return cachedSentListing.items.slice(0, safeLimit)
    }
    const isRateLimited = error instanceof Error && /too many requests|rate.?limit|429/i.test(error.message)
    if (isRateLimited) {
      console.warn('[Zoho Sent] Rate limited without cached items, returning empty sent list gracefully.')
      return []
    }
    throw error
  } finally {
    sentListingRequest = null
  }
}

export async function getLuxorZohoMessageDetail(messageId: string, folderId?: string) {
  if (!messageId) return null
  const cacheKey = `${folderId || 'no-folder'}:${messageId}`
  const cached = messageDetailCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.message

  const existingRequest = messageDetailRequests.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = fetchLuxorZohoMessageDetail(messageId, folderId)
  messageDetailRequests.set(cacheKey, request)
  try {
    const message = await request
    if (message) {
      cacheMessageDetail(cacheKey, message)
      return message
    }
    return cached?.message || null
  } finally {
    messageDetailRequests.delete(cacheKey)
  }
}

function normalizeZohoAttachment(raw: Record<string, unknown>, messageId: string): LuxorZohoAttachment | null {
  const filename = String(raw.filename || raw.attachmentName || raw.name || '').trim()
  if (!filename) return null
  const attachmentPath = String(raw.attachmentPath || '').trim()
  const attachmentId = String(raw.attachmentId || raw.storeName || attachmentPath || '').trim()
  const sizeValue = Number(raw.size || raw.attachmentSize || 0)
  return {
    filename,
    mimeType: String(raw.mimeType || raw.type || raw.contentType || '').trim() || undefined,
    size: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : undefined,
    messageId: String(raw.messageId || raw.zohoMessageId || messageId),
    attachmentId: attachmentId || undefined,
    attachmentPath: attachmentPath || undefined,
  }
}

export async function getLuxorZohoMessageAttachments(messageId: string, folderId?: string): Promise<LuxorZohoAttachment[]> {
  if (!messageId) return []
  const { accountId, baseUrl } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const resolvedFolderId = String(folderId || '').trim()
  const candidates = resolvedFolderId
    ? [
        `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(resolvedFolderId)}/messages/${encodeURIComponent(messageId)}/attachmentinfo`,
        `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(resolvedFolderId)}/messages/${encodeURIComponent(messageId)}/attachments`,
        `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachmentinfo`,
        `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachments`,
      ]
    : [
        `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachmentinfo`,
        `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachments`,
      ]

  for (const url of candidates) {
    try {
      const response = await fetchZohoMailRead(url, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) continue
      const result = await response.json().catch(() => ({})) as {
        data?: unknown
      }
      const data = result.data as { attachments?: unknown } | unknown
      const rawAttachments = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as { attachments?: unknown[] }).attachments)
          ? (data as { attachments: unknown[] }).attachments
          : []
      return rawAttachments
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => normalizeZohoAttachment(item, messageId))
        .filter((item): item is LuxorZohoAttachment => Boolean(item))
    } catch (error) {
      console.warn(`[Zoho] Attachment list failed for ${messageId}:`, error)
    }
  }

  return []
}

export async function downloadLuxorZohoAttachment(input: {
  messageId: string
  attachmentId?: string
  attachmentPath?: string
  folderId?: string
}) {
  const { accountId, baseUrl } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const resolvedFolderId = String(input.folderId || '').trim()
  const tokens = Array.from(new Set([input.attachmentId, input.attachmentPath]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .flatMap((value) => [value, encodeURIComponent(value)])))

  if (!input.messageId || !tokens.length) throw new Error('Attachment reference is incomplete.')

  const urls = tokens.flatMap((token) => {
    const candidates = [
      `${baseUrl}/accounts/${accountId}/messages/${encodeURIComponent(input.messageId)}/attachments/${token}`,
      `${baseUrl}/accounts/${accountId}/messages/attachments/${token}`,
    ]
    if (resolvedFolderId) {
      candidates.unshift(`${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(resolvedFolderId)}/messages/${encodeURIComponent(input.messageId)}/attachments/${token}`)
    }
    return candidates
  })

  let lastStatus = 0
  for (const url of urls) {
    const response = await fetchZohoMailRead(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      cache: 'no-store',
    })
    if (response.ok) {
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      }
    }
    lastStatus = response.status
  }

  throw new Error(`Zoho attachment fetch failed with ${lastStatus}.`)
}

async function fetchLuxorZohoMessageDetail(messageId: string, folderId?: string): Promise<LuxorZohoMessage | null> {
  const { accountId, baseUrl, allowedSenders } = getZohoConfig()
  const accessToken = await getZohoAccessToken()

  // Helper to parse a Zoho message data payload into our detail shape
  function parseMessageData(data: Record<string, unknown>, content: string, attachments: LuxorZohoAttachment[] = [], engagement?: { openCount: number; clickCount: number }) {
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
      summary: decodeHtmlEntities(String(data.summary || '')),
      content,
      htmlContent: content,
      hasAttachment: zohoBoolean(data.hasAttachment),
      attachments,
      engagement,
      direction,
    }
  }

  try {
    // Strategy 1: If folderId is known, use the folder-specific endpoint which reliably returns content
    if (folderId) {
      try {
        const folderDetailRes = await fetchZohoMailRead(
          `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/details`,
          { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
        )
        if (folderDetailRes.ok) {
          const folderResult = await folderDetailRes.json().catch(() => ({})) as { data?: Record<string, unknown> }
          const data = folderResult.data || {}

          // Also fetch full HTML content from the content sub-endpoint
          let content = String(data.content || '')
          if (!content.trim()) {
            const contentRes = await fetchZohoMailRead(
              `${baseUrl}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content?includeBlockContent=true`,
              { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' },
            )
            if (contentRes.ok) {
              const contentData = await contentRes.json().catch(() => ({})) as { data?: { content?: string } }
              content = String(contentData.data?.content || '')
            }
          }
          content ||= String(data.summary || '')

          if (Object.keys(data).length > 0) {
            const attachments = zohoBoolean(data.hasAttachment)
              ? await getLuxorZohoMessageAttachments(messageId, String(data.folderId || folderId || ''))
              : []
            const engagement = await getLuxorEmailEngagement(String(data.toAddress || ''), String(data.subject || ''))
            return parseMessageData(data, content, attachments, engagement)
          }
        }
      } catch (err) {
        console.warn('Folder-specific Zoho message fetch failed, falling back to generic view:', err)
      }
    }

    // Strategy 2: Generic /messages/view/{id} — always attempt as fallback
    const response = await fetchZohoMailRead(`${baseUrl}/accounts/${accountId}/messages/view/${encodeURIComponent(messageId)}`, {
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

    let fullContent = String(data.content || '')

    // If we have a folderId hint from the data, try the content endpoint
    const resolvedFolderId = String(data.folderId || folderId || '')
    if (resolvedFolderId && !fullContent.trim()) {
      const contentResponse = await fetchZohoMailRead(
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
        const mimeRes = await fetchZohoMailRead(
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

    fullContent ||= String(data.summary || '')

    const attachments = zohoBoolean(data.hasAttachment)
      ? await getLuxorZohoMessageAttachments(messageId, resolvedFolderId)
      : []
    const engagement = await getLuxorEmailEngagement(String(data.toAddress || ''), String(data.subject || ''))
    return parseMessageData(data, fullContent, attachments, engagement)
  } catch (err) {
    console.error('Failed fetching Zoho message detail:', err)
    return null
  }
}

export async function listLuxorZohoMessagesForAddress(email: string, limit = 1000) {
  const clientEmail = normalizeEmailAddress(email)
  if (!clientEmail) return []

  const { accountId, baseUrl } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const params = new URLSearchParams({
    searchKey: `sender:${clientEmail}::or:to:${clientEmail}`,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
    start: '1',
    includeto: 'true',
  })

  const response = await fetchZohoMailRead(`${baseUrl}/accounts/${accountId}/messages/search?${params.toString()}`, {
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
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const cacheKey = `${threadId.trim()}:${safeLimit}`
  const cached = threadListingCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.messages

  const existingRequest = threadListingRequests.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = fetchLuxorZohoThread(threadId, safeLimit)
  threadListingRequests.set(cacheKey, request)
  try {
    const messages = await request
    threadListingCache.set(cacheKey, {
      messages,
      expiresAt: Date.now() + 60_000,
      staleUntil: Date.now() + 10 * 60_000,
    })
    return messages
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) return cached.messages
    throw error
  } finally {
    threadListingRequests.delete(cacheKey)
  }
}

async function fetchLuxorZohoThread(threadId: string, limit: number): Promise<LuxorZohoMessage[]> {
  const { accountId, baseUrl, allowedSenders } = getZohoConfig()
  const accessToken = await getZohoAccessToken()
  const params = new URLSearchParams({
    threadId: threadId.trim(),
    limit: String(limit),
    includeto: 'true',
  })
  const response = await fetchZohoMailRead(`${baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
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

  // Keep thread loading to one Zoho request. Fetching every message body here
  // amplified a single click into dozens of API calls and triggered mailbox
  // throttling. The selected message body is fetched separately on demand.
  return summaries.sort((a, b) => new Date(a.receivedAt || 0).getTime() - new Date(b.receivedAt || 0).getTime())
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
  cachedSentListing = null
  threadListingCache.clear()
  const result = resultText ? (JSON.parse(resultText) as ZohoSendResponse) : {}
  return {
    success: true,
    messageId: result.data?.messageId || result.data?.message_id || null,
    from,
    to,
    subject,
  }
}
