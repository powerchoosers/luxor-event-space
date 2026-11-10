import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { validateProposalBreakdownCopy, type ProposalBreakdownCopy } from './luxorProposalBreakdownCopy'

export type ProposalBreakdownSetting = { key: 'breakdown'; copy_override: ProposalBreakdownCopy | null; revision: number; updated_at: string; updated_by: string | null }

export async function readProposalBreakdownSetting(): Promise<{ setting: ProposalBreakdownSetting; installed: boolean }> {
  const fallback: ProposalBreakdownSetting = { key: 'breakdown', copy_override: null, revision: 0, updated_at: '', updated_by: null }
  try {
    const rows = await supabaseRestStrict<ProposalBreakdownSetting[]>('luxor_proposal_breakdown_copy_settings?select=key,copy_override,revision,updated_at,updated_by&key=eq.breakdown')
    if (rows.length !== 1) throw new Error('Proposal breakdown settings are incomplete.')
    if (rows[0].copy_override !== null) validateProposalBreakdownCopy(rows[0].copy_override)
    return { setting: rows[0], installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { setting: fallback, installed: false }
    throw error
  }
}

export async function saveProposalBreakdownSetting(copy: unknown, revision: unknown, actor: string) {
  const value = copy === null ? null : validateProposalBreakdownCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<ProposalBreakdownSetting[]>(`luxor_proposal_breakdown_copy_settings?key=eq.breakdown&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}

export async function readProposalBreakdownCopy(): Promise<ProposalBreakdownCopy | null> {
  const { setting, installed } = await readProposalBreakdownSetting()
  if (!installed) return null
  return setting.copy_override
}
