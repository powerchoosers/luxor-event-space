import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validatePaidInvoiceEmailCopy, type PaidInvoiceEmailCopy } from './luxorPaidInvoiceEmailCopy'

export type AgreementClientCopySetting = { key: 'agreement_client'; copy_override: PaidInvoiceEmailCopy | null; revision: number; updated_at: string; updated_by: string | null }

export async function readAgreementClientCopySetting(): Promise<{ setting: AgreementClientCopySetting; installed: boolean }> {
  const fallback: AgreementClientCopySetting = { key: 'agreement_client', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<AgreementClientCopySetting[]>('luxor_agreement_client_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.agreement_client')
    if (rows.length !== 1) throw new Error('Agreement completion settings are incomplete.')
    if (rows[0].copy_override !== null) validatePaidInvoiceEmailCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function saveAgreementClientCopySetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validatePaidInvoiceEmailCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<AgreementClientCopySetting[]>(`luxor_agreement_client_copy_settings?key=eq.agreement_client&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
