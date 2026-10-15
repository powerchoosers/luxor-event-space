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
          form: {
            eventType: input.eventType ?? null,
            targetDate: input.targetDate ?? null,
            guestCount: input.guestCount ?? null,
            budget: input.budget ?? null,
            preferredTourDate: input.preferredTourDate ?? null,
            preferredTourTime: input.preferredTourTime ?? null,
            packageInterest: input.packageInterest ?? null,
            message: input.message ?? null,
            flow: input.flow ?? null,
            metadata: input.metadata ?? {},
          },
          submittedBy: 'server_classification',
          submittedAt: new Date().toISOString(),
          userAgent: request.userAgent?.slice(0, 500) ?? null,
        },
      }),
    },
  )
  const workflow = result.run.status === 'in_progress'
    ? await prepareLuxorTestSubmission(input, result.run.id)
    : null
  return {
    leadId: result.lead.id,
    run: { id: result.run.id, status: result.run.status, source: result.run.source, started_at: result.run.started_at },
    replayed: result.replayed,
    ...(workflow ? { workflow } : {}),
  }
}

async function prepareLuxorTestSubmission(input: LuxorInquiryInput, runId: string) {
  const flow = String(input.flow || '')
  const source = String(input.source || '').toLowerCase()
  if (flow === 'elena_contact' || source === 'manual entry') return null

  const isTourIntent = ['visit_booking', 'custom_visit_request', 'tour_booking'].includes(flow)
    || Boolean(input.preferredTourDate || input.preferredTourTime)
    || input.metadata?.autoScheduleTour === true
  const isConfirmedSlot = isTourIntent && flow === 'visit_booking'
    && input.metadata?.autoScheduleTour === true
    && typeof input.metadata?.selectedTourSlotId === 'string'
    && input.metadata.selectedTourSlotId.length > 0

  const brochureSubmission = flow === 'brochure_lead' || source === 'homepage_brochure'
  const emailSteps = isTourIntent
    ? [{ category: 'tour_confirmation' as const, automaticSource: 'public_tour_submission' }]
    : brochureSubmission
      ? [
        { category: 'form_confirmation' as const, automaticSource: 'public_inquiry_submission' },
        { category: 'brochure' as const, automaticSource: 'public_brochure_submission' },
      ]
      : flow === 'newsletter_signup'
        ? [{ category: 'form_confirmation' as const, automaticSource: 'public_newsletter_submission' }]
        : flow === 'contact_form'
          ? [{ category: 'form_confirmation' as const, automaticSource: 'public_inquiry_submission' }]
          : []
  if (!isTourIntent && (!emailSteps.length || !input.email)) return null

  const { buildLuxorTestEmailTemplate } = await import('@/lib/luxorTestEmailTemplates')
  const workflows: Record<string, unknown>[] = []
  for (const step of emailSteps) {
    const template = await buildLuxorTestEmailTemplate(step.category, runId, {
      flow,
      preferredTourDate: input.preferredTourDate ?? null,
      preferredTourTime: input.preferredTourTime ?? null,
      confirmedSlot: isConfirmedSlot,
    })
    const workflow = await supabaseRest<Record<string, unknown>>('rpc/luxor_prepare_test_submission', {
      method: 'POST',
      body: JSON.stringify({
        p_test_run_id: runId,
        p_tour_intent: isTourIntent,
        p_preferred_tour_date: input.preferredTourDate || null,
        p_preferred_tour_time: input.preferredTourTime || null,
        p_confirmed_slot: isConfirmedSlot,
        p_email_category: step.category,
        p_email_subject: template.subject,
        p_email_body: template.body,
        p_automatic_source: step.automaticSource,
      }),
    })
    workflows.push(workflow)
  }
  return {
    tour_simulated: isTourIntent,
    ...(isTourIntent ? { tour_status: workflows[0]?.tour_status ?? null } : {}),
    test_emails_queued: workflows.filter((workflow) => workflow.test_email_queued === true).length,
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

export async function recordLuxorTestEmailSimulation(input: {
  inquiryId: string
  category?: string
  subject?: string
  source: string
}) {
  const [lead] = await supabaseRest<Array<{ id: string; is_test?: boolean }>>(
    `luxor_inquiries?select=id,is_test&id=eq.${encodeURIComponent(input.inquiryId)}&limit=1`,
  )
  if (lead?.is_test !== true) return null
  return supabaseRest<Record<string, unknown>>('rpc/luxor_record_test_email_simulation', {
    method: 'POST',
    body: JSON.stringify({
      p_test_lead_id: input.inquiryId,
      p_category: input.category || 'direct_message',
      p_subject: input.subject || '',
      p_source: input.source,
    }),
  })
}

export async function enqueueLuxorTestEmail(input: {
  testRunId: string
  category: string
  subject: string
  body: string
  source: string
}) {
  return supabaseRest<Record<string, unknown>>('rpc/luxor_enqueue_test_email', {
    method: 'POST',
    body: JSON.stringify({
      p_test_run_id: input.testRunId,
      p_category: input.category,
      p_subject: input.subject,
      p_body: input.body,
      p_source: input.source,
    }),
  })
}

export async function recordLuxorTestSmsSimulation(input: { inquiryId: string; body: string; source: string }) {
  const [lead] = await supabaseRest<Array<{ id: string; is_test?: boolean }>>(
    `luxor_inquiries?select=id,is_test&id=eq.${encodeURIComponent(input.inquiryId)}&limit=1`,
  )
  if (lead?.is_test !== true) return null
  return supabaseRest<Record<string, unknown>>('rpc/luxor_record_test_sms_simulation', {
    method: 'POST',
    body: JSON.stringify({ p_test_lead_id: input.inquiryId, p_body: input.body, p_source: input.source }),
  })
}

/** Block transaction-like production paths until an isolated test simulator handles them. */
export async function assertLuxorProductionSideEffectsAllowed(inquiryId: string) {
  if (!inquiryId) return
  let lead: { id: string; is_test?: boolean } | undefined
  try {
    ;[lead] = await supabaseRest<Array<{ id: string; is_test?: boolean }>>(
      `luxor_inquiries?select=id,is_test&id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/column .*is_test.* does not exist|could not find .*is_test.* in the schema cache/i.test(message)) return
    throw error
  }
  if (lead?.is_test === true) {
    throw new Error('This is the permanent test lead. This production action is blocked until its isolated simulator is enabled.')
  }
}

export async function getTestInquiriesById(inquiryIds: string[]) {
  if (!inquiryIds.length) return []
  try {
    return await supabaseRest<Array<{ id: string }>>(
      `luxor_inquiries?select=id&is_test=eq.true&id=in.(${inquiryIds.map(encodeURIComponent).join(',')})`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/column .*is_test.* does not exist|could not find .*is_test.* in the schema cache/i.test(message)) return []
    throw error
  }
}
