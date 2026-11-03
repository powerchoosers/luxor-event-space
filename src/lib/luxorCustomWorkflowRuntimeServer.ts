import 'server-only'

import crypto from 'crypto'
import { CUSTOM_WORKFLOW_EXECUTION_ENABLED } from './luxorCustomWorkflowFeatureGates'
import { normalizePhoneNumber } from './luxorCallsServer'
import { estimateSmsSegments } from './luxorTextCampaignsServer'
import type { CustomWorkflowDefinition, CustomWorkflowStep, CustomWorkflowTextStep } from './luxorCustomWorkflowDefinition'
import { hydrateWorkflowEmailTemplates, renderCustomWorkflowEmail, mergeWorkflowFields, resolveWorkflowEmailSender } from './luxorWorkflowEmailServer'
import { generateWorkflowMessage } from './luxorWorkflowAiServer'
import { getPublicLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { luxorEmailHtmlToPlainText } from './luxorConversationalEmailServer'
import { supabaseRest } from './supabaseRestServer'
import { getWorkflowRecentClientMessages } from './luxorWorkflowClientContextServer'

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
  let generatedMessages = 0
  for (const item of messageSteps) {
    try {
      // Leave time for the existing queue worker to deliver its one-message
      // budget. Additional AI steps stay due for the next scheduled minute.
      const needsGeneration = (item.step_definition.type === 'email' || item.step_definition.type === 'text') && item.step_definition.generationMode === 'ai'
      if (needsGeneration && generatedMessages >= 1) continue
      if (needsGeneration) generatedMessages += 1
      // Read current client details at execution, rather than generating from a
      // generic example or the event payload captured days earlier.
      const [currentInquiry] = await supabaseRest<Array<Record<string, unknown>>>(`luxor_inquiries?select=full_name,event_type,guest_count,target_date,preferred_tour_date,preferred_tour_time,budget,package_interest,message,status&id=eq.${encodeURIComponent(item.inquiry_id)}&limit=1`)
      const clientContext = { ...item.inquiry_context, ...currentInquiry }
      if (needsGeneration) {
        const [notes, priorEmails, clientMessages] = await Promise.all([
          supabaseRest<Array<{ created_at: string; content: string; note_type: string }>>(`luxor_notes?select=created_at,content,note_type&inquiry_id=eq.${encodeURIComponent(item.inquiry_id)}&order=created_at.desc&limit=4`),
          supabaseRest<Array<{ sent_at: string; subject: string; body: string }>>(`luxor_email_jobs?select=sent_at,subject,body&inquiry_id=eq.${encodeURIComponent(item.inquiry_id)}&status=eq.sent&order=sent_at.desc&limit=3`),
          getWorkflowRecentClientMessages(item.inquiry_id, clientContext.email),
        ])
        Object.assign(clientContext, {
          ...clientMessages,
          internal_notes: notes.map((note) => ({ ...note, content: note.content.slice(0, 2000) })),
          recent_sent_email: priorEmails.map((email) => ({ sent_at: email.sent_at, subject: email.subject, body: luxorEmailHtmlToPlainText(email.body).slice(0, 2000) })),
        })
      }
      if (item.channel === 'email' && item.step_definition.type === 'email' && item.step_definition.mode === 'marketing') {
        const [version] = await supabaseRest<Array<{ definition: CustomWorkflowDefinition }>>(`luxor_custom_workflow_versions?select=definition&id=eq.${encodeURIComponent(item.workflow_version_id)}&limit=1`)
        if (!version) throw new Error('The pinned workflow version is unavailable.')
        await hydrateWorkflowEmailTemplates(version.definition)
        let step = item.step_definition
        const pinned = version.definition.steps.find((candidate) => candidate.id === step.id)
        if (pinned?.type === 'email') step = pinned
        if (step.generationMode === 'ai') {
          const sender = await resolveWorkflowEmailSender(version.definition.emailSettings)
          const generated = await generateWorkflowMessage(step, clientContext, sender)
          if (generated.step.type !== 'email') throw new Error('The generated message is not an email.')
          step = generated.step
        }
        const token = crypto.randomBytes(32).toString('hex')
        const rendered = await renderCustomWorkflowEmail(step, clientContext, absoluteUrl(`/api/marketing/unsubscribe/${token}`), version.definition.emailSettings)
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
        let step = item.step_definition
        if (step.generationMode === 'ai') {
          const generated = await generateWorkflowMessage(step, clientContext)
          if (generated.step.type !== 'text') throw new Error('The generated message is not a text.')
          step = generated.step
        }
        const rendered = await renderCustomWorkflowText(step, clientContext)
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

async function renderCustomWorkflowText(step: CustomWorkflowTextStep, inquiry: Record<string, unknown>) {
  return mergeWorkflowFields(step.body, inquiry, { phone: await getPublicLuxorPhoneNumber() }).replace(/\s+/g, ' ').trim()
}

function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://www.luxoratlaspalmas.com')
  return `${base.replace(/\/$/, '')}${path}`
}

async function stopMalformedStep(stepRunId: string, reason: string | null) {
  await supabaseRest<boolean>('rpc/luxor_custom_workflow_stop_step', {
    method: 'POST',
    body: JSON.stringify({ p_step_run_id: stepRunId, p_reason: reason || 'The workflow message could not be rendered safely.' }),
  })
}
