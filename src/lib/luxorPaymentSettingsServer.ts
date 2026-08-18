import 'server-only'

import { supabaseRest } from './supabaseRestServer'

export type LuxorPaymentSettings = {
  id: 'main'
  zelle_recipient: string | null
  zelle_qr_code_url: string | null
  updated_by: string | null
  updated_at: string
}

function defaultSettings(): LuxorPaymentSettings {
  return {
    id: 'main',
    zelle_recipient: null,
    zelle_qr_code_url: null,
    updated_by: null,
    updated_at: new Date(0).toISOString(),
  }
}

function cleanOptionalText(value: unknown, label: string, maximumLength: number) {
  const text = String(value ?? '').trim()
  if (text.length > maximumLength) throw new Error(`${label} must be ${maximumLength} characters or fewer.`)
  return text || null
}

function cleanOptionalHttpsUrl(value: unknown) {
  const text = cleanOptionalText(value, 'Zelle QR image URL', 2_048)
  if (!text) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('Enter a valid HTTPS URL for the Zelle QR image.')
  }
  if (url.protocol !== 'https:') throw new Error('The Zelle QR image URL must use HTTPS.')
  return url.toString()
}

export async function getLuxorPaymentSettings() {
  const [settings] = await supabaseRest<LuxorPaymentSettings[]>('luxor_payment_settings?select=*&id=eq.main&limit=1')
  return settings ?? defaultSettings()
}

export async function saveLuxorPaymentSettings(input: {
  zelleRecipient?: unknown
  zelleQrCodeUrl?: unknown
  ownerEmail: string
}) {
  const zelleRecipient = cleanOptionalText(input.zelleRecipient, 'Zelle recipient', 160)
  const zelleQrCodeUrl = cleanOptionalHttpsUrl(input.zelleQrCodeUrl)
  const [saved] = await supabaseRest<LuxorPaymentSettings[]>('luxor_payment_settings?on_conflict=id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: 'main',
      zelle_recipient: zelleRecipient,
      zelle_qr_code_url: zelleQrCodeUrl,
      updated_by: input.ownerEmail.toLowerCase(),
      updated_at: new Date().toISOString(),
    }),
  })
  if (!saved) throw new Error('Zelle payment settings could not be saved.')
  return saved
}
