import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { matchesTestLeadIdentifiers } from '@/lib/luxorTestLeadPolicy'
import { getLuxorBrochureFollowUpSequence, scheduleBrochureFollowUpOffsets } from '@/lib/luxorFollowUpsServer'
import type { LuxorFollowUpTemplate } from '@/lib/luxorFollowUpsServer'

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
            marketingOptIn: input.marketingOptIn === true,
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
  let workflow: Record<string, unknown> | null = null
  if (result.run.status === 'in_progress') {
    // Idempotent replays must use the consent, contact, and timing saved by
    // the original request. The current retry payload is never authoritative.
    const [storedRun] = await supabaseRest<Array<{
      id: string
      status: string
      source: string
      started_at: string
      submitted_email: string | null
      submitted_phone: string | null
      submitted_details: { form?: Record<string, unknown> } | null
    }>>(`luxor_test_runs?select=id,status,source,started_at,submitted_email,submitted_phone,submitted_details&id=eq.${encodeURIComponent(result.run.id)}&limit=1`)
    if (!storedRun || storedRun.status !== 'in_progress') {
      throw new Error('The saved test run is no longer active; no workflow actions were prepared.')
    }
    const form = storedRun.submitted_details?.form || {}
    const runInput: LuxorInquiryInput = {
      fullName: 'Luxor Test Lead',
      email: storedRun.submitted_email || undefined,
      phone: storedRun.submitted_phone || undefined,
      source: storedRun.source,
      eventType: typeof form.eventType === 'string' ? form.eventType : undefined,
      targetDate: typeof form.targetDate === 'string' ? form.targetDate : undefined,
      guestCount: typeof form.guestCount === 'string' ? form.guestCount : undefined,
      budget: typeof form.budget === 'string' ? form.budget : undefined,
      preferredTourDate: typeof form.preferredTourDate === 'string' ? form.preferredTourDate : undefined,
      preferredTourTime: typeof form.preferredTourTime === 'string' ? form.preferredTourTime : undefined,
      marketingOptIn: form.marketingOptIn === true,
      packageInterest: typeof form.packageInterest === 'string' ? form.packageInterest : undefined,
      message: typeof form.message === 'string' ? form.message : undefined,
      flow: typeof form.flow === 'string' ? form.flow : undefined,
      metadata: form.metadata && typeof form.metadata === 'object' ? form.metadata as Record<string, unknown> : {},
    }
    workflow = await prepareLuxorTestSubmission(runInput, storedRun.id, storedRun.started_at)
  }
  return {
    leadId: result.lead.id,
    run: { id: result.run.id, status: result.run.status, source: result.run.source, started_at: result.run.started_at },
    replayed: result.replayed,
    ...(workflow ? { workflow } : {}),
  }
}

async function prepareLuxorTestSubmission(input: LuxorInquiryInput, runId: string, startedAt: string) {
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
  const emailSteps: { category: 'tour_confirmation' | 'tour_reminder' | 'form_confirmation' | 'brochure'; automaticSource: string; scheduledFor?: string; template?: { subject: string; body: string } }[] = isTourIntent
    ? [{ category: 'tour_confirmation', automaticSource: 'public_tour_submission' }]
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

  let preparedTour: Awaited<ReturnType<typeof import('@/lib/luxorTestEmailTemplates').buildLuxorTestTourPlan>> | null = null
  if (isConfirmedSlot && input.preferredTourDate && input.preferredTourTime) {
    const { buildLuxorTestTourPlan } = await import('@/lib/luxorTestEmailTemplates')
    preparedTour = await buildLuxorTestTourPlan(runId, input.preferredTourDate, input.preferredTourTime)
    emailSteps[0].template = preparedTour.emails.confirmation
    emailSteps.push(
      { category: 'tour_reminder', automaticSource: 'public_tour_reminder_24', scheduledFor: preparedTour.scheduledFor.reminder_24, template: preparedTour.emails.reminder_24 },
      { category: 'tour_reminder', automaticSource: 'public_tour_reminder_2', scheduledFor: preparedTour.scheduledFor.reminder_2, template: preparedTour.emails.reminder_2 },
    )
  }

  const { buildLuxorTestEmailTemplate } = await import('@/lib/luxorTestEmailTemplates')
  const workflows: Record<string, unknown>[] = []
  for (const step of emailSteps) {
    const template = step.template || await buildLuxorTestEmailTemplate(step.category, runId, {
      flow,
      preferredTourDate: input.preferredTourDate ?? null,
      preferredTourTime: input.preferredTourTime ?? null,
      confirmedSlot: isConfirmedSlot,
    })
    const workflow = await supabaseRest<Record<string, unknown>>('rpc/luxor_prepare_test_submission', {
      method: 'POST',
      body: JSON.stringify({
        p_test_run_id: runId,
        p_tour_intent: isTourIntent && step.category === 'tour_confirmation',
        p_preferred_tour_date: input.preferredTourDate || null,
        p_preferred_tour_time: input.preferredTourTime || null,
        p_confirmed_slot: isConfirmedSlot,
        p_email_category: step.category,
        p_email_subject: template.subject,
        p_email_body: template.body,
        p_automatic_source: step.automaticSource,
        p_scheduled_for: step.scheduledFor || preparedTour?.scheduledFor.confirmation || null,
      }),
    })
    workflows.push(workflow)
  }
  await prepareLuxorTestBrochureFollowUps(input, runId, startedAt, brochureSubmission)
  return {
    tour_simulated: isTourIntent,
    ...(isTourIntent ? { tour_status: workflows[0]?.tour_status ?? null } : {}),
    test_emails_queued: workflows.filter((workflow) => workflow.test_email_queued === true).length,
  }
}

async function prepareLuxorTestBrochureFollowUps(
  input: LuxorInquiryInput,
  runId: string,
  startedAt: string,
  isBrochureSubmission: boolean,
) {
  if (!isBrochureSubmission) return

  const actions: Record<string, unknown>[] = []
  if (input.marketingOptIn !== true) {
    actions.push({ step_key: 'sequence', channel: 'email', status: 'suppressed', scheduled_at: startedAt, details: { reason: 'marketing_consent_not_granted' } })
  } else if (!input.email?.trim()) {
    actions.push({ step_key: 'sequence', channel: 'email', status: 'skipped', scheduled_at: startedAt, details: { reason: 'email_required_for_brochure_follow_up' } })
  } else {
    const templates = await getLuxorBrochureFollowUpSequence()
    if (!templates) {
      actions.push({ step_key: 'sequence', channel: 'email', status: 'skipped', scheduled_at: startedAt, details: { reason: 'brochure_follow_up_not_enabled_or_fully_configured' } })
    } else {
      const stepTimes = new Map(scheduleBrochureFollowUpOffsets(startedAt, templates).map((step) => [step.step_key, step.scheduled_at]))
      const { buildLuxorTestFollowUpEmail } = await import('@/lib/luxorTestEmailTemplates')
      for (const template of templates) {
        const scheduledAt = stepTimes.get(template.step_key) || startedAt
        if (template.step_key === 'email_1') {
          actions.push(followUpAction(template, scheduledAt, 'existing_delivery', { reason: 'brochure_delivery_is_email_1' }))
          continue
        }
        if (new Date(scheduledAt).getTime() <= Date.now()) {
          actions.push(followUpAction(template, scheduledAt, 'skipped', { reason: 'scheduled_step_is_in_the_past' }))
          continue
        }
        if (template.channel === 'email' && template.active) {
          const email = buildLuxorTestFollowUpEmail(runId, template)
          await supabaseRest('rpc/luxor_enqueue_test_follow_up_email', {
            method: 'POST',
            body: JSON.stringify({
              p_test_run_id: runId,
              p_step_key: template.step_key,
              p_email_subject: email.subject,
              p_email_body: email.body,
              p_source: `portal_test_email:brochure_follow_up:${template.step_key}`,
              p_scheduled_for: scheduledAt,
            }),
          })
          actions.push(followUpAction(template, scheduledAt, 'queued', { recipient: 'luxoratlaspalmas@gmail.com', run_scoped: true }))
        } else if (template.channel === 'phone' && template.active) {
          actions.push(followUpAction(template, scheduledAt, input.phone?.trim() ? 'task_simulated' : 'skipped', {
            reason: input.phone?.trim() ? 'phone_task_recorded_in_test_history_only' : 'phone_number_missing',
            external_task_created: false,
          }))
        } else {
          actions.push(followUpAction(template, scheduledAt, 'skipped', { reason: 'channel_not_scheduled_by_production_brochure_sequence' }))
        }
      }
    }
  }

  if (actions.length) {
    await supabaseRest('rpc/luxor_record_test_brochure_follow_up_actions', {
      method: 'POST',
      body: JSON.stringify({ p_test_run_id: runId, p_actions: actions }),
    })
  }
}

function followUpAction(
  template: LuxorFollowUpTemplate,
  scheduledAt: string,
  status: string,
  details: Record<string, unknown>,
) {
  return {
    step_key: template.step_key,
    channel: template.channel,
    status,
    scheduled_at: scheduledAt,
    details: {
      name: template.name,
      template_id: template.id,
      delay_days: template.delay_days,
      simulation_only: true,
      ...details,
    },
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

export async function simulateLuxorTestTourChange(input: {
  testRunId: string
  action: 'reschedule' | 'cancel'
  actionKey: string
  payload: Record<string, unknown>
}) {
  return supabaseRest<Record<string, unknown>>('rpc/luxor_simulate_test_tour_change', {
    method: 'POST',
    body: JSON.stringify({
      p_test_run_id: input.testRunId,
      p_action: input.action,
      p_action_key: input.actionKey,
      p_payload: input.payload,
    }),
  })
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
