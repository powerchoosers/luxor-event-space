import 'server-only'

import { supabaseRest } from './supabaseRestServer'

/** Rechecked by the worker, not just when a campaign is composed. */
export async function isLuxorMarketingDeliveryBlocked(email: string, ignoreUnsubscribe = false, campaignId?: string) {
  const rows = await supabaseRest<Array<{ reason: string; metadata: Record<string, unknown> }>>(
    `luxor_marketing_suppressions?select=reason,metadata&email=eq.${encodeURIComponent(email.trim().toLowerCase())}&limit=1`,
  )
  if (!rows.length) return false
  if (rows.some((row) => row.reason !== 'unsubscribe' || row.metadata?.blockMarketingDelivery === true)) return true
  // Existing explicitly requested transactional confirmations are tracked as
  // campaigns. Preserve their saved unsubscribe exception, never a bounce or
  // complaint exception. Do not infer it from job type alone.
  if (!ignoreUnsubscribe && campaignId && /^[0-9a-f-]{36}$/i.test(campaignId)) {
    const campaigns = await supabaseRest<Array<{ metadata: Record<string, unknown> }>>(
      `luxor_marketing_campaigns?select=metadata&id=eq.${encodeURIComponent(campaignId)}&limit=1`,
    )
    ignoreUnsubscribe = campaigns[0]?.metadata?.ignore_suppressions === true
  }
  return !ignoreUnsubscribe
}

export async function recordLuxorMarketingJobResult(jobId: string, status: 'sent' | 'failed' | 'cancelled', error?: string) {
  await supabaseRest('rpc/luxor_marketing_job_result', {
    method: 'POST', body: JSON.stringify({ p_job_id: jobId, p_status: status, p_error: error || null }),
  })
}
