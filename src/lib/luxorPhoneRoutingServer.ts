import 'server-only'

import { normalizePhoneNumber } from './luxorCallsServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { supabaseRest } from './supabaseRestServer'

export type LuxorOutboundMode = 'browser' | 'ring_phone'

export type LuxorPhoneRoutingSettings = {
  id: 'main'
  ring_to_number: string | null
  outbound_mode: LuxorOutboundMode
  ring_browser: boolean
  ring_phone: boolean
  updated_by: string | null
  updated_at: string
}

function defaultSettings(): LuxorPhoneRoutingSettings {
  const fallbackNumber = normalizePhoneNumber(process.env.LUXOR_TWILIO_FALLBACK_NUMBER)
  return {
    id: 'main',
    ring_to_number: fallbackNumber,
    outbound_mode: 'browser',
    ring_browser: true,
    ring_phone: Boolean(fallbackNumber),
    updated_by: null,
    updated_at: new Date(0).toISOString(),
  }
}

export async function getLuxorPhoneRoutingSettings() {
  const [settings] = await supabaseRest<LuxorPhoneRoutingSettings[]>('luxor_phone_routing_settings?select=*&id=eq.main&limit=1')
  return settings ?? defaultSettings()
}

export async function saveLuxorPhoneRoutingSettings(input: {
  ringToNumber?: string | null
  outboundMode?: string
  ringBrowser?: boolean
  ringPhone?: boolean
  ownerEmail: string
}) {
  const current = await getLuxorPhoneRoutingSettings()
  const ringToNumber = normalizePhoneNumber(input.ringToNumber)
  const outboundMode: LuxorOutboundMode = input.outboundMode === 'ring_phone' ? 'ring_phone' : 'browser'
  const ringBrowser = input.ringBrowser ?? current.ring_browser
  const ringPhone = input.ringPhone ?? current.ring_phone

  if (input.ringToNumber && !ringToNumber) throw new Error('Enter a valid phone number, including area code.')
  if ((ringPhone || outboundMode === 'ring_phone') && !ringToNumber) throw new Error('Add the real phone number that Twilio should ring.')
  if (!ringBrowser && !ringPhone) throw new Error('Choose at least one place for incoming calls to ring.')
  if (ringToNumber && ringToNumber === normalizePhoneNumber(await getActiveLuxorPhoneNumber())) {
    throw new Error('Your ring-to phone must be different from the active Luxor business number.')
  }

  const [saved] = await supabaseRest<LuxorPhoneRoutingSettings[]>('luxor_phone_routing_settings?on_conflict=id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: 'main',
      ring_to_number: ringToNumber,
      outbound_mode: outboundMode,
      ring_browser: ringBrowser,
      ring_phone: ringPhone,
      updated_by: input.ownerEmail.toLowerCase(),
      updated_at: new Date().toISOString(),
    }),
  })
  return saved
}
