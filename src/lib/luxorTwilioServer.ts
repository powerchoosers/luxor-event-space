import 'server-only'

import twilio from 'twilio'
import { LUXOR_CALL_STATUSES, LuxorCallStatus } from './luxorCallTypes'

export type TwilioForm = Record<string, string>

export function getLuxorTwilioConfig() {
  const accountSid = process.env.LUXOR_TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.LUXOR_TWILIO_AUTH_TOKEN?.trim()
  const apiKeySid = process.env.LUXOR_TWILIO_API_KEY_SID?.trim()
  const apiKeySecret = process.env.LUXOR_TWILIO_API_KEY_SECRET?.trim()
  const twimlAppSid = process.env.LUXOR_TWILIO_TWIML_APP_SID?.trim()
  const phoneNumber = process.env.LUXOR_TWILIO_PHONE_NUMBER?.trim()

  const missing = [
    ['LUXOR_TWILIO_ACCOUNT_SID', accountSid],
    ['LUXOR_TWILIO_AUTH_TOKEN', authToken],
    ['LUXOR_TWILIO_API_KEY_SID', apiKeySid],
    ['LUXOR_TWILIO_API_KEY_SECRET', apiKeySecret],
    ['LUXOR_TWILIO_TWIML_APP_SID', twimlAppSid],
    ['LUXOR_TWILIO_PHONE_NUMBER', phoneNumber],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    throw new Error(`Missing Twilio configuration: ${missing.map(([name]) => name).join(', ')}`)
  }

  return {
    accountSid: accountSid!,
    authToken: authToken!,
    apiKeySid: apiKeySid!,
    apiKeySecret: apiKeySecret!,
    twimlAppSid: twimlAppSid!,
    phoneNumber: phoneNumber!,
    fallbackNumber: process.env.LUXOR_TWILIO_FALLBACK_NUMBER?.trim() || null,
    clientIdentity: sanitizeTwilioIdentity(process.env.LUXOR_TWILIO_CLIENT_IDENTITY || 'luxor-owner'),
    publicBaseUrl: getLuxorPublicBaseUrl(),
  }
}

export function getLuxorTwilioMessagingConfig() {
  const accountSid = process.env.LUXOR_TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.LUXOR_TWILIO_AUTH_TOKEN?.trim()
  const phoneNumber = process.env.LUXOR_TWILIO_PHONE_NUMBER?.trim()
  const missing = [['LUXOR_TWILIO_ACCOUNT_SID', accountSid], ['LUXOR_TWILIO_AUTH_TOKEN', authToken], ['LUXOR_TWILIO_PHONE_NUMBER', phoneNumber]].filter(([, value]) => !value)
  if (missing.length) throw new Error(`Missing Twilio configuration: ${missing.map(([name]) => name).join(', ')}`)
  return { accountSid: accountSid!, authToken: authToken!, phoneNumber: phoneNumber!, publicBaseUrl: getLuxorPublicBaseUrl() }
}

export function getLuxorPublicBaseUrl() {
  const configured =
    process.env.LUXOR_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    'https://www.luxoratlaspalmas.com'

  const url = new URL(configured)
  if (url.hostname === 'luxoratlaspalmas.com') url.hostname = 'www.luxoratlaspalmas.com'
  return url.toString().replace(/\/$/, '')
}

export function sanitizeTwilioIdentity(value: string) {
  const sanitized = value.trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 121)
  return sanitized || 'luxor-owner'
}

export async function createVoiceAccessToken(ownerEmail: string) {
  const config = getLuxorTwilioConfig()
  const { getActiveLuxorPhoneNumber } = await import('./luxorPhoneNumbersServer')
  const phoneNumber = await getActiveLuxorPhoneNumber()
  const AccessToken = twilio.jwt.AccessToken
  const VoiceGrant = AccessToken.VoiceGrant
  const token = new AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
    identity: config.clientIdentity,
    ttl: 3600,
  })

  token.addGrant(new VoiceGrant({
    incomingAllow: true,
    outgoingApplicationSid: config.twimlAppSid,
    outgoingApplicationParams: {
      ownerEmail: ownerEmail.toLowerCase(),
    },
  }))

  return {
    token: token.toJwt(),
    identity: config.clientIdentity,
    phoneNumber,
    expiresIn: 3600,
  }
}

export async function readTwilioForm(request: Request) {
  const formData = await request.formData()
  const params: TwilioForm = {}

  formData.forEach((value, key) => {
    params[key] = typeof value === 'string' ? value : value.name
  })

  return params
}

export function validateTwilioWebhook(request: Request, params: TwilioForm) {
  if (process.env.NODE_ENV === 'development' && process.env.TWILIO_VALIDATE_WEBHOOKS === 'false') {
    return true
  }

  const config = getLuxorTwilioConfig()
  const signature = request.headers.get('x-twilio-signature') || ''
  if (!signature) return false

  const incomingUrl = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https'
  const pathAndQuery = `${incomingUrl.pathname}${incomingUrl.search}`
  const candidateOrigins = new Set<string>([
    new URL(config.publicBaseUrl).origin,
    incomingUrl.origin,
  ])
  if (forwardedHost) candidateOrigins.add(`${forwardedProto}://${forwardedHost}`)

  // The apex domain redirects to www in Vercel. Accept both during rollout so
  // signatures remain valid for in-flight Twilio webhooks created before the
  // console URLs are switched to the canonical www host.
  for (const origin of [...candidateOrigins]) {
    const candidate = new URL(origin)
    if (candidate.hostname === 'www.luxoratlaspalmas.com') {
      candidate.hostname = 'luxoratlaspalmas.com'
      candidateOrigins.add(candidate.origin)
    } else if (candidate.hostname === 'luxoratlaspalmas.com') {
      candidate.hostname = 'www.luxoratlaspalmas.com'
      candidateOrigins.add(candidate.origin)
    }
  }

  const isValid = [...candidateOrigins].some((origin) =>
    twilio.validateRequest(config.authToken, signature, `${origin}${pathAndQuery}`, params),
  )
  if (!isValid) {
    console.error('Luxor rejected an invalid Twilio signature.', {
      path: incomingUrl.pathname,
      forwardedHost: forwardedHost || null,
      candidateHosts: [...candidateOrigins].map((origin) => new URL(origin).host),
    })
  }
  return isValid
}

export function buildTwilioCallbackUrl(path: string, params: Record<string, string | null | undefined> = {}) {
  const url = new URL(path, `${getLuxorPublicBaseUrl()}/`)
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  return url.toString()
}

export function twimlResponse(response: InstanceType<typeof twilio.twiml.VoiceResponse>, status = 200) {
  return new Response(response.toString(), {
    status,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function forbiddenTwimlResponse() {
  const response = new twilio.twiml.VoiceResponse()
  response.say('This call request could not be verified.')
  response.hangup()
  return twimlResponse(response, 403)
}

export function normalizeTwilioCallStatus(value: string | null | undefined): LuxorCallStatus {
  if (LUXOR_CALL_STATUSES.includes(value as LuxorCallStatus)) return value as LuxorCallStatus
  if (value === 'answered') return 'in-progress'
  return 'initiated'
}

export function parseTwilioInteger(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function createTwilioVoiceResponse() {
  return new twilio.twiml.VoiceResponse()
}
