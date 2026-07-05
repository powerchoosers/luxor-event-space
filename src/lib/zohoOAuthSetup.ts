import 'server-only'

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'ZohoMail.messages.CREATE',
  'ZohoMail.accounts.READ',
]

export function getZohoRedirectUri(request: Request) {
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https')

  return `${protocol}://${host}/api/auth/callback/zoho`
}

export function getZohoAuthUrl(request: Request) {
  const clientId = process.env.ZOHO_CLIENT_ID
  const accountsServer = (process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com').replace(/\/$/, '')
  const redirectUri = getZohoRedirectUri(request)

  if (!clientId) {
    throw new Error('Missing ZOHO_CLIENT_ID.')
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: DEFAULT_SCOPES.join(' '),
    redirect_uri: redirectUri,
    access_type: 'offline',
    prompt: 'consent',
  })

  return `${accountsServer}/oauth/v2/auth?${params.toString()}`
}

export async function exchangeZohoCodeForSetup(request: Request, code: string) {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const accountsServer = (process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com').replace(/\/$/, '')
  const redirectUri = getZohoRedirectUri(request)

  if (!clientId || !clientSecret) {
    throw new Error('Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET.')
  }

  const tokenResponse = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  const tokenText = await tokenResponse.text()
  const tokenData = tokenText ? JSON.parse(tokenText) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string } : {}

  if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || `Zoho token exchange failed with ${tokenResponse.status}: ${tokenText}`)
  }

  const accountsResponse = await fetch('https://mail.zoho.com/api/v1/accounts', {
    headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` },
  })

  const accountsText = await accountsResponse.text()
  const accountsData = accountsText ? JSON.parse(accountsText) as { data?: { accountId?: string; mailboxAddress?: string; emailAddress?: string }[] } : {}

  if (!accountsResponse.ok) {
    throw new Error(`Zoho account lookup failed with ${accountsResponse.status}: ${accountsText}`)
  }

  const account = accountsData.data?.[0]
  const accountId = account?.accountId

  if (!accountId) {
    throw new Error('Zoho did not return a Mail account ID.')
  }

  return {
    redirectUri,
    refreshToken: tokenData.refresh_token || '',
    accountId,
    mailboxAddress: account.mailboxAddress || account.emailAddress || null,
  }
}
