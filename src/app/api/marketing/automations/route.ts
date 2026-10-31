import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorFollowUpSetup, isLuxorBrochureFollowUpSendingEnabled } from '@/lib/luxorFollowUpsServer'
import { cancelQueuedLuxorTourNotifications } from '@/lib/luxorTourNotificationsServer'
import { requireCustomWorkflowOperator, CustomWorkflowServiceError } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRest, supabaseRestCount } from '@/lib/supabaseRestServer'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import {
  classifyAutomationStatus,
  summarizeSavedAutomations,
  type AutomationLibraryEntry,
  type AutomationLibraryStep,
  type AutomationStatus,
} from '@/lib/luxorAutomationsLibrary'

type SavedAutomationRow = {
  automation_key: string
  name: string
  enabled: boolean | null
  send_approved: boolean | null
  timing_configured: boolean | null
  timezone: string | null
  updated_at: string | null
}

type SavedTemplateRow = {
  automation_key: string
  step_key: string
  sort_order: number
  channel: string
  delay_days: number | null
  name: string
  active: boolean | null
  uses_existing_delivery: boolean | null
  updated_at: string | null
}

async function readAllRows<T>(resource: string, total: number) {
  const rows: T[] = []
  const pageSize = 500
  while (rows.length < total) {
    const page = await supabaseRest<T[]>(`${resource}&limit=${pageSize}&offset=${rows.length}`)
    if (!page.length) throw new Error('A saved automation page could not be loaded.')
    rows.push(...page)
  }
  if (rows.length !== total) throw new Error('The saved automation count changed while the library was loading.')
  return rows
}

function channelSummary(steps: SavedTemplateRow[]) {
  const channels = new Set(steps.map((step) => step.channel))
  const labels = [
    channels.has('email') ? 'Email' : null,
    channels.has('sms') ? 'SMS' : null,
    channels.has('phone') ? 'Phone tasks' : null,
  ].filter((label): label is string => Boolean(label))
  return labels.length ? labels.join(' + ') : 'Channel unavailable'
}

function stepsFor(templates: SavedTemplateRow[]): AutomationLibraryStep[] {
  return templates.map((template) => ({
    key: template.step_key,
    name: template.name,
    channel: template.channel,
    delayDays: template.delay_days,
    active: template.active,
    usesExistingDelivery: template.uses_existing_delivery === true,
  }))
}

function latestUpdatedAt(automationUpdatedAt: string | null, templates: SavedTemplateRow[]) {
  const dates = [automationUpdatedAt, ...templates.map((template) => template.updated_at)]
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((left, right) => right.time - left.time)
  return dates[0]?.value ?? null
}

function statusNote(status: AutomationStatus) {
  switch (status) {
    case 'draft': return 'Saved setup is missing approval, timing, or one of its required active steps.'
    case 'paused': return 'The saved setup is complete, but the workflow or its server-side send gate is disabled.'
    case 'unknown': return 'This saved definition does not have a verified execution path in the current library.'
    default: return null
  }
}

async function safeCount(path: string) {
  try {
    return await supabaseRestCount(path)
  } catch {
    return null
  }
}

function buildSavedEntry(
  automation: SavedAutomationRow,
  templates: SavedTemplateRow[],
  sendsConfigured: boolean | null,
  metrics: { activeEnrollments: number | null; sentMessages: number | null },
  runtimeGateEnabled: boolean,
): AutomationLibraryEntry {
  const isBrochureFollowUp = automation.automation_key === 'brochure_lead'
  const steps = stepsFor(templates)
  const controlsAvailable = canControlLiveLuxorAutomations()
  const status = classifyAutomationStatus(automation, templates, isBrochureFollowUp ? (runtimeGateEnabled ? sendsConfigured : null) : null)

  return {
    id: automation.automation_key,
    name: automation.name,
    kind: 'saved',
    status,
    enabled: automation.enabled === true,
    canToggle: controlsAvailable,
    canEnable: controlsAvailable && runtimeGateEnabled && automation.send_approved === true && automation.timing_configured === true
      && automation.timezone === 'America/Chicago' && templates.length === 9 && templates.every((template) => template.active === true),
    controlReason: !controlsAvailable ? 'Switches are disabled in this local preview; use the deployed portal to change live automation.' : runtimeGateEnabled ? null : 'The send gate is disabled in this environment.',
    statusNote: statusNote(status),
    description: isBrochureFollowUp
      ? 'Follows up with eligible brochure requests that have an email address and marketing consent.'
      : 'Saved workflow configuration. Its trigger and runtime behavior are not verified in this library.',
    trigger: isBrochureFollowUp
      ? 'Eligible brochure request with marketing consent'
      : 'Trigger unavailable',
    channelSummary: channelSummary(templates),
    stepsCount: templates.length,
    steps,
    activeEnrollmentCount: isBrochureFollowUp ? metrics.activeEnrollments : null,
    sentMessageCount: isBrochureFollowUp ? metrics.sentMessages : null,
    sentMessageLabel: 'Emails sent',
    updatedAt: latestUpdatedAt(automation.updated_at, templates),
    summaryNote: isBrochureFollowUp
      ? 'The switch controls the saved sequence globally. Each lead keeps its own consent and lifecycle checks, and call steps remain tasks for staff.'
      : 'This library does not provide editing or runtime controls for this saved definition.',
  }
}

function buildTourNotifications(sentCount: number | null, enabled: boolean): AutomationLibraryEntry {
  return {
    id: 'system:tour-notifications',
    name: 'Tour confirmations & reminders',
    kind: 'system',
    status: 'system-managed',
    enabled,
    canToggle: canControlLiveLuxorAutomations(),
    canEnable: canControlLiveLuxorAutomations(),
    controlReason: canControlLiveLuxorAutomations() ? null : 'Switches are disabled in this local preview; use the deployed portal to change live automation.',
    statusNote: null,
    description: 'Calendar scheduling creates the confirmation and reminder jobs for a confirmed tour.',
    trigger: 'Tour scheduled or rescheduled',
    channelSummary: 'Email + calendar invitation',
    stepsCount: 3,
    steps: [
      { key: 'confirmation', name: 'Tour confirmation and calendar invitation', channel: 'email', delayDays: null, active: true, usesExistingDelivery: false },
      { key: 'reminder_24', name: '24-hour reminder', channel: 'email', delayDays: null, active: true, usesExistingDelivery: false },
      { key: 'reminder_2', name: '2-hour reminder', channel: 'email', delayDays: null, active: true, usesExistingDelivery: false },
    ],
    activeEnrollmentCount: null,
    sentMessageCount: sentCount,
    sentMessageLabel: 'Notifications sent',
    updatedAt: null,
    summaryNote: enabled
      ? 'Calendar scheduling creates these notices. Turning them off cancels unsent confirmations and reminders; turning them back on affects newly scheduled tours.'
      : 'Tour confirmations and reminders are off. Unsent confirmations and reminders have been cancelled; turning them back on affects newly scheduled tours.',
  }
}

export async function GET() {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const [totalSavedWorkflows, templateTotal] = await Promise.all([
      supabaseRestCount('luxor_follow_up_automations?select=automation_key&automation_key=neq.tour_notifications'),
      supabaseRestCount('luxor_follow_up_templates?select=automation_key'),
    ])
    const [automationRows, templateRows] = await Promise.all([
      readAllRows<SavedAutomationRow>('luxor_follow_up_automations?select=automation_key,name,enabled,send_approved,timing_configured,timezone,updated_at&automation_key=neq.tour_notifications&order=name.asc', totalSavedWorkflows),
      readAllRows<SavedTemplateRow>('luxor_follow_up_templates?select=automation_key,step_key,sort_order,channel,delay_days,name,active,uses_existing_delivery,updated_at&order=sort_order.asc', templateTotal),
    ])

    let sendsConfigured: boolean | null = null
    if (automationRows.some((automation) => automation.automation_key === 'brochure_lead')) {
      try {
        sendsConfigured = await isLuxorBrochureFollowUpSendingEnabled()
      } catch {
        sendsConfigured = null
      }
    }
    const runtimeGateEnabled = process.env.LUXOR_FOLLOW_UP_SENDS_ENABLED === 'true'
    const [tourNotificationAutomation] = await supabaseRest<Array<{ enabled: boolean }>>('luxor_follow_up_automations?select=enabled&automation_key=eq.tour_notifications&limit=1')
    const tourNotificationsEnabled = tourNotificationAutomation?.enabled !== false

    const [activeEnrollmentCount, sentFollowUpCount, sentTourCount] = await Promise.all([
      safeCount('luxor_follow_up_enrollments?select=id,luxor_inquiries!inner(is_test)&automation_key=eq.brochure_lead&status=eq.active&luxor_inquiries.is_test=eq.false'),
      safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=eq.marketing_campaign&automation_enrollment_id=not.is.null&metadata->>automation_key=eq.brochure_lead&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
      safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=in.(tour_confirmation,tour_reminder)&tour_revision_id=not.is.null&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
    ])

    const workflows = automationRows.filter((automation) => automation.automation_key !== 'tour_notifications').map((automation) => buildSavedEntry(
      automation,
      templateRows.filter((template) => template.automation_key === automation.automation_key),
      sendsConfigured,
      automation.automation_key === 'brochure_lead'
        ? { activeEnrollments: activeEnrollmentCount, sentMessages: sentFollowUpCount }
        : { activeEnrollments: null, sentMessages: null },
      runtimeGateEnabled,
    ))
    const totals = summarizeSavedAutomations(workflows, totalSavedWorkflows)
    const systemManaged = buildTourNotifications(sentTourCount, tourNotificationsEnabled)

    return NextResponse.json({ workflows, systemManaged, totals }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'The automation library could not load its saved configuration. Try again.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  if (!canControlLiveLuxorAutomations()) {
    return NextResponse.json({ error: 'Automation switches are disabled in the local preview. Use the deployed portal to change live automation.' }, { status: 409 })
  }

  try {
    await requireCustomWorkflowOperator(session.email)
    const body = await request.json() as { automationKey?: unknown; enabled?: unknown }
    const automationKey = String(body.automationKey || '')
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Choose whether to turn this automation on or off.' }, { status: 400 })

    if (automationKey === 'brochure_lead') {
      const { automation, templates } = await getLuxorFollowUpSetup()
      if (!automation) return NextResponse.json({ error: 'The brochure follow-up setup is unavailable.' }, { status: 404 })
      if (body.enabled) {
        if (process.env.LUXOR_FOLLOW_UP_SENDS_ENABLED !== 'true') {
          return NextResponse.json({ error: 'The brochure send gate is disabled in this environment.' }, { status: 409 })
        }
        if (!automation.send_approved || !automation.timing_configured || automation.timezone !== 'America/Chicago'
          || templates.length !== 9 || !templates.every((template) => template.active)) {
          return NextResponse.json({ error: 'The saved sequence needs approval, Chicago timing, and all nine active steps before it can be enabled.' }, { status: 409 })
        }
      }
      const [updated] = await supabaseRest<SavedAutomationRow[]>(
        'luxor_follow_up_automations?automation_key=eq.brochure_lead&select=automation_key,name,enabled,send_approved,timing_configured,timezone,updated_at',
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ enabled: body.enabled, updated_at: new Date().toISOString() }) },
      )
      if (!updated) return NextResponse.json({ error: 'The brochure sequence changed. Refresh the automation list.' }, { status: 409 })
      return NextResponse.json({ automationKey, enabled: updated.enabled, status: body.enabled ? 'active' : 'paused' }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (automationKey === 'tour_notifications') {
      const [updated] = await supabaseRest<SavedAutomationRow[]>(
        'luxor_follow_up_automations?automation_key=eq.tour_notifications&select=automation_key,name,enabled,send_approved,timing_configured,timezone,updated_at',
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ enabled: body.enabled, updated_at: new Date().toISOString() }) },
      )
      if (!updated) return NextResponse.json({ error: 'Tour notification controls are not installed. Refresh after the automation update is deployed.' }, { status: 409 })
      if (!body.enabled) await cancelQueuedLuxorTourNotifications()
      return NextResponse.json({ automationKey, enabled: updated.enabled }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ error: 'This automation does not have a global on/off control.' }, { status: 404 })
  } catch (error) {
    if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Automation settings could not be saved.' }, { status: 500 })
  }
}
