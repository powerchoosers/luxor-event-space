import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validateAgreementPackageCopy, type AgreementPackageCopy } from './luxorAgreementPackageCopy'

export type AgreementPackageSetting = {
  key: 'package'
  copy_override: AgreementPackageCopy | null
  revision: number
  updated_at: string
  updated_by: string | null
}

export async function readAgreementPackageSetting(): Promise<{ setting: AgreementPackageSetting; installed: boolean }> {
  const fallback: AgreementPackageSetting = { key: 'package', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<AgreementPackageSetting[]>('luxor_agreement_package_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.package')
    if (rows.length !== 1) throw new Error('Agreement package settings are incomplete.')
    if (rows[0].copy_override !== null) validateAgreementPackageCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function readAgreementPackageCopy(): Promise<AgreementPackageCopy | null> {
  try {
    const { setting } = await readAgreementPackageSetting()
    return setting.copy_override
  } catch {
    return null
  }
}

export async function saveAgreementPackageSetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validateAgreementPackageCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<AgreementPackageSetting[]>(`luxor_agreement_package_copy_settings?key=eq.package&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
