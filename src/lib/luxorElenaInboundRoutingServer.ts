import 'server-only'
import twilio from 'twilio'
import { supabaseRestStrict } from './supabaseRestServer'

export type ElenaInboundRouting = { status: 'planned' | 'active' | 'unverified' }

/** Report live routing only when the gate, selected public number and Twilio routing agree. */
export async function getElenaInboundRouting(): Promise<ElenaInboundRouting> {
  if (process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED !== 'true') return { status: 'planned' }
  const phone = process.env.LUXOR_ELENA_LIVE_NUMBER || ''
  const sid = process.env.LUXOR_ELENA_LIVE_NUMBER_SID || ''
  const account = process.env.LUXOR_TWILIO_ACCOUNT_SID || ''
  const token = process.env.LUXOR_TWILIO_AUTH_TOKEN || ''
  if (!/^\+1\d{10}$/.test(phone) || !/^PN[0-9a-f]{32}$/i.test(sid) || !/^AC[0-9a-f]{32}$/i.test(account) || !token || !process.env.OPENAI_API_KEY || !process.env.OPENAI_PROJECT_ID || !process.env.OPENAI_VOICE_WEBHOOK_SECRET) return { status: 'unverified' }
  try {
    const client = twilio(account, token, { timeout: 8000, autoRetry: false })
    const [selected, number] = await Promise.all([
      supabaseRestStrict<Array<{ phone_number: string; twilio_number_sid: string }>>('luxor_phone_numbers?select=phone_number,twilio_number_sid&is_public=eq.true&limit=2'),
      client.incomingPhoneNumbers(sid).fetch(),
    ])
    const base = 'https://www.luxoratlaspalmas.com'
    const matches = selected.length === 1 && selected[0].phone_number === phone && selected[0].twilio_number_sid === sid
      && number.accountSid === account && number.phoneNumber === phone && !number.trunkSid && !number.voiceApplicationSid
      && number.voiceUrl === `${base}/api/twilio/incoming` && number.voiceMethod === 'POST'
      && number.statusCallback === `${base}/api/elena-inbound/status` && number.statusCallbackMethod === 'POST'
    return { status: matches ? 'active' : 'unverified' }
  } catch {
    return { status: 'unverified' }
  }
}
