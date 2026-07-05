import 'server-only'

import { compactText, LuxorInquiry, LuxorInquiryInput, parseGuestCount } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import {
  applyTourSlotToInquiry,
  assertTourSlotCanBeBooked,
  getLuxorTourSlot,
  reserveLuxorTourSlot,
} from './luxorTourSlotsServer'

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
  const selectedTourSlotId =
    typeof row.metadata?.selectedTourSlotId === 'string' ? row.metadata.selectedTourSlotId : null

  const selectedTourSlot = selectedTourSlotId ? await getLuxorTourSlot(selectedTourSlotId) : null

  if (selectedTourSlotId) {
    assertTourSlotCanBeBooked(selectedTourSlot)
    applyTourSlotToInquiry(row, selectedTourSlot!)
  }

  const status = row.preferred_tour_date || row.preferred_tour_time ? 'tour_requested' : 'new'

  const [created] = await supabaseRest<LuxorInquiry[]>('luxor_inquiries?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...row, status }),
  })

  if (created && selectedTourSlot) {
    await reserveLuxorTourSlot(selectedTourSlot)
  }

  return created
}

export async function listLuxorInquiries(limit = 50) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function getLuxorInquiry(id: string) {
  const [inquiry] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )

  return inquiry ?? null
}

export async function listLuxorTourRequests(limit = 100) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&preferred_tour_date=not.is.null&order=preferred_tour_date.asc,preferred_tour_time.asc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function updateLuxorInquiry(id: string, updates: Partial<Record<string, unknown>>) {
  const [updated] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString(),
      }),
    }
  )
  return updated ?? null
}
