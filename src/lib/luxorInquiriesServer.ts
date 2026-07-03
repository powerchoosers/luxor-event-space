import 'server-only'

import { compactText, LuxorInquiry, LuxorInquiryInput, parseGuestCount } from './luxorInquiryTypes'

type SupabaseError = {
  message?: string
  error?: string
  details?: string
  hint?: string
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SupabaseError
    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  return (await response.json()) as T
}

export function normalizeInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const fullName = compactText(input.fullName)
  const email = compactText(input.email).toLowerCase()
  const phone = compactText(input.phone)
  const message = typeof input.message === 'string' ? input.message.trim() : ''

  if (!fullName) {
    throw new Error('Please add your full name.')
  }

  if (!email && !phone) {
    throw new Error('Please add either an email or phone number so Luxor can follow up.')
  }

  return {
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    event_type: compactText(input.eventType) || null,
    target_date: compactText(input.targetDate) || null,
    guest_count: parseGuestCount(input.guestCount),
    preferred_tour_date: compactText(input.preferredTourDate) || null,
    preferred_tour_time: compactText(input.preferredTourTime) || null,
    package_interest: compactText(input.packageInterest) || null,
    message: message || null,
    source: compactText(input.source) || 'website',
    flow: compactText(input.flow) || 'tour_request',
    page_path: compactText(input.pagePath) || null,
    referrer: compactText(input.referrer) || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    metadata: input.metadata ?? {},
  }
}

export async function createLuxorInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const row = normalizeInquiry(input, userAgent)
  const status = row.preferred_tour_date || row.preferred_tour_time ? 'tour_requested' : 'new'

  const [created] = await supabaseRest<LuxorInquiry[]>('luxor_inquiries?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...row, status }),
  })

  return created
}

export async function listLuxorInquiries(limit = 50) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function listLuxorTourRequests(limit = 100) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&preferred_tour_date=not.is.null&order=preferred_tour_date.asc,preferred_tour_time.asc&limit=${encodeURIComponent(limit)}`,
  )
}
