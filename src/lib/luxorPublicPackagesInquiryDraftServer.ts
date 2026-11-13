import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import {
  PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION,
  type PublicPackagesConfiguratorInput,
  type PublicPackagesQuote,
} from '@/lib/luxorPublicPackagesConfigurator'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const LUXOR_PACKAGES_INQUIRY_DRAFT_COOKIE = 'luxor_packages_inquiry_draft'
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7

function draftSecret() {
  const secret = process.env.LUXOR_PORTAL_SESSION_SECRET || process.env.LUXOR_PACKAGES_DRAFT_SECRET
  if (!secret) throw new Error('Missing LUXOR_PORTAL_SESSION_SECRET for package inquiry drafts.')
  return secret
}

function sign(value: string) {
  return crypto.createHmac('sha256', draftSecret()).update(value).digest('base64url')
}

export type PackagesInquiryDraftRecord = {
  id: string
  created_at: string
  expires_at: string
  locale: 'en' | 'es'
  configurator_input: PublicPackagesConfiguratorInput
  quote_snapshot: {
    schema_version: number
    summary_lines: PublicPackagesQuote['summaryLines']
    totals: PublicPackagesQuote['totals']
    payment_schedule_preview: PublicPackagesQuote['paymentSchedulePreview']
    pricing_config_version: number | null
    errors: string[]
  }
  pricing_config_version: number | null
  inquiry_id?: string | null
}

export type SignedPackagesDraftToken = {
  draftId: string
  issuedAt: number
  signature: string
}

export function encodePackagesDraftToken(draftId: string) {
  const issuedAt = Date.now()
  const payload = `${draftId}.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

export function decodePackagesDraftToken(token: string): SignedPackagesDraftToken | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [draftId, issuedAtRaw, signature] = parts
  if (!draftId || !issuedAtRaw || !signature) return null
  const payload = `${draftId}.${issuedAtRaw}`
  const expected = sign(payload)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return null
  const issuedAt = Number(issuedAtRaw)
  if (!Number.isFinite(issuedAt)) return null
  return { draftId, issuedAt, signature }
}

export async function savePackagesInquiryDraft(input: {
  locale: 'en' | 'es'
  configuratorInput: PublicPackagesConfiguratorInput
  quote: PublicPackagesQuote
  pricingConfigVersion: number | null
}): Promise<PackagesInquiryDraftRecord> {
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString()
  const payload = {
    locale: input.locale,
    configurator_input: input.configuratorInput,
    quote_snapshot: {
      schema_version: PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION,
      summary_lines: input.quote.summaryLines,
      totals: input.quote.totals,
      payment_schedule_preview: input.quote.paymentSchedulePreview,
      pricing_config_version: input.pricingConfigVersion,
      errors: input.quote.errors,
    },
    pricing_config_version: input.pricingConfigVersion,
    expires_at: expiresAt,
  }
  const [created] = await supabaseRest<PackagesInquiryDraftRecord[]>('luxor_package_inquiry_drafts?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!created) throw new Error('Unable to save your event configuration.')
  return created
}

export async function getPackagesInquiryDraft(draftId: string) {
  const [draft] = await supabaseRest<PackagesInquiryDraftRecord[]>(
    `luxor_package_inquiry_drafts?select=*&id=eq.${encodeURIComponent(draftId)}&limit=1`,
  )
  if (!draft) return null
  if (draft.expires_at && Date.parse(draft.expires_at) <= Date.now()) return null
  return draft
}

export async function attachPackagesDraftToInquiry(draftId: string, inquiryId: string) {
  await supabaseRest(`luxor_package_inquiry_drafts?id=eq.${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ inquiry_id: inquiryId, updated_at: new Date().toISOString() }),
  })
}

export async function readPackagesDraftCookieToken() {
  const jar = await cookies()
  return jar.get(LUXOR_PACKAGES_INQUIRY_DRAFT_COOKIE)?.value || null
}

export async function setPackagesDraftCookie(token: string) {
  const jar = await cookies()
  jar.set(LUXOR_PACKAGES_INQUIRY_DRAFT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DRAFT_TTL_MS / 1000,
  })
}

export async function clearPackagesDraftCookie() {
  const jar = await cookies()
  jar.delete(LUXOR_PACKAGES_INQUIRY_DRAFT_COOKIE)
}
