import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { isLuxorBrochureFollowUpSendingEnabled } from '@/lib/luxorFollowUpsServer'
import { supabaseRest, supabaseRestCount } from '@/lib/supabaseRestServer'
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
): AutomationLibraryEntry {
  const isBrochureFollowUp = automation.automation_key === 'brochure_lead'
  const steps = stepsFor(templates)
  const status = classifyAutomationStatus(automation, templates, isBrochureFollowUp ? sendsConfigured : null)

  return {
    id: automation.automation_key,
    name: automation.name,
    kind: 'saved',
    status,
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
      ? 'This is a read-only summary of the saved sequence. Per-lead follow-up controls do not pause the workflow globally.'
      : 'This library does not provide editing or runtime controls for this saved definition.',
  }
}

function buildTourNotifications(sentCount: number | null): AutomationLibraryEntry {
  return {
    id: 'system:tour-notifications',
    name: 'Tour confirmations & reminders',
    kind: 'system',
    status: 'system-managed',
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
    summaryNote: 'Tour notices are created and replaced by the calendar/job system. Enrollment counts do not apply, and this library has no global pause or archive control for them.',
  }
}

export async function GET() {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const [totalSavedWorkflows, templateTotal] = await Promise.all([
      supabaseRestCount('luxor_follow_up_automations?select=automation_key'),
      supabaseRestCount('luxor_follow_up_templates?select=automation_key'),
    ])
    const [automationRows, templateRows] = await Promise.all([
      readAllRows<SavedAutomationRow>('luxor_follow_up_automations?select=automation_key,name,enabled,send_approved,timing_configured,timezone,updated_at&order=name.asc', totalSavedWorkflows),
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

    const [activeEnrollmentCount, sentFollowUpCount, sentTourCount] = await Promise.all([
      safeCount('luxor_follow_up_enrollments?select=id,luxor_inquiries!inner(is_test)&automation_key=eq.brochure_lead&status=eq.active&luxor_inquiries.is_test=eq.false'),
      safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=eq.marketing_campaign&automation_enrollment_id=not.is.null&metadata->>automation_key=eq.brochure_lead&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
      safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=in.(tour_confirmation,tour_reminder)&tour_revision_id=not.is.null&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
    ])

    const workflows = automationRows.map((automation) => buildSavedEntry(
      automation,
      templateRows.filter((template) => template.automation_key === automation.automation_key),
      sendsConfigured,
      automation.automation_key === 'brochure_lead'
        ? { activeEnrollments: activeEnrollmentCount, sentMessages: sentFollowUpCount }
        : { activeEnrollments: null, sentMessages: null },
    ))
    const totals = summarizeSavedAutomations(workflows, totalSavedWorkflows)
    const systemManaged = buildTourNotifications(sentTourCount)

    return NextResponse.json({ workflows, systemManaged, totals }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'The automation library could not load its saved configuration. Try again.' }, { status: 500 })
  }
}
