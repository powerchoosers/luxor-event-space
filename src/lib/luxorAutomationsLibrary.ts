export type AutomationStatus = 'active' | 'draft' | 'paused' | 'unknown' | 'system-managed'
export type AutomationStatusFilter = 'all' | 'active' | 'draft' | 'paused'

export type AutomationLibraryStep = {
  key: string
  name: string
  channel: string
  delayDays: number | null
  active: boolean | null
  usesExistingDelivery: boolean
}

export type AutomationLibraryEntry = {
  id: string
  name: string
  kind: 'saved' | 'system'
  status: AutomationStatus
  statusNote: string | null
  description: string
  trigger: string
  channelSummary: string
  stepsCount: number | null
  steps: AutomationLibraryStep[]
  activeEnrollmentCount: number | null
  sentMessageCount: number | null
  sentMessageLabel: string
  updatedAt: string | null
  summaryNote: string
}

export type AutomationLibraryTotals = {
  total: number
  active: number | null
  draft: number | null
  paused: number | null
}

export type AutomationStatusSource = {
  automation_key: string
  enabled: boolean | null
  send_approved: boolean | null
  timing_configured: boolean | null
  timezone: string | null
}

export type AutomationTemplateSource = {
  active: boolean | null
}

export function classifyAutomationStatus(
  automation: AutomationStatusSource,
  templates: AutomationTemplateSource[],
  sendsConfigured: boolean | null,
): AutomationStatus {
  if (automation.automation_key !== 'brochure_lead') return 'unknown'
  if (automation.enabled === null || automation.send_approved === null || automation.timing_configured === null || automation.timezone === null) return 'unknown'

  const savedSetupIsComplete = automation.send_approved === true
    && automation.timing_configured === true
    && automation.timezone === 'America/Chicago'
    && templates.length === 9
    && templates.every((template) => template.active === true)

  if (!savedSetupIsComplete) return 'draft'
  if (sendsConfigured === null) return 'unknown'
  if (automation.enabled !== true || sendsConfigured !== true) return 'paused'
  return 'active'
}

export function summarizeSavedAutomations(
  workflows: Pick<AutomationLibraryEntry, 'kind' | 'status'>[],
  totalSavedWorkflows: number,
): AutomationLibraryTotals {
  const saved = workflows.filter((workflow) => workflow.kind === 'saved')
  const hasUnknownStatus = saved.some((workflow) => workflow.status === 'unknown')
  return {
    total: totalSavedWorkflows,
    active: hasUnknownStatus ? null : saved.filter((workflow) => workflow.status === 'active').length,
    draft: hasUnknownStatus ? null : saved.filter((workflow) => workflow.status === 'draft').length,
    paused: hasUnknownStatus ? null : saved.filter((workflow) => workflow.status === 'paused').length,
  }
}

export function filterAutomationLibrary(
  entries: AutomationLibraryEntry[],
  search: string,
  status: AutomationStatusFilter,
) {
  const needle = search.trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    const matchesName = !needle || entry.name.toLocaleLowerCase().includes(needle)
    const matchesStatus = status === 'all' || (entry.kind === 'saved' && entry.status === status)
    return matchesName && matchesStatus
  })
}

export function findAutomationLibraryEntry(entries: AutomationLibraryEntry[], id: string) {
  return entries.find((entry) => entry.id === id) ?? null
}
