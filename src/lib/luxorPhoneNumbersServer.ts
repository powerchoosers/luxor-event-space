import 'server-only'

import twilio from 'twilio'
import { supabaseRest } from './supabaseRestServer'
import { buildTwilioCallbackUrl, getLuxorTwilioConfig } from './luxorTwilioServer'

export type LuxorManagedPhoneNumber = {
  id: string
  twilio_number_sid: string
  phone_number: string
  friendly_name: string | null
  locality: string | null
  region: string | null
  iso_country: string
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }
  monthly_price: number | null
  price_unit: string | null
  is_active: boolean
  webhooks_configured: boolean
  purchased_by: string | null
  purchased_at: string | null
}

function normalizeCapabilities(value: Record<string, boolean> | null | undefined) {
  return {
    voice: Boolean(value?.voice),
    sms: Boolean(value?.sms ?? value?.SMS),
    mms: Boolean(value?.mms ?? value?.MMS),
  }
}

function twilioClient() {
  const config = getLuxorTwilioConfig()
  return { config, client: twilio(config.accountSid, config.authToken) }
}

export async function getActiveLuxorPhoneNumber() {
  try {
    const [active] = await supabaseRest<LuxorManagedPhoneNumber[]>('luxor_phone_numbers?select=*&is_active=eq.true&limit=1')
    if (active?.phone_number) return active.phone_number
  } catch (error) {
    console.warn('Falling back to the configured Luxor Twilio number:', error)
  }
  return getLuxorTwilioConfig().phoneNumber
}

export async function getSelectedLuxorPhoneNumber() {
  const [active] = await supabaseRest<LuxorManagedPhoneNumber[]>('luxor_phone_numbers?select=*&is_active=eq.true&limit=1')
  return active?.phone_number || null
}

export async function searchAvailableLuxorNumbers(areaCode: string) {
  if (!/^\d{3}$/.test(areaCode)) throw new Error('Enter a three-digit US area code.')
  const { client } = twilioClient()
  const [numbers, pricing] = await Promise.all([
    client.availablePhoneNumbers('US').local.list({ areaCode: Number(areaCode), smsEnabled: true, voiceEnabled: true, excludeAllAddressRequired: true, limit: 20 }),
    client.pricing.v1.phoneNumbers.countries('US').fetch(),
  ])
  const localPrice = pricing.phoneNumberPrices.find((price) => price.numberType === 'local')
  return {
    monthlyPrice: localPrice ? Number(localPrice.currentPrice) : null,
    priceUnit: pricing.priceUnit || 'USD',
    numbers: numbers.map((number) => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      locality: number.locality,
      region: number.region,
      postalCode: number.postalCode,
      capabilities: normalizeCapabilities(number.capabilities),
      addressRequirements: number.addressRequirements,
    })),
  }
}

export async function listOwnedLuxorNumbers() {
  const { config, client } = twilioClient()
  const [owned, managed] = await Promise.all([
    client.incomingPhoneNumbers.list({ limit: 100 }),
    supabaseRest<LuxorManagedPhoneNumber[]>('luxor_phone_numbers?select=*'),
  ])
  const managedBySid = new Map(managed.map((number) => [number.twilio_number_sid, number]))
  const databaseActive = managed.find((number) => number.is_active)?.phone_number
  return owned.map((number) => {
    const saved = managedBySid.get(number.sid)
    return {
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: normalizeCapabilities(number.capabilities),
      voiceUrl: number.voiceUrl,
      smsUrl: number.smsUrl,
      isActive: databaseActive ? number.phoneNumber === databaseActive : number.phoneNumber === config.phoneNumber,
      webhooksConfigured: number.voiceUrl === buildTwilioCallbackUrl('/api/twilio/incoming') && number.smsUrl === buildTwilioCallbackUrl('/api/twilio/messaging/incoming'),
    }
  })
}

async function configureTwilioNumber(sid: string) {
  const { client } = twilioClient()
  return client.incomingPhoneNumbers(sid).update({
    voiceUrl: buildTwilioCallbackUrl('/api/twilio/incoming'),
    voiceMethod: 'POST',
    voiceFallbackUrl: buildTwilioCallbackUrl('/api/twilio/fallback'),
    voiceFallbackMethod: 'POST',
    smsUrl: buildTwilioCallbackUrl('/api/twilio/messaging/incoming'),
    smsMethod: 'POST',
    smsFallbackUrl: buildTwilioCallbackUrl('/api/twilio/messaging/fallback'),
    smsFallbackMethod: 'POST',
  })
}

async function saveManagedNumber(number: { sid: string; phoneNumber: string; friendlyName: string; capabilities: unknown }, input: { active: boolean; ownerEmail: string; monthlyPrice?: number | null; priceUnit?: string | null }) {
  if (input.active) {
    await supabaseRest('luxor_phone_numbers?is_active=eq.true', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }) })
  }
  const [saved] = await supabaseRest<LuxorManagedPhoneNumber[]>('luxor_phone_numbers?on_conflict=twilio_number_sid&select=*', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ twilio_number_sid: number.sid, phone_number: number.phoneNumber, friendly_name: number.friendlyName, capabilities: number.capabilities, monthly_price: input.monthlyPrice ?? null, price_unit: input.priceUnit ?? null, is_active: input.active, webhooks_configured: true, purchased_by: input.ownerEmail, purchased_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  })
  return saved
}

export async function purchaseLuxorNumber(input: { phoneNumber: string; confirmation: string; ownerEmail: string; monthlyPrice?: number | null; priceUnit?: string | null }) {
  if (!/^\+1\d{10}$/.test(input.phoneNumber) || input.confirmation !== input.phoneNumber) throw new Error('Type the complete phone number exactly to confirm the purchase.')
  const { client } = twilioClient()
  const areaCode = input.phoneNumber.slice(2, 5)
  const available = await client.availablePhoneNumbers('US').local.list({ areaCode: Number(areaCode), contains: input.phoneNumber.replace(/\D/g, ''), smsEnabled: true, voiceEnabled: true, limit: 20 })
  if (!available.some((number) => number.phoneNumber === input.phoneNumber)) throw new Error('That number is no longer available. Search again and choose another number.')
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: input.phoneNumber,
    friendlyName: 'Luxor Event Space',
    voiceUrl: buildTwilioCallbackUrl('/api/twilio/incoming'), voiceMethod: 'POST',
    voiceFallbackUrl: buildTwilioCallbackUrl('/api/twilio/fallback'), voiceFallbackMethod: 'POST',
    smsUrl: buildTwilioCallbackUrl('/api/twilio/messaging/incoming'), smsMethod: 'POST',
    smsFallbackUrl: buildTwilioCallbackUrl('/api/twilio/messaging/fallback'), smsFallbackMethod: 'POST',
  })
  return saveManagedNumber(purchased, { active: true, ownerEmail: input.ownerEmail, monthlyPrice: input.monthlyPrice, priceUnit: input.priceUnit })
}

export async function activateLuxorNumber(sid: string, ownerEmail: string) {
  if (!/^PN[0-9a-f]{32}$/i.test(sid)) throw new Error('Invalid Twilio phone-number SID.')
  const number = await configureTwilioNumber(sid)
  return saveManagedNumber(number, { active: true, ownerEmail })
}
