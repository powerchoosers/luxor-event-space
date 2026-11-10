import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { EVENT_EMAIL_KEYS, validateEventEmailCopy, type EventEmailCopy, type EventEmailKey } from './luxorEventEmailCopy'
export type EventEmailSetting = { key: EventEmailKey; copy_override: EventEmailCopy | null; revision: number; updated_at: string; updated_by: string | null }
export async function readEventEmailSettings(): Promise<{ settings: EventEmailSetting[]; installed: boolean }> {
  const fallback = EVENT_EMAIL_KEYS.map((key) => ({ key, copy_override: null, revision: 0, updated_at: '', updated_by: null }))
  try {
    const rows = await supabaseRestStrict<EventEmailSetting[]>('luxor_event_email_copy_settings?select=key,copy_override,revision,updated_at,updated_by')
    if (rows.length !== EVENT_EMAIL_KEYS.length || EVENT_EMAIL_KEYS.some((key) => !rows.some((row) => row.key === key))) throw new Error('Event email settings are incomplete.')
    for (const row of rows) if (row.copy_override !== null) validateEventEmailCopy(row.copy_override)
    return { settings: rows, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { settings: fallback, installed: false }
    throw error
  }
}
export async function saveEventEmailSetting(key: EventEmailKey, copy: unknown, revision: unknown, actor: string) {
  if (!EVENT_EMAIL_KEYS.includes(key)) throw new Error('Unknown event email.')
  const value = copy === null ? null : validateEventEmailCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<EventEmailSetting[]>(`luxor_event_email_copy_settings?key=eq.${key}&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
