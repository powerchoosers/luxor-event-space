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

const DEFAULT_LOGIN_EMAIL = 'booking@luxoratlaspalmas.com'
const DEFAULT_ALLOWED_SENDERS = ['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com']

let cachedAccessToken: { token: string; expiresAt: number } | null = null

function getZohoConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const accountId = process.env.ZOHO_ACCOUNT_ID
  const accountsServer = (process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com').replace(/\/$/, '')
  const baseUrl = (process.env.ZOHO_BASE_URL || 'https://mail.zoho.com/api/v1').replace(/\/$/, '')
  const loginEmail = (process.env.LUXOR_ZOHO_LOGIN_EMAIL || DEFAULT_LOGIN_EMAIL).toLowerCase()
  const allowedSenders = (process.env.LUXOR_ZOHO_ALLOWED_SENDERS || DEFAULT_ALLOWED_SENDERS.join(','))
    .split(',')
    .map((sender) => sender.trim().toLowerCase())
    .filter(Boolean)

  if (!clientId || !clientSecret || !refreshToken || !accountId) {
    throw new Error('Missing Zoho email credentials. Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, and ZOHO_ACCOUNT_ID.')
  }

  return { clientId, clientSecret, refreshToken, accountId, accountsServer, baseUrl, loginEmail, allowedSenders }
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
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
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
  const payload = {
    fromAddress: `"${senderName}" <${from}>`,
    toAddress: to,
    subject,
    content: looksLikeHtml ? content : plainTextToHtml(content),
    mailFormat: 'html',
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
