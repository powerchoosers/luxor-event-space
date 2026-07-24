import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'

export type LuxorUserProfile = {
  email: string
  displayName: string
  roleTitle: string
  avatarUrl: string | null
}

type LuxorUserPreferenceRow = {
  email: string
  display_name?: string | null
  role_title?: string | null
  avatar_url?: string | null
}

function titleCaseEmailName(email: string) {
  const localPart = email.split('@')[0] || 'Luxor Team'
  return localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Luxor Team'
}

export function safeProfileAvatarUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function getLuxorUserProfile(email: string): Promise<LuxorUserProfile> {
  const normalizedEmail = email.trim().toLowerCase()
  const rows = await supabaseRest<LuxorUserPreferenceRow[]>(
    `luxor_user_preferences?email=eq.${encodeURIComponent(normalizedEmail)}&select=email,display_name,role_title,avatar_url`
  )
  const row = rows?.[0]

  return {
    email: normalizedEmail,
    displayName: row?.display_name?.trim() || titleCaseEmailName(normalizedEmail),
    roleTitle: row?.role_title?.trim() || 'Luxor Event Space Team',
    avatarUrl: safeProfileAvatarUrl(row?.avatar_url),
  }
}
