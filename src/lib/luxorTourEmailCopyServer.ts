import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { TOUR_EMAIL_NOTICE_KEYS, validateTourEmailCopy, type TourEmailCopy, type TourEmailNoticeKey } from './luxorTourEmailCopy'

export type TourEmailCopySetting = { notice_key: TourEmailNoticeKey; copy_override: TourEmailCopy | null; revision: number; updated_at: string; updated_by: string | null }
export async function readTourEmailCopySettings(): Promise<{ settings: TourEmailCopySetting[]; installed: boolean }> {
  const fallback = TOUR_EMAIL_NOTICE_KEYS.map((notice_key) => ({ notice_key, copy_override: null, revision: 0, updated_at: '', updated_by: null }))
  try {
    const rows = await supabaseRestStrict<TourEmailCopySetting[]>('luxor_tour_email_copy_settings?select=notice_key,copy_override,revision,updated_at,updated_by')
    if (rows.length !== TOUR_EMAIL_NOTICE_KEYS.length || TOUR_EMAIL_NOTICE_KEYS.some((key) => !rows.some((row) => row.notice_key === key))) throw new Error('Tour email settings are incomplete.')
    for (const row of rows) if (row.copy_override !== null) validateTourEmailCopy(row.copy_override)
    return { settings: rows, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { settings: fallback, installed: false }
    throw error
  }
}

export async function saveTourEmailCopySetting(key: TourEmailNoticeKey, copy: unknown, revision: unknown, actor: string) {
  if (!TOUR_EMAIL_NOTICE_KEYS.includes(key)) throw new Error('Unknown tour notice.')
  const value = copy === null ? null : validateTourEmailCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<TourEmailCopySetting[]>(`luxor_tour_email_copy_settings?notice_key=eq.${key}&revision=eq.${revision}&select=notice_key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
