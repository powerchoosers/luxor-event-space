import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validatePaymentRequestReminderCopy, type PaymentRequestReminderCopy } from './luxorPaymentRequestReminderCopy'
export type PaymentRequestReminderSetting = { key: 'payment'; copy_override: PaymentRequestReminderCopy | null; revision: number; updated_at: string; updated_by: string | null }
export async function readPaymentRequestReminderSetting(): Promise<{ setting: PaymentRequestReminderSetting; installed: boolean }> {
  const fallback: PaymentRequestReminderSetting = { key: 'payment', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<PaymentRequestReminderSetting[]>('luxor_payment_request_reminder_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.payment')
    if (rows.length !== 1) throw new Error('Payment reminder settings are incomplete.')
    if (rows[0].copy_override !== null) validatePaymentRequestReminderCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}
export async function savePaymentRequestReminderSetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validatePaymentRequestReminderCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<PaymentRequestReminderSetting[]>(`luxor_payment_request_reminder_copy_settings?key=eq.payment&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This reminder changed. Reload before saving.')
  return row
}
