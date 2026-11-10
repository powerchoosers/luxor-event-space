import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validatePaidInvoiceEmailCopy, type PaidInvoiceEmailCopy } from './luxorPaidInvoiceEmailCopy'

export type PaymentReceiptCopySetting = { key: 'payment_receipt'; copy_override: PaidInvoiceEmailCopy | null; revision: number; updated_at: string; updated_by: string | null }

export async function readPaymentReceiptCopySetting(): Promise<{ setting: PaymentReceiptCopySetting; installed: boolean }> {
  const fallback: PaymentReceiptCopySetting = { key: 'payment_receipt', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<PaymentReceiptCopySetting[]>('luxor_payment_receipt_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.payment_receipt')
    if (rows.length !== 1) throw new Error('Payment receipt settings are incomplete.')
    if (rows[0].copy_override !== null) validatePaidInvoiceEmailCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function savePaymentReceiptCopySetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validatePaidInvoiceEmailCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<PaymentReceiptCopySetting[]>(`luxor_payment_receipt_copy_settings?key=eq.payment_receipt&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
