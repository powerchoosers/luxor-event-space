import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRestStrict as supabaseRest } from '@/lib/supabaseRestServer'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// Adopted jobs retain their historical scheduled_for. The ledger owns the
// completion-relative due date; a missing or unverifiable ledger must never
// be interpreted as permission to show that historical date.
async function systemEmailDueAt(inquiryId: string, enrollmentId: string, stepKey: string, jobId: string, originalDueAt: string | null) {
  const rows = await supabaseRest<Array<{
    action_id: string; run_id: string; inquiry_id: string; enrollment_id: string; step_key: string
    channel: string; designation: string; record_table: string; record_id: string; effective_due_at: string | null
  }>>(`luxor_adoption_actions?select=action_id,run_id,inquiry_id,enrollment_id,step_key,channel,designation,record_table,record_id,effective_due_at&record_table=eq.luxor_email_jobs&record_id=eq.${encodeURIComponent(jobId)}&limit=2`)
  if (rows.length > 1) throw new Error('Ambiguous adopted email')
  if (!rows.length) {
    // A missing reverse binding within an adopted enrollment is not evidence
    // of a legacy non-adopted email.
    const siblings = await supabaseRest<Array<{ action_id: string }>>(`luxor_adoption_actions?select=action_id&enrollment_id=eq.${encodeURIComponent(enrollmentId)}&limit=1`)
    if (siblings.length) throw new Error('Adopted email binding is missing')
    return originalDueAt
  }
  const action = rows[0]
  if (!UUID.test(action.action_id) || !UUID.test(action.run_id) || action.inquiry_id !== inquiryId
    || action.enrollment_id !== enrollmentId || action.step_key !== stepKey || action.channel !== 'email'
    || action.designation !== 'current' || action.record_table !== 'luxor_email_jobs' || action.record_id !== jobId
    || !action.effective_due_at || !Number.isFinite(Date.parse(action.effective_due_at))) {
    throw new Error('Adopted email schedule needs review')
  }
  const [runs, gates] = await Promise.all([
    supabaseRest<Array<{ state: string; inquiry_id: string; invalidation_floor: number | string | null }>>(`luxor_adoption_runs?select=state,inquiry_id,invalidation_floor&id=eq.${encodeURIComponent(action.run_id)}&limit=2`),
    supabaseRest<Array<{ held: boolean }>>(`luxor_adoption_gates?select=held&run_id=eq.${encodeURIComponent(action.run_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=2`),
  ])
  if (runs.length !== 1 || runs[0].state !== 'applied' || runs[0].inquiry_id !== inquiryId
    || !/^\d+$/.test(String(runs[0].invalidation_floor))
    || gates.length !== 1 || gates[0].held !== true) throw new Error('Adoption ownership needs review')
  const invalidations = await supabaseRest<Array<{ id: number }>>(
    `luxor_adoption_invalidations?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&id=gt.${encodeURIComponent(String(runs[0].invalidation_floor))}&limit=1`,
  )
  if (invalidations.length) throw new Error('Adopted email context needs review')
  return action.effective_due_at
}

// During a custom wait, no message has been queued. Project only an immediate
// marketing-email successor of one unambiguous ordered enrollment.
async function projectedEmailDuringWait(inquiryId: string) {
  const [custom, system] = await Promise.all([
    supabaseRest<Array<{ id: string; workflow_id: string; workflow_version_id: string; current_step_id: string }>>(`luxor_custom_workflow_enrollments?select=id,workflow_id,workflow_version_id,current_step_id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&call_completion_required=eq.true&status=eq.active&limit=2`),
    supabaseRest<Array<{ id: string }>>(`luxor_follow_up_enrollments?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&ordered_progression_required=eq.true&status=eq.active&limit=1`),
  ])
  if (custom.length !== 1 || system.length) return null
  const enrollment = custom[0]
  const [runs, versions, workflows] = await Promise.all([
    supabaseRest<Array<{ step_order: number; step_id: string; scheduled_for: string }>>(`luxor_custom_workflow_step_runs?select=step_order,step_id,scheduled_for&enrollment_id=eq.${encodeURIComponent(enrollment.id)}&step_id=eq.${encodeURIComponent(enrollment.current_step_id)}&channel=eq.wait&status=eq.scheduled&limit=2`),
    supabaseRest<Array<{ definition: CustomWorkflowDefinition }>>(`luxor_custom_workflow_versions?select=definition&id=eq.${encodeURIComponent(enrollment.workflow_version_id)}&workflow_id=eq.${encodeURIComponent(enrollment.workflow_id)}&limit=1`),
    supabaseRest<Array<{ status: string }>>(`luxor_custom_workflows?select=status&id=eq.${encodeURIComponent(enrollment.workflow_id)}&limit=1`),
  ])
  if (runs.length !== 1 || workflows[0]?.status !== 'active') return null
  const run = runs[0], steps = versions[0]?.definition?.steps
  if (!Array.isArray(steps) || !Number.isInteger(run.step_order) || steps[run.step_order]?.id !== run.step_id || steps[run.step_order]?.type !== 'wait') return null
  const next = steps[run.step_order + 1]
  if (!next || next.type !== 'email' || next.mode !== 'marketing' || !Number.isFinite(Date.parse(run.scheduled_for))) return null
  return { slotStatus: 'open', workflowStatus: 'active', actionKind: 'email', subject: next.name || 'Workflow email', jobStatus: null, scheduledFor: run.scheduled_for, tentative: true }
}

/** Read the current workflow email, never future steps or unrelated messages. */
export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
  if (!UUID.test(inquiryId)) return NextResponse.json({ error: 'Invalid inquiry.' }, { status: 400 })
  try {
    const slots = await supabaseRest<Array<{ id: string; workflow_kind: 'system' | 'custom'; enrollment_id: string; step_key: string; action_kind: 'call' | 'email' | 'text'; action_id: string | null; status: 'open' | 'held' }>>(
      `luxor_workflow_contact_slots?select=id,workflow_kind,enrollment_id,step_key,action_kind,action_id,status&inquiry_id=eq.${encodeURIComponent(inquiryId)}&status=in.(open,held)&limit=2`,
    )
    if (slots.length > 1) return NextResponse.json({ error: 'Workflow action needs review.' }, { status: 409 })
    const slot = slots[0]
    if (!slot) return NextResponse.json({ action: await projectedEmailDuringWait(inquiryId) }, noStore)
    if (slot.action_kind !== 'email') return NextResponse.json({ action: null }, noStore)
    const [enrollment] = slot.workflow_kind === 'system'
      ? await supabaseRest<Array<{ status: string; workflow_id?: string }>>(`luxor_follow_up_enrollments?select=status&id=eq.${encodeURIComponent(slot.enrollment_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`)
      : await supabaseRest<Array<{ status: string; workflow_id?: string }>>(`luxor_custom_workflow_enrollments?select=status,workflow_id&id=eq.${encodeURIComponent(slot.enrollment_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`)
    if (!enrollment) throw new Error('Workflow enrollment missing')
    let workflowStatus: 'active' | 'paused' | 'held' = enrollment.status === 'paused' ? 'paused' : enrollment.status === 'active' ? 'active' : 'held'
    if (slot.workflow_kind === 'custom') {
      if (!enrollment.workflow_id) throw new Error('Workflow missing')
      const [workflow] = await supabaseRest<Array<{ status: string }>>(`luxor_custom_workflows?select=status&id=eq.${encodeURIComponent(enrollment.workflow_id)}&limit=1`)
      if (!workflow) throw new Error('Workflow missing')
      if (workflow.status === 'paused') workflowStatus = 'paused'
      else if (workflow.status !== 'active') workflowStatus = 'held'
    }
    const clear = slot.status === 'open' && await supabaseRest<boolean>('rpc/luxor_workflow_contact_slot_preview_clear', { method: 'POST', body: JSON.stringify({ p_slot_id: slot.id }) })
    if (clear && !slot.action_id && slot.workflow_kind === 'system') {
      const [planned] = await supabaseRest<Array<{ scheduled_at: string; template_id: string }>>(
        `luxor_follow_up_actions?select=scheduled_at,template_id&enrollment_id=eq.${encodeURIComponent(slot.enrollment_id)}&step_key=eq.${encodeURIComponent(slot.step_key)}&channel=eq.email&status=eq.scheduled&email_job_id=is.null&limit=1`,
      )
      const [template] = planned ? await supabaseRest<Array<{ name: string; subject: string | null }>>(
        `luxor_follow_up_templates?select=name,subject&id=eq.${encodeURIComponent(planned.template_id)}&limit=1`,
      ) : []
      if (planned && template) return NextResponse.json({ action: {
        slotStatus: 'open', workflowStatus, actionKind: 'email', subject: template.subject || template.name,
        jobStatus: null, scheduledFor: planned.scheduled_at,
      } }, noStore)
    }
    const [job] = slot.action_id ? await supabaseRest<Array<{ subject: string; status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'; scheduled_for: string | null; job_type: string; automation_enrollment_id: string | null; automation_step_key: string | null; custom_workflow_step_run_id: string | null }>>(
      `luxor_email_jobs?select=subject,status,scheduled_for,job_type,automation_enrollment_id,automation_step_key,custom_workflow_step_run_id&id=eq.${encodeURIComponent(slot.action_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
    ) : []
    // Contact slots represent follow-up actions, not booking or payment mail.
    // Verify ownership before attributing a dispatch lease or its outcome.
    if (job && slot.workflow_kind === 'system' && (
      job.job_type !== 'marketing_campaign' || job.automation_enrollment_id !== slot.enrollment_id || job.automation_step_key !== slot.step_key
    )) throw new Error('Workflow email ownership is inconsistent')
    if (job && slot.workflow_kind === 'custom') {
      if (job.job_type !== 'custom_workflow' || !job.custom_workflow_step_run_id || !UUID.test(job.custom_workflow_step_run_id)) throw new Error('Workflow email ownership is inconsistent')
      const runs = await supabaseRest<Array<{ id: string }>>(`luxor_custom_workflow_step_runs?select=id&id=eq.${encodeURIComponent(job.custom_workflow_step_run_id)}&enrollment_id=eq.${encodeURIComponent(slot.enrollment_id)}&step_id=eq.${encodeURIComponent(slot.step_key)}&channel=eq.email&limit=2`)
      if (runs.length !== 1) throw new Error('Workflow email ownership is inconsistent')
    }
    const scheduledFor = job && slot.action_id && slot.workflow_kind === 'system'
      ? await systemEmailDueAt(inquiryId, slot.enrollment_id, slot.step_key, slot.action_id, job.scheduled_for)
      : job?.scheduled_for ?? null
    // The job can remain "sending" after the provider has accepted it if
    // projecting that outcome fails. The dispatch lease is the authoritative
    // receipt; never display a job-only sending state when it is unavailable.
    const leases = job && slot.action_id ? await supabaseRest<Array<{
      stage: string; accepted_at: string | null; dispatch_started_at: string | null
      expires_at: string | null; finalized_at: string | null
    }>>(`luxor_workflow_dispatch_leases?select=stage,accepted_at,dispatch_started_at,expires_at,finalized_at&channel=eq.email&job_id=eq.${encodeURIComponent(slot.action_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&slot_id=eq.${encodeURIComponent(slot.id)}&limit=2`) : []
    if (leases.length > 1) throw new Error('Ambiguous workflow dispatch lease')
    return NextResponse.json({ action: {
      slotStatus: clear && job ? 'open' : 'held', workflowStatus, actionKind: 'email', subject: job?.subject ?? null,
      jobStatus: job?.status ?? null, scheduledFor, dispatch: leases[0] ?? null,
    } }, noStore)
  } catch {
    return NextResponse.json({ error: 'Current workflow email could not be loaded.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
