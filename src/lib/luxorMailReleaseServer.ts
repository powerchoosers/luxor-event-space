import 'server-only'
import { supabaseRest } from './supabaseRestServer'
import { getLuxorZohoImportAccount, verifyLuxorZohoImportAccount } from './zohoMailServer'

export type LuxorMailReleaseReview = {
  passId: string | null; generation: number | null; snapshotAt: string | null; contentCheckedAt: string | null
  messageCount: number; retainedCount: number; ready: boolean; blockers: string[]; releasedAt: string | null
}

export function getLuxorMailReleaseReview(runId: string) {
  return supabaseRest<LuxorMailReleaseReview | null>('rpc/luxor_mail_history_release_review', {
    method: 'POST', body: JSON.stringify({ p_run_id: runId }),
  })
}

export async function releaseLuxorMailHistory(input: { passId: string; retainMissing: boolean }, reviewedBy: string) {
  const account = getLuxorZohoImportAccount()
  const [run] = await supabaseRest<Array<{ id: string; mailbox: string }>>(
    `luxor_mail_import_runs?select=id,mailbox&account_id=eq.${account.accountId}&limit=1`)
  if (!run || run.mailbox !== account.mailbox) throw new Error('The approved import mailbox changed.')
  // This checks credentials/account identity, not a live atomic source snapshot.
  // The UI explicitly describes the release as a reviewed historical snapshot.
  await verifyLuxorZohoImportAccount()
  await supabaseRest('rpc/luxor_release_mail_history', { method: 'POST', body: JSON.stringify({
    p_run_id: run.id, p_pass_id: input.passId, p_reviewed_by: reviewedBy, p_retain_missing: input.retainMissing,
  }) })
}
