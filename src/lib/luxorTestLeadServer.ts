import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { matchesTestLeadIdentifiers } from '@/lib/luxorTestLeadPolicy'

export type LuxorTestSettings = {
  id: number
  enabled: boolean
  identification_email: string
  identification_phone: string
  email_recipient: string | null
  email_recipient_confirmed_at: string | null
  updated_by: string | null
  updated_at: string
}

export async function getLuxorTestSettings() {
  const rows = await supabaseRest<LuxorTestSettings[]>('luxor_test_settings?select=*&id=eq.1&limit=1')
  return rows[0] ?? null
}

export async function isConfiguredTestSubmission(input: Pick<LuxorInquiryInput, 'email' | 'phone'>) {
  const settings = await getLuxorTestSettings()
  return { settings, matches: matchesTestLeadIdentifiers(input, settings) }
}

export async function startLuxorTestRun(input: LuxorInquiryInput, request: { idempotencyKey: string; userAgent?: string }) {
  const result = await supabaseRest<{ lead: { id: string }; run: { id: string; status: string; source: string; started_at: string }; replayed: boolean }>(
    'rpc/luxor_start_test_run',
    {
      method: 'POST',
      body: JSON.stringify({
        p_idempotency_key: request.idempotencyKey,
        p_source: input.source || input.flow || 'website',
        p_submitted_email: input.email ?? null,
        p_submitted_phone: input.phone ?? null,
        p_submitted_details: {
          ...input,
          submittedAt: new Date().toISOString(),
          userAgent: request.userAgent?.slice(0, 500) ?? null,
        },
      }),
    },
  )
  return {
    leadId: result.lead.id,
    run: { id: result.run.id, status: result.run.status, source: result.run.source, started_at: result.run.started_at },
    replayed: result.replayed,
  }
}

export async function saveLuxorTestSettings(input: {
  identificationEmail: string
  identificationPhone: string
  emailRecipient: string
  emailRecipientConfirmed: boolean
  enabled: boolean
  updatedBy: string
}) {
  const result = await supabaseRest<LuxorTestSettings | LuxorTestSettings[]>('rpc/luxor_save_test_settings', {
    method: 'POST',
    body: JSON.stringify({
      p_identification_email: input.identificationEmail,
      p_identification_phone: input.identificationPhone,
      p_email_recipient: input.emailRecipient,
      p_email_recipient_confirmed: input.emailRecipientConfirmed,
      p_enabled: input.enabled,
      p_updated_by: input.updatedBy,
    }),
  })
  return Array.isArray(result) ? result[0] ?? null : result ?? null
}

export async function resetLuxorTestRun(testRunId: string) {
  const result = await supabaseRest<{ run: { id: string; status: string }; replayed: boolean }>(
    'rpc/luxor_reset_test_run',
    { method: 'POST', body: JSON.stringify({ p_test_run_id: testRunId }) },
  )
  return { run: { id: result.run.id, status: result.run.status }, replayed: result.replayed }
}
