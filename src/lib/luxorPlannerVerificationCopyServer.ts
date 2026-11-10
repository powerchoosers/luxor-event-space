import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validatePlannerVerificationCopy, type PlannerVerificationCopy } from './luxorPlannerVerificationCopy'

export type PlannerVerificationSetting = { key: 'verification'; copy_override: PlannerVerificationCopy | null; revision: number; updated_at: string; updated_by: string | null }

export async function readPlannerVerificationSetting(): Promise<{ setting: PlannerVerificationSetting; installed: boolean }> {
  const fallback: PlannerVerificationSetting = { key: 'verification', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<PlannerVerificationSetting[]>('luxor_planner_verification_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.verification')
    if (rows.length !== 1) throw new Error('Planner verification settings are incomplete.')
    if (rows[0].copy_override !== null) validatePlannerVerificationCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function savePlannerVerificationSetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validatePlannerVerificationCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<PlannerVerificationSetting[]>(`luxor_planner_verification_copy_settings?key=eq.verification&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}
