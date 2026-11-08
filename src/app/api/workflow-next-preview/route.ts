import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorFollowUpSetup } from '@/lib/luxorFollowUpsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { isLuxorInquiryArchived } from '@/lib/luxorInquiryTypes'
import { previewNextBrochureAction } from '@/lib/luxorOrderedBrochurePlan'
import { previewCustomWorkflowNextAction } from '@/lib/luxorWorkflowTentativePreview'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'
import { supabaseRest, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { isAdoptedTask, legacyAdoptionEnabled } from '@/lib/luxorLegacyAdoptionServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const noStore = { headers: { 'Cache-Control': 'no-store' } }
const unavailable = () => NextResponse.json({ mode: 'ordered', preview: { type: 'unavailable' } }, noStore)

type AdoptedAction = {
  action_id: string
  run_id: string
  inquiry_id: string
  enrollment_id: string
  step_key: string
  ordinal: number
  delay_days: number
  channel: 'call' | 'email'
  designation: 'current' | 'deferred' | 'historical' | 'review'
  record_table: string | null
  record_id: string | null
  template_image: { name?: unknown; step_key?: unknown; channel?: unknown; delay_days?: unknown; active?: unknown } | null
}

// Adoption keeps the materialized history but progression skips historical
// entries and holds the next deferred entry for review. This read-only forecast
// must follow that ledger, not the legacy task dates or live template order.
async function previewAdoptedCall(taskId: string, inquiryId: string, enrollmentId: string, stepKey: string, completionAt: string) {
  const current = await supabaseRestStrict<AdoptedAction[]>(
    `luxor_adoption_actions?select=action_id,run_id,inquiry_id,enrollment_id,step_key,ordinal,delay_days,channel,designation,record_table,record_id,template_image&record_table=eq.luxor_tasks&record_id=eq.${encodeURIComponent(taskId)}&limit=2`,
  )
  if (current.length !== 1) return unavailable()
  const action = current[0]
  if (!UUID.test(action.run_id) || !UUID.test(action.action_id) || action.inquiry_id !== inquiryId
    || action.enrollment_id !== enrollmentId || action.step_key !== stepKey
    || action.channel !== 'call' || action.designation !== 'current' || action.record_id !== taskId) return unavailable()
  const [runs, gates, slots, actions] = await Promise.all([
    supabaseRestStrict<Array<{ state: string; inquiry_id: string; invalidation_floor: number | string | null; producer_review_id: string | null }>>(
      `luxor_adoption_runs?select=state,inquiry_id,invalidation_floor,producer_review_id&id=eq.${encodeURIComponent(action.run_id)}&limit=2`,
    ),
    supabaseRestStrict<Array<{ held: boolean }>>(
      `luxor_adoption_gates?select=held&run_id=eq.${encodeURIComponent(action.run_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=2`,
    ),
    supabaseRestStrict<Array<{ id: string }>>(
      `luxor_workflow_contact_slots?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&workflow_kind=eq.system&enrollment_id=eq.${encodeURIComponent(enrollmentId)}&step_key=eq.${encodeURIComponent(stepKey)}&action_kind=eq.call&action_id=eq.${encodeURIComponent(taskId)}&status=eq.held&limit=2`,
    ),
    supabaseRestStrict<AdoptedAction[]>(
      `luxor_adoption_actions?select=action_id,run_id,inquiry_id,enrollment_id,step_key,ordinal,delay_days,channel,designation,record_table,record_id,template_image&run_id=eq.${encodeURIComponent(action.run_id)}&order=ordinal.asc&limit=10`,
    ),
  ])
  const run = runs[0]
  if (runs.length !== 1 || run.state !== 'applied' || run.inquiry_id !== inquiryId
    || !run.producer_review_id || !UUID.test(run.producer_review_id)
    || !/^\d+$/.test(String(run.invalidation_floor)) || gates.length !== 1 || gates[0].held !== true
    || slots.length !== 1 || !UUID.test(slots[0].id)) return unavailable()
  const [invalidations, reviews, admitted, lead] = await Promise.all([
    supabaseRestStrict<Array<{ id: number }>>(
      `luxor_adoption_invalidations?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&id=gt.${encodeURIComponent(String(run.invalidation_floor))}&limit=1`,
    ),
    supabaseRestStrict<Array<{ valid: boolean }>>(
      `luxor_adoption_producer_reviews?select=valid&id=eq.${encodeURIComponent(run.producer_review_id)}&limit=2`,
    ),
    // This separate read-only, service-only RPC checks the same generation and
    // producer-retirement admission used by adoption progression, as well as
    // held-slot ownership and contact identity. The generic preview-clear RPC
    // accepts only open slots and cannot validate an adopted held call.
    supabaseRestStrict<boolean>('rpc/luxor_adoption_preview_admitted', { method: 'POST', body: JSON.stringify({ p_task_id: taskId, p_inquiry_id: inquiryId }) }),
    getLuxorInquiry(inquiryId),
  ])
  if (invalidations.length || reviews.length !== 1 || reviews[0].valid !== true || admitted !== true
    || !lead || isLuxorInquiryArchived(lead) || ['booked', 'tour_confirmed', 'closed_lost'].includes(lead.status)
    || Boolean(lead.follow_up_disposition && lead.follow_up_disposition !== 'no_response') || !lead.marketing_opt_in) return unavailable()
  if (actions.length !== 9 || new Set(actions.map((a) => a.action_id)).size !== 9
    || new Set(actions.map((a) => a.ordinal)).size !== 9 || new Set(actions.map((a) => a.step_key)).size !== 9
    || actions.some((a, index) => a.run_id !== action.run_id || a.inquiry_id !== inquiryId || a.enrollment_id !== enrollmentId
      || !UUID.test(a.action_id) || !Number.isInteger(a.ordinal) || !Number.isInteger(a.delay_days) || a.delay_days < 0 || a.delay_days > 365
      || (index > 0 && (a.ordinal <= actions[index - 1].ordinal || a.delay_days < actions[index - 1].delay_days))
      || !['call', 'email'].includes(a.channel) || !['current', 'deferred', 'historical', 'review'].includes(a.designation))
    || actions.filter((a) => a.designation === 'current').length !== 1) return unavailable()
  const currentIndex = actions.findIndex((a) => a.action_id === action.action_id && a.designation === 'current'
    && a.record_table === 'luxor_tasks' && a.record_id === taskId && a.step_key === stepKey)
  if (currentIndex < 0) return unavailable()
  const next = actions.slice(currentIndex + 1).find((a) => a.designation !== 'historical')
  if (!next) return NextResponse.json({ mode: 'ordered', preview: { type: 'finished' } }, noStore)
  const template = next.template_image
  if (next.designation !== 'deferred' || !next.record_id || !UUID.test(next.record_id)
    || next.record_table !== (next.channel === 'call' ? 'luxor_tasks' : 'luxor_email_jobs')
    || !template || template.active !== true || template.step_key !== next.step_key
    || template.channel !== (next.channel === 'call' ? 'phone' : 'email') || template.delay_days !== next.delay_days
    || typeof template.name !== 'string' || !template.name.trim()
    || (next.channel === 'call' ? !lead.phone : !lead.email)) return unavailable()
  const assumed = Date.parse(completionAt)
  const due = assumed + Math.max(60_000, (next.delay_days - action.delay_days) * 86_400_000)
  if (!Number.isFinite(assumed) || !Number.isFinite(due)) return unavailable()
  return NextResponse.json({ mode: 'ordered', preview: {
    type: 'next', channel: next.channel, title: template.name, tentativeAt: new Date(due).toISOString(), requiresReview: true,
  } }, noStore)
}

/** Read-only forecast: no task, email job, or enrollment is created here. */
export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const taskId = request.nextUrl.searchParams.get('taskId') || ''
  const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
  if (!UUID.test(taskId) || !UUID.test(inquiryId)) return NextResponse.json({ error: 'Invalid task or inquiry.' }, { status: 400 })
  try {
    const [task] = await supabaseRest<Array<{ id: string; inquiry_id: string; status: string; automation_enrollment_id: string | null; automation_step_key: string | null }>>(
      `luxor_tasks?select=id,inquiry_id,status,automation_enrollment_id,automation_step_key&id=eq.${encodeURIComponent(taskId)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
    )
    if (!task || task.status !== 'pending') return unavailable()
    const assumedCompletionAt = new Date().toISOString()
    if (task.automation_enrollment_id && task.automation_step_key) {
      const [enrollment] = await supabaseRest<Array<{ id: string; inquiry_id: string; status: string; ordered_progression_required: boolean }>>(
        `luxor_follow_up_enrollments?select=id,inquiry_id,status,ordered_progression_required&id=eq.${encodeURIComponent(task.automation_enrollment_id)}&limit=1`,
      )
      if (!enrollment || enrollment.inquiry_id !== inquiryId) return unavailable()
      if (!enrollment.ordered_progression_required) {
        // Adoption preserves the old enrollment flag while moving its current
        // and deferred work into a separate ledger. Never surface a historical
        // task's original date as a fixed next step. This lookup is deliberately
        // strict even with rollout flags off: already-adopted work can outlive
        // a flag change. Missing or unreadable ownership fails closed below.
        if (await isAdoptedTask(task.id)) {
          if (!legacyAdoptionEnabled() || enrollment.status !== 'active') return unavailable()
          return await previewAdoptedCall(task.id, inquiryId, enrollment.id, task.automation_step_key, assumedCompletionAt)
        }
        return NextResponse.json({ mode: 'legacy' }, noStore)
      }
      if (enrollment.status !== 'active') return unavailable()
      const [slot] = await supabaseRest<Array<{ id: string }>>(
        `luxor_workflow_contact_slots?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&workflow_kind=eq.system&enrollment_id=eq.${encodeURIComponent(enrollment.id)}&step_key=eq.${encodeURIComponent(task.automation_step_key)}&action_id=eq.${encodeURIComponent(task.id)}&status=eq.open&limit=1`,
      )
      if (!slot) return unavailable()
      if (!await supabaseRest<boolean>('rpc/luxor_workflow_contact_slot_preview_clear', { method: 'POST', body: JSON.stringify({ p_slot_id: slot.id }) })) return unavailable()
      const [lead, setup] = await Promise.all([getLuxorInquiry(inquiryId), getLuxorFollowUpSetup()])
      if (!lead || isLuxorInquiryArchived(lead) || ['booked', 'tour_confirmed', 'closed_lost'].includes(lead.status)
        || Boolean(lead.follow_up_disposition && lead.follow_up_disposition !== 'no_response') || !setup.automation?.enabled || !setup.automation.send_approved
        || !setup.automation.timing_configured || setup.automation.timezone !== 'America/Chicago') return unavailable()
      const result = previewNextBrochureAction({
        templates: setup.templates, previousStepKey: task.automation_step_key,
        hasEmail: Boolean(lead.email), hasPhone: Boolean(lead.phone), marketingOptIn: Boolean(lead.marketing_opt_in),
      }, assumedCompletionAt)
      if (result.type === 'next') return NextResponse.json({ mode: 'ordered', preview: { type: 'next', channel: result.step.channel === 'phone' ? 'call' : result.step.channel, title: result.step.name, tentativeAt: result.scheduledAt } }, noStore)
      return NextResponse.json({ mode: 'ordered', preview: { type: result.type === 'complete' ? 'finished' : 'unavailable' } }, noStore)
    }

    const runs = await supabaseRest<Array<{ enrollment_id: string; step_id: string; status: string }>>(
      `luxor_custom_workflow_step_runs?select=enrollment_id,step_id,status&channel=eq.call_task&snapshot->>task_id=eq.${encodeURIComponent(task.id)}&limit=2`,
    )
    if (!runs.length) return NextResponse.json({ mode: 'legacy' }, noStore)
    if (runs.length !== 1 || runs[0].status !== 'queued') return unavailable()
    const run = runs[0]
    const [enrollment] = await supabaseRest<Array<{ id: string; inquiry_id: string; workflow_id: string; workflow_version_id: string; status: string; current_step_id: string; call_completion_required: boolean }>>(
      `luxor_custom_workflow_enrollments?select=id,inquiry_id,workflow_id,workflow_version_id,status,current_step_id,call_completion_required&id=eq.${encodeURIComponent(run.enrollment_id)}&limit=1`,
    )
    if (!enrollment || enrollment.inquiry_id !== inquiryId) return unavailable()
    if (!enrollment.call_completion_required) return NextResponse.json({ mode: 'legacy' }, noStore)
    if (enrollment.status !== 'active' || enrollment.current_step_id !== run.step_id) return unavailable()
    const [slot] = await supabaseRest<Array<{ id: string }>>(
      `luxor_workflow_contact_slots?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&workflow_kind=eq.custom&enrollment_id=eq.${encodeURIComponent(enrollment.id)}&step_key=eq.${encodeURIComponent(run.step_id)}&action_id=eq.${encodeURIComponent(task.id)}&status=eq.open&limit=1`,
    )
    if (!slot) return unavailable()
    if (!await supabaseRest<boolean>('rpc/luxor_workflow_contact_slot_preview_clear', { method: 'POST', body: JSON.stringify({ p_slot_id: slot.id }) })) return unavailable()
    const [workflow, version] = await Promise.all([
      supabaseRest<Array<{ status: string }>>(`luxor_custom_workflows?select=status&id=eq.${encodeURIComponent(enrollment.workflow_id)}&limit=1`),
      supabaseRest<Array<{ definition: CustomWorkflowDefinition }>>(`luxor_custom_workflow_versions?select=definition&id=eq.${encodeURIComponent(enrollment.workflow_version_id)}&workflow_id=eq.${encodeURIComponent(enrollment.workflow_id)}&limit=1`),
    ])
    if (workflow[0]?.status !== 'active' || !Array.isArray(version[0]?.definition?.steps)) return unavailable()
    return NextResponse.json({ mode: 'ordered', preview: previewCustomWorkflowNextAction(version[0].definition.steps, run.step_id, assumedCompletionAt) }, noStore)
  } catch {
    // A forecast is optional. Never claim a fixed or tentative next action if
    // current state, linkage, or the pinned definition cannot be verified.
    return unavailable()
  }
}
