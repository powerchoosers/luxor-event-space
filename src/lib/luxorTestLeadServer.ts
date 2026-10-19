import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorInquiry, LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
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

const LUXOR_PERMANENT_TEST_LEAD_ID = '00b264d6-a3fb-4ea3-9142-415f76385c39'

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

/** Resume the active isolated run or idempotently start one from the portal. */
export async function ensureActiveLuxorTestRun() {
  const settings = await getLuxorTestSettings()
  if (!settings || !settings.enabled || !settings.email_recipient_confirmed_at) {
    throw new Error('The isolated Test Lead workflow is paused until its verified inbox is enabled in Test Settings.')
  }

  const [lead] = await supabaseRest<Array<{ id: string; is_test: boolean }>>(
    `luxor_inquiries?select=id,is_test&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&is_test=eq.true&limit=1`,
  )
  if (!lead || lead.is_test !== true) throw new Error('The permanent Test Lead is unavailable.')

  const [activeRun] = await supabaseRest<Array<{ id: string; status: string; source: string; started_at: string }>>(
    `luxor_test_runs?select=id,status,source,started_at&test_lead_id=eq.${encodeURIComponent(lead.id)}&status=eq.in_progress&order=started_at.desc&limit=1`,
  )
  if (activeRun) return { leadId: lead.id, run: activeRun, created: false }

  const [latestRun] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&test_lead_id=eq.${encodeURIComponent(lead.id)}&order=started_at.desc&limit=1`,
  )
  // Every concurrent portal opener after the same completed/reset run uses
  // the same key. The start RPC locks the permanent lead and returns that
  // run on replay instead of cancelling one opener's new run for another.
  const idempotencyKey = `portal-test-lead:${lead.id}:${latestRun?.id || 'initial'}`
  const started = await startLuxorTestRun({
    fullName: 'Luxor Test Lead',
    email: settings.identification_email,
    phone: settings.identification_phone,
    source: 'manual entry',
  }, { idempotencyKey })
  if (started.run.status !== 'in_progress') {
    throw new Error('The isolated Test Lead run could not be activated. Open Test History and start a fresh run.')
  }
  return { leadId: started.leadId, run: started.run, created: !started.replayed }
}

export async function recordLuxorTestRunActivity(input: {
  testRunId: string
  eventType: string
  status?: string | null
  details?: Record<string, unknown>
  source?: string | null
}) {
  const [run] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&id=eq.${encodeURIComponent(input.testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run before recording activity.')
  const [activity] = await supabaseRest<Array<Record<string, unknown>>>('luxor_test_run_activity?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      test_run_id: run.id,
      event_type: input.eventType,
      status: input.status || null,
      source: input.source || 'portal_test_lead',
      details: { ...(input.details || {}), simulation_only: true },
    }),
  })
  return activity ?? null
}

export async function scheduleLuxorTestTour(input: {
  testRunId: string
  date: string
  time: string
  durationMinutes?: number
  meetingType?: string
  clientFacingNotes?: string
  assignees?: string[]
}) {
  const [run] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&id=eq.${encodeURIComponent(input.testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run before scheduling a simulated tour.')

  const [lead] = await supabaseRest<Array<Record<string, unknown> & { id: string; is_test: boolean }>>(
    `luxor_inquiries?select=*&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&is_test=eq.true&limit=1`,
  )
  if (!lead || lead.is_test !== true) throw new Error('The permanent Test Lead is unavailable.')

  const meetingType = String(input.meetingType || 'Private Venue Tour').trim().slice(0, 120)
  const clientFacingNotes = String(input.clientFacingNotes || '').trim().slice(0, 2_000)
  const durationMinutes = Math.min(Math.max(Number(input.durationMinutes) || 30, 30), 180)
  const assignees = Array.isArray(input.assignees) ? input.assignees.map((assignee) => String(assignee).trim()).filter(Boolean).slice(0, 12) : []
  const { buildLuxorTestTourPlan } = await import('@/lib/luxorTestEmailTemplates')
  const planned = await buildLuxorTestTourPlan(input.testRunId, input.date, input.time, lead as LuxorInquiry, {
    meetingType, clientFacingNotes, durationMinutes, assignees,
  })
  const details = {
    simulation_only: true,
    calendar_event_created: false,
    inventory_reserved: false,
    preferred_tour_date: input.date,
    preferred_tour_time: input.time,
    start_utc: planned.plan.startUtc.toISOString(),
    end_utc: planned.plan.endUtc.toISOString(),
    location: planned.plan.state.location,
    meeting_type: meetingType,
    duration_minutes: durationMinutes,
    client_facing_notes: clientFacingNotes,
    assignees,
  }

  const [artifact] = await supabaseRest<Array<{ id: string; status: string; details: Record<string, unknown> }>>(
    `luxor_test_run_artifacts?select=id,status,details&test_run_id=eq.${encodeURIComponent(run.id)}&artifact_type=eq.tour&limit=1`,
  )
  let status = artifact?.status || 'simulated'
  if (['completed', 'cancelled', 'reset', 'failed'].includes(status)) {
    throw new Error('This simulated tour has a final outcome. Start a new test run to schedule another tour.')
  }
  const nextStatuses: Record<string, string> = { simulated: 'requested', requested: 'scheduled', scheduled: 'confirmed' }
  while (status !== 'confirmed') {
    const nextStatus = nextStatuses[status]
    if (!nextStatus) throw new Error('This simulated tour cannot be scheduled from its current status.')
    await supabaseRest('rpc/luxor_advance_test_artifact', {
      method: 'POST',
      body: JSON.stringify({
        p_test_run_id: run.id,
        p_artifact_type: 'tour',
        p_status: nextStatus,
        p_details: { ...details, requested_by: 'portal_test_lead' },
      }),
    })
    status = nextStatus
  }

  const [updatedLead] = await supabaseRest<Array<Record<string, unknown>>>('luxor_inquiries?select=*&id=eq.' + encodeURIComponent(lead.id) + '&is_test=eq.true', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'tour_confirmed',
      pipeline_stage: 'tour',
      preferred_tour_date: input.date,
      preferred_tour_time: input.time,
      tour_attendance_status: 'pending',
      tour_confirmed_at: new Date().toISOString(),
      metadata: {
        ...(lead.metadata && typeof lead.metadata === 'object' ? lead.metadata as Record<string, unknown> : {}),
        tourMeetingType: meetingType,
        tourClientFacingNotes: clientFacingNotes,
        tour_assignees: assignees,
      },
      updated_at: new Date().toISOString(),
    }),
  })
  if (!updatedLead) throw new Error('The simulated tour was saved, but the Test Lead view could not be refreshed.')

  await supabaseRest('luxor_test_run_artifacts?test_run_id=eq.' + encodeURIComponent(run.id) + '&artifact_type=eq.tour', {
    method: 'PATCH',
      body: JSON.stringify({ details: { ...(artifact?.details || {}), ...details }, updated_at: new Date().toISOString() }),
  })
  await recordLuxorTestRunActivity({
    testRunId: run.id,
    eventType: 'test_tour_scheduled',
    status: 'confirmed',
    source: 'portal_test_lead',
    details,
  })

  return { inquiry: updatedLead, tour: { status: 'confirmed', ...details }, simulated: true, emailsQueued: false }
}

export async function recordLuxorTestTourOutcome(input: {
  testRunId: string
  attendance: 'attended' | 'no_show'
  expectedAttendance?: string | null
}) {
  const [run] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&id=eq.${encodeURIComponent(input.testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run before recording a tour outcome.')
  const [lead] = await supabaseRest<Array<Record<string, unknown> & { id: string; is_test: boolean; preferred_tour_date: string | null; tour_attendance_status: string | null; status: string; pipeline_stage: string | null }>>(
    `luxor_inquiries?select=*&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&is_test=eq.true&limit=1`,
  )
  if (!lead || lead.is_test !== true) throw new Error('The permanent Test Lead is unavailable.')
  if (!lead.preferred_tour_date) throw new Error('Schedule a simulated tour before recording its outcome.')
  if (input.expectedAttendance !== undefined && lead.tour_attendance_status !== input.expectedAttendance && lead.tour_attendance_status !== input.attendance) {
    throw new Error('The tour outcome changed since this view loaded. Refresh and review the current outcome before correcting it.')
  }
  if (lead.tour_attendance_status === 'cancelled') throw new Error('A cancelled simulated tour cannot be changed through attendance controls.')
  if (lead.tour_attendance_status === input.attendance) {
    return { inquiry: lead, simulated: true, calendarEventChanged: false, inventoryChanged: false, replayed: true }
  }

  const [artifact] = await supabaseRest<Array<{ id: string; status: string; details: Record<string, unknown> }>>(
    `luxor_test_run_artifacts?select=id,status,details&test_run_id=eq.${encodeURIComponent(run.id)}&artifact_type=eq.tour&limit=1`,
  )
  if (!artifact || ['simulated', 'requested', 'failed', 'cancelled', 'reset'].includes(artifact.status)) {
    throw new Error('Schedule this simulated tour before marking it complete or no-show.')
  }

  if (artifact.status !== 'completed') {
    let status = artifact.status
    const nextStatuses: Record<string, string> = { scheduled: 'confirmed', confirmed: 'completed' }
    while (status !== 'completed') {
      const nextStatus = nextStatuses[status]
      if (!nextStatus) throw new Error('This simulated tour cannot record an outcome from its current status.')
      await supabaseRest('rpc/luxor_advance_test_artifact', {
        method: 'POST',
        body: JSON.stringify({
          p_test_run_id: run.id,
          p_artifact_type: 'tour',
          p_status: nextStatus,
          p_details: nextStatus === 'completed'
            ? { tour_attendance_status: input.attendance, outcome_recorded_at: new Date().toISOString() }
            : { outcome_preparation: true },
        }),
      })
      status = nextStatus
    }
  }

  const updatedAt = new Date().toISOString()
  const [updatedLead] = await supabaseRest<Array<Record<string, unknown>>>('luxor_inquiries?select=*&id=eq.' + encodeURIComponent(lead.id) + '&is_test=eq.true', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      tour_attendance_status: input.attendance,
      status: input.attendance === 'attended' ? 'tour_confirmed' : lead.status,
      pipeline_stage: input.attendance === 'attended' ? 'proposal' : 'tour',
      tour_confirmed_at: lead.tour_confirmed_at || updatedAt,
      updated_at: updatedAt,
    }),
  })
  if (!updatedLead) throw new Error('The simulated tour outcome was recorded, but the Test Lead view could not be refreshed.')

  const [currentArtifact] = await supabaseRest<Array<{ details: Record<string, unknown> }>>(
    `luxor_test_run_artifacts?select=details&test_run_id=eq.${encodeURIComponent(run.id)}&artifact_type=eq.tour&limit=1`,
  )
  if (currentArtifact) {
    await supabaseRest('luxor_test_run_artifacts?test_run_id=eq.' + encodeURIComponent(run.id) + '&artifact_type=eq.tour', {
      method: 'PATCH',
      body: JSON.stringify({
        details: { ...(currentArtifact.details || {}), tour_attendance_status: input.attendance, outcome_recorded_at: updatedAt, simulation_only: true },
        updated_at: updatedAt,
      }),
    })
  }
  await recordLuxorTestRunActivity({
    testRunId: run.id,
    eventType: 'test_tour_outcome',
    status: input.attendance,
    source: 'portal_test_lead',
    details: { tour_attendance_status: input.attendance, simulation_only: true, calendar_event_changed: false, inventory_changed: false },
  })
  return { inquiry: updatedLead, simulated: true, calendarEventChanged: false, inventoryChanged: false }
}

export async function cancelLuxorTestTour(input: { testRunId: string; reason?: string }) {
  const runId = encodeURIComponent(input.testRunId)
  const [run] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&id=eq.${runId}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run before cancelling a simulated tour.')
  const [lead] = await supabaseRest<Array<{ id: string; is_test: boolean; preferred_tour_date: string | null; tour_attendance_status: string | null }>>(
    `luxor_inquiries?select=id,is_test,preferred_tour_date,tour_attendance_status&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&is_test=eq.true&limit=1`,
  )
  if (!lead || lead.is_test !== true) throw new Error('The permanent Test Lead is unavailable.')
  if (!lead.preferred_tour_date) throw new Error('Schedule a simulated tour before cancelling it.')
  if (['attended', 'no_show'].includes(lead.tour_attendance_status || '')) {
    throw new Error('A completed simulated tour cannot be cancelled.')
  }
  const [artifact] = await supabaseRest<Array<{ id: string; status: string; details: Record<string, unknown> }>>(
    `luxor_test_run_artifacts?select=id,status,details&test_run_id=eq.${runId}&artifact_type=eq.tour&limit=1`,
  )
  if (!artifact || !['requested', 'scheduled', 'confirmed'].includes(artifact.status)) {
    throw new Error('There is no upcoming simulated tour to cancel.')
  }
  const updatedAt = new Date().toISOString()
  const details = {
    ...(artifact.details || {}),
    simulation_only: true,
    cancellation_reason: String(input.reason || '').trim().slice(0, 500) || null,
    cancelled_at: updatedAt,
    calendar_event_cancelled: false,
    inventory_released: false,
    test_email_queued: false,
  }
  await supabaseRest(`luxor_test_run_artifacts?test_run_id=eq.${runId}&artifact_type=eq.tour`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled', details, updated_at: updatedAt }),
  })
  const [updatedLead] = await supabaseRest<Array<Record<string, unknown>>>(
    `luxor_inquiries?select=*&id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&is_test=eq.true`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tour_attendance_status: 'cancelled', updated_at: updatedAt }) },
  )
  await recordLuxorTestRunActivity({
    testRunId: run.id,
    eventType: 'test_tour_cancelled',
    status: 'cancelled',
    source: 'portal_test_lead',
    details,
  })
  return { inquiry: updatedLead ?? lead, simulated: true, calendarEventChanged: false, inventoryChanged: false, emailQueued: false }
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
