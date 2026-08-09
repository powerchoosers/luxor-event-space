import 'server-only'

import type { LuxorGrandOpeningAttendee } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

export const LUXOR_GRAND_OPENING_CAMPAIGN_KEY = 'grand_opening_2026_07_25'

export async function listLuxorGrandOpeningAttendees(options: { query?: string; attendeeType?: string } = {}) {
  const query = options.query?.trim()
  const attendeeType = options.attendeeType === 'rsvp' || options.attendeeType === 'guest' ? options.attendeeType : ''
  const filters = [
    `campaign_key=eq.${encodeURIComponent(LUXOR_GRAND_OPENING_CAMPAIGN_KEY)}`,
    query ? `full_name=ilike.*${encodeURIComponent(query.replace(/[*(),]/g, ''))}*` : '',
    attendeeType ? `attendee_type=eq.${encodeURIComponent(attendeeType)}` : '',
  ].filter(Boolean)

  return supabaseRest<LuxorGrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?select=*&${filters.join('&')}&order=checked_in_at.desc`,
  )
}

export async function createLuxorGrandOpeningAttendee(input: { fullName: string; phone?: string; attendeeType: 'rsvp' | 'guest'; checkedInAt?: string; notes?: string }) {
  const [created] = await supabaseRest<LuxorGrandOpeningAttendee[]>('luxor_grand_opening_attendees?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      campaign_key: LUXOR_GRAND_OPENING_CAMPAIGN_KEY,
      full_name: input.fullName.trim().slice(0, 160),
      phone: input.phone?.trim().slice(0, 40) || null,
      attendee_type: input.attendeeType,
      checked_in_at: input.checkedInAt || new Date().toISOString(),
      checked_in_by: 'staff',
      metadata: input.notes?.trim() ? { notes: input.notes.trim().slice(0, 1000), source: 'portal_manual_entry' } : { source: 'portal_manual_entry' },
    }),
  })
  return created || null
}

export function buildGrandOpeningAttendeeCsv(attendees: LuxorGrandOpeningAttendee[]) {
  const rows = [
    ['Name', 'Phone', 'Type', 'Checked in at', 'Recorded by'],
    ...attendees.map((attendee) => [
      attendee.full_name,
      attendee.phone || '',
      attendee.attendee_type,
      attendee.checked_in_at,
      attendee.checked_in_by,
    ]),
  ]

  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
}
