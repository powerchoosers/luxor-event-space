import 'server-only'

import crypto from 'crypto'
import { CUSTOM_WORKFLOW_EXECUTION_ENABLED } from './luxorCustomWorkflowFeatureGates'
import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import { normalizePhoneNumber } from './luxorCallsServer'
import { estimateSmsSegments } from './luxorTextCampaignsServer'
import type { CustomWorkflowEmailStep, CustomWorkflowStep, CustomWorkflowTextStep } from './luxorCustomWorkflowDefinition'
import { supabaseRest } from './supabaseRestServer'

export type CustomWorkflowRuntimeSummary = {
  enabled: boolean
  consumedEvents: number
  waitingForAcknowledgment: number
  ignoredEvents: number
  enrollmentsCreated: number
  heldEnrollments: number
  acknowledgmentsReconciled: number
  controlsAdvanced: number
  enrollmentsStopped: number
  enrollmentsCompleted: number
  heldSteps: number
  queuedEmailSteps: number
  queuedTextSteps: number
  ineligibleStepsStopped: number
  staleDispatchesHeld: number
}

/**
 * Consumes durable contact-form events and advances only non-message steps.
 * Delivery remains on the existing email/text job workers. The hard-false
 * execution gate prevents these database calls in production until the
 * separate queue dispatch and lifecycle review is complete.
 */
export async function processDueLuxorCustomWorkflowOrchestration(limit = 20): Promise<CustomWorkflowRuntimeSummary> {
  const disabled: CustomWorkflowRuntimeSummary = {
    enabled: false,
    consumedEvents: 0,
    waitingForAcknowledgment: 0,
    ignoredEvents: 0,
    enrollmentsCreated: 0,
    heldEnrollments: 0,
    acknowledgmentsReconciled: 0,
    controlsAdvanced: 0,
    enrollmentsStopped: 0,
    enrollmentsCompleted: 0,
    heldSteps: 0,
    queuedEmailSteps: 0,
    queuedTextSteps: 0,
    ineligibleStepsStopped: 0,
    staleDispatchesHeld: 0,
  }
  if (!CUSTOM_WORKFLOW_EXECUTION_ENABLED) return disabled

  // Read the independent production control before calling any orchestration
  // RPC. Some reconciliation RPCs intentionally hold stale/unsafe work; the
  // orchestration lane must not mutate even that state while runtime is off.
  const [runtimeControls] = await supabaseRest<Array<{ execution_enabled: boolean }>>(
    'luxor_custom_workflow_runtime_controls?select=execution_enabled&singleton=eq.true&limit=1',
  )
  if (runtimeControls?.execution_enabled !== true) return disabled

  const batchSize = Math.min(Math.max(Math.trunc(limit) || 1, 1), 100)
  const [staleDispatchesHeld, ineligibleStepsStopped] = await Promise.all([
    supabaseRest<number>('rpc/luxor_custom_workflow_hold_stale_dispatches', {
      method: 'POST', body: JSON.stringify({ p_limit: batchSize }),
    }),
    supabaseRest<number>('rpc/luxor_custom_workflow_stop_ineligible_message_steps', {
      method: 'POST', body: JSON.stringify({ p_limit: batchSize }),
    }),
  ])
  const [outbox] = await supabaseRest<Array<{
    events_consumed: number
    waiting_for_ack: number
    ignored_events: number
    enrollments_created: number
    held_enrollments: number
  }>>('rpc/luxor_custom_workflow_consume_pending_events', {
    method: 'POST',
    body: JSON.stringify({ p_limit: batchSize }),
  })
  const acknowledgments = await supabaseRest<number>(
    'rpc/luxor_custom_workflow_reconcile_acknowledgments',
    { method: 'POST', body: JSON.stringify({ p_limit: batchSize }) },
  )
  const [controls] = await supabaseRest<Array<{
    advanced_count: number
    stopped_count: number
    completed_count: number
    held_count: number
  }>>('rpc/luxor_custom_workflow_advance_control_steps', {
    method: 'POST',
    body: JSON.stringify({ p_limit: batchSize }),
  })
  const messageSteps = await supabaseRest<DueCustomWorkflowMessageStep[]>(
    'rpc/luxor_custom_workflow_get_due_message_steps',
    { method: 'POST', body: JSON.stringify({ p_limit: batchSize }) },
  )
  const enqueued = { email: 0, text: 0 }
  for (const item of messageSteps) {
    try {
      if (item.channel === 'email' && item.step_definition.type === 'email' && item.step_definition.mode === 'marketing') {
        const token = crypto.randomBytes(32).toString('hex')
        const rendered = renderCustomWorkflowEmail(item.step_definition, item.inquiry_context, token)
        const [result] = await supabaseRest<CustomWorkflowEnqueueResult[]>(
          'rpc/luxor_custom_workflow_enqueue_email_step',
          {
            method: 'POST',
            body: JSON.stringify({
              p_step_run_id: item.step_run_id,
              p_recipient_email: item.inquiry_context.email || '',
              p_subject: rendered.subject,
              p_body: rendered.body,
              p_preview_text: rendered.previewText,
              p_unsubscribe_token_hash: crypto.createHash('sha256').update(token).digest('hex'),
            }),
          },
        )
        if (result?.disposition === 'queued') enqueued.email += 1
        if (result?.disposition === 'held') await stopMalformedStep(item.step_run_id, result.reason)
      } else if (item.channel === 'text' && item.step_definition.type === 'text') {
        const rendered = renderCustomWorkflowText(item.step_definition, item.inquiry_context)
        const phone = normalizePhoneNumber(item.inquiry_context.phone) || ''
        const [result] = await supabaseRest<CustomWorkflowEnqueueResult[]>(
          'rpc/luxor_custom_workflow_enqueue_text_step',
          {
            method: 'POST',
            body: JSON.stringify({
              p_step_run_id: item.step_run_id,
              p_recipient_phone: phone,
              p_body: rendered,
              p_segment_count: estimateSmsSegments(rendered),
            }),
          },
        )
        if (result?.disposition === 'queued') enqueued.text += 1
        if (result?.disposition === 'held') await stopMalformedStep(item.step_run_id, result.reason)
      } else {
        await stopMalformedStep(item.step_run_id, 'The pinned workflow step is not a supported message step.')
      }
    } catch (error) {
      // Leave a due step scheduled on transient database errors. The unique
      // custom-step queue link makes a lost response safe to retry.
      console.warn('Custom workflow message step could not be queued:', error instanceof Error ? error.message : error)
    }
  }

  return {
    enabled: true,
    consumedEvents: Number(outbox?.events_consumed || 0),
    waitingForAcknowledgment: Number(outbox?.waiting_for_ack || 0),
    ignoredEvents: Number(outbox?.ignored_events || 0),
    enrollmentsCreated: Number(outbox?.enrollments_created || 0),
    heldEnrollments: Number(outbox?.held_enrollments || 0),
    acknowledgmentsReconciled: Number(acknowledgments || 0),
    controlsAdvanced: Number(controls?.advanced_count || 0),
    enrollmentsStopped: Number(controls?.stopped_count || 0),
    enrollmentsCompleted: Number(controls?.completed_count || 0),
    heldSteps: Number(controls?.held_count || 0),
    queuedEmailSteps: enqueued.email,
    queuedTextSteps: enqueued.text,
    ineligibleStepsStopped: Number(ineligibleStepsStopped || 0),
    staleDispatchesHeld: Number(staleDispatchesHeld || 0),
  }
}

type InquiryContext = {
  id: string
  email: string | null
  phone: string | null
  full_name: string | null
  event_type: string | null
  guest_count: number | string | null
  target_date: string | null
  preferred_tour_date: string | null
  status: string
  marketing_opt_in: boolean
  is_test: boolean
}

type DueCustomWorkflowMessageStep = {
  step_run_id: string
  workflow_id: string
  enrollment_id: string
  inquiry_id: string
  workflow_version_id: string
  step_order: number
  channel: 'email' | 'text'
  step_definition: CustomWorkflowStep
  inquiry_context: InquiryContext
}

type CustomWorkflowEnqueueResult = { job_id: string | null; disposition: string; reason: string | null }

function renderCustomWorkflowEmail(step: CustomWorkflowEmailStep, inquiry: InquiryContext, token: string) {
  const merge = (value: string) => replaceMergeFields(value, inquiry)
  const escape = (value: string) => escapeHtml(value)
  const unsubscribeUrl = absoluteUrl(`/api/marketing/unsubscribe/${token}`)
  const bodyHtml = merge(step.body).split(/\r?\n/).map((line) => {
    const safeLine = escape(line)
    return safeLine.trim() ? `<p style="margin:0 0 14px;white-space:pre-line">${safeLine}</p>` : ''
  }).join('') + `<p style="margin:20px 0 0;font-size:12px;color:#68635a">If you no longer want these emails, <a href="${escapeHtml(unsubscribeUrl)}">unsubscribe here</a>.</p>`
  const subject = merge(step.subject).trim()
  const previewText = merge(step.previewText).trim()
  const body = renderLuxorSystemEmail({
    previewText: escape(previewText),
    eyebrow: 'A note from Luxor',
    title: escape(subject),
    greeting: `Hi ${escape((inquiry.full_name || 'there').trim().split(/\s+/)[0])},`,
    actions: step.ctaText && step.ctaUrl
      ? [{ label: escape(merge(step.ctaText)), url: absoluteLuxorLink(step.ctaUrl) }]
      : [],
    bodyHtml,
    note: 'Reply to this email if you have questions.',
    theme: 'brand',
  })
  return { subject, previewText, body }
}

function renderCustomWorkflowText(step: CustomWorkflowTextStep, inquiry: InquiryContext) {
  return replaceMergeFields(step.body, inquiry).replace(/\s+/g, ' ').trim()
}

function replaceMergeFields(value: string, inquiry: InquiryContext) {
  const firstName = inquiry.full_name?.trim().split(/\s+/)[0] || 'there'
  const fields: Record<string, string> = {
    first_name: firstName,
    full_name: inquiry.full_name?.trim() || 'Guest',
    event_type: inquiry.event_type?.trim() || 'celebration',
    guest_count: inquiry.guest_count == null ? 'To be determined' : String(inquiry.guest_count),
    target_date: inquiry.target_date || inquiry.preferred_tour_date || 'To be determined',
  }
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, name: string) => fields[name] ?? '')
}

function absoluteLuxorLink(value: string) {
  if (value.startsWith('/') && !value.startsWith('//')) return absoluteUrl(value)
  return value
}

function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://www.luxoratlaspalmas.com')
  return `${base.replace(/\/$/, '')}${path}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function stopMalformedStep(stepRunId: string, reason: string | null) {
  await supabaseRest<boolean>('rpc/luxor_custom_workflow_stop_step', {
    method: 'POST',
    body: JSON.stringify({ p_step_run_id: stepRunId, p_reason: reason || 'The workflow message could not be rendered safely.' }),
  })
}
