import 'server-only'

import { LuxorNote, LuxorNoteType } from './luxorInquiryTypes'

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

export async function listNotesByInquiry(inquiryId: string) {
  return supabaseRest<LuxorNote[]>(
    `luxor_notes?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.asc`
  )
}

export async function listRecentNotes(limit = 10) {
  return supabaseRest<LuxorNote[]>(
    `luxor_notes?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`
  )
}


export async function createNote(
  inquiryId: string,
  content: string,
  noteType: LuxorNoteType = 'note',
  author = 'Portal User'
) {
  if (!content.trim()) {
    throw new Error('Note content cannot be empty.')
  }

  const [created] = await supabaseRest<LuxorNote[]>('luxor_notes?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: inquiryId,
      content: content.trim(),
      note_type: noteType,
      author: author.trim(),
    }),
  })

  return created
}
