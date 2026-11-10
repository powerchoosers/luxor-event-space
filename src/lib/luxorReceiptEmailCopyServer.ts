import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validateInquiryEmailCopy, type InquiryEmailCopy } from './luxorInquiryEmailCopy'

export type ReceiptEmailKey = 'tour_request_received' | 'newsletter_confirmation'
export type ReceiptEmailSetting = { key: ReceiptEmailKey; copy_override: InquiryEmailCopy | null; revision: number; updated_at: string; updated_by: string | null }

export async function readReceiptEmailCopy(key: ReceiptEmailKey): Promise<{ setting: ReceiptEmailSetting; installed: boolean }> {
  const fallback: ReceiptEmailSetting = { key, copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<ReceiptEmailSetting[]>(`luxor_receipt_email_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.${key}`)
    if (rows.length !== 1) throw new Error('Receipt email settings are incomplete.')
    if (rows[0].copy_override !== null) validateInquiryEmailCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function saveReceiptEmailCopy(key: ReceiptEmailKey, copy: unknown, revision: unknown, actor: string) {
  if (key !== 'tour_request_received' && key !== 'newsletter_confirmation') throw new Error('Unknown receipt.')
  const value = copy === null ? null : validateInquiryEmailCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<ReceiptEmailSetting[]>(`luxor_receipt_email_copy_settings?key=eq.${key}&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }) })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
