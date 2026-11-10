import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { FINAL_PAYMENT_REMINDER_KEYS, validateFinalPaymentReminderCopy, type FinalPaymentReminderCopy, type FinalPaymentReminderKey } from './luxorFinalPaymentReminderCopy'
export type FinalPaymentReminderSetting = { key: FinalPaymentReminderKey; copy_override: FinalPaymentReminderCopy | null; revision: number; updated_at: string; updated_by: string | null }
export async function readFinalPaymentReminderSettings(): Promise<{ settings: FinalPaymentReminderSetting[]; installed: boolean }> {
  const fallback = FINAL_PAYMENT_REMINDER_KEYS.map((key) => ({ key, copy_override: null, revision: 0, updated_at: '', updated_by: null }))
  try {
    const rows = await supabaseRestStrict<FinalPaymentReminderSetting[]>('luxor_final_payment_reminder_copy_settings?select=key,copy_override,revision,updated_at,updated_by')
    if (rows.length !== FINAL_PAYMENT_REMINDER_KEYS.length || FINAL_PAYMENT_REMINDER_KEYS.some((key) => !rows.some((row) => row.key === key))) throw new Error('Final payment reminder settings are incomplete.')
    for (const row of rows) if (row.copy_override !== null) validateFinalPaymentReminderCopy(row.copy_override)
    return { settings: rows, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { settings: fallback, installed: false }
    throw error
  }
}
export async function saveFinalPaymentReminderSetting(key: FinalPaymentReminderKey, copy: unknown, revision: unknown, actor: string) {
  if (!FINAL_PAYMENT_REMINDER_KEYS.includes(key)) throw new Error('Unknown reminder.')
  const value = copy === null ? null : validateFinalPaymentReminderCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<FinalPaymentReminderSetting[]>(`luxor_final_payment_reminder_copy_settings?key=eq.${key}&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This reminder changed. Reload before saving.')
  return row
}
