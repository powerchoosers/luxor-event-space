import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validateOfferReminderCopy, type OfferReminderCopy } from './luxorOfferReminderCopy'

export type OfferReminderSetting = { key: 'offer'; copy_override: OfferReminderCopy | null; revision: number; updated_at: string; updated_by: string | null }
export async function readOfferReminderSetting(): Promise<{ setting: OfferReminderSetting; installed: boolean }> {
  const fallback: OfferReminderSetting = { key: 'offer', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<OfferReminderSetting[]>('luxor_offer_reminder_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.offer')
    if (rows.length !== 1) throw new Error('Offer reminder settings are incomplete.')
    if (rows[0].copy_override !== null) validateOfferReminderCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}
export async function saveOfferReminderSetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validateOfferReminderCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<OfferReminderSetting[]>(`luxor_offer_reminder_copy_settings?key=eq.offer&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This reminder changed. Reload before saving.')
  return row
}
