export const DEVELOPER_SUPPORT_SUMMARY_DESCRIPTION_MAX = 160

export type DeveloperSupportSubmittedSnapshot = {
  submittedAt: string
  confirmationId?: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
  attachmentCount: number
  withTeam: boolean
}

export function truncateDeveloperSupportSummary(
  description: string | null | undefined,
  maxLength = DEVELOPER_SUPPORT_SUMMARY_DESCRIPTION_MAX,
): string {
  const trimmed = (description || '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'No extra details provided.'
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export function isDeveloperSupportCardSubmitted(
  submitted: DeveloperSupportSubmittedSnapshot | null | undefined,
): boolean {
  return Boolean(submitted?.submittedAt)
}

export function parseDeveloperSupportSubmittedSnapshot(input: unknown): DeveloperSupportSubmittedSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (typeof value.submittedAt !== 'string' || !value.submittedAt.trim()) return null
  if (typeof value.title !== 'string' || !value.title.trim()) return null
  const priority = value.priority
  if (priority !== 'low' && priority !== 'medium' && priority !== 'high' && priority !== 'urgent') return null
  const attachmentCount = typeof value.attachmentCount === 'number' && Number.isFinite(value.attachmentCount)
    ? Math.max(0, Math.min(5, Math.floor(value.attachmentCount)))
    : 0
  return {
    submittedAt: value.submittedAt,
    confirmationId: typeof value.confirmationId === 'string' ? value.confirmationId : undefined,
    title: value.title.trim(),
    description: typeof value.description === 'string' ? value.description : null,
    priority,
    pagePath: typeof value.pagePath === 'string' ? value.pagePath : null,
    attachmentCount,
    withTeam: value.withTeam === true,
  }
}

export function buildDeveloperSupportSubmittedSnapshot(input: {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
  attachmentCount: number
  confirmationId?: string
  withTeam: boolean
  submittedAt?: string
}): DeveloperSupportSubmittedSnapshot {
  const trimmedDescription = input.description.trim()
  return {
    submittedAt: input.submittedAt || new Date().toISOString(),
    confirmationId: input.confirmationId,
    title: input.title.trim(),
    description: trimmedDescription || null,
    priority: input.priority,
    pagePath: input.pagePath,
    attachmentCount: Math.max(0, Math.min(5, Math.floor(input.attachmentCount))),
    withTeam: input.withTeam,
  }
}

export function developerSupportDispatchWithTeam(dispatch: unknown): boolean {
  if (!dispatch || typeof dispatch !== 'object' || Array.isArray(dispatch)) return false
  const value = dispatch as Record<string, unknown>
  const runUuid = typeof value.runUuid === 'string' ? value.runUuid.trim() : ''
  const backgroundComposerId = typeof value.backgroundComposerId === 'string' ? value.backgroundComposerId.trim() : ''
  return Boolean(runUuid || backgroundComposerId)
}

export function developerSupportConfirmResult(snapshot: {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
  attachmentCount: number
  result: unknown
}): DeveloperSupportSubmittedSnapshot {
  const result = snapshot.result && typeof snapshot.result === 'object' && !Array.isArray(snapshot.result)
    ? snapshot.result as Record<string, unknown>
    : {}
  const confirmationId = typeof result.confirmation_id === 'string' ? result.confirmation_id : undefined
  return buildDeveloperSupportSubmittedSnapshot({
    title: snapshot.title,
    description: snapshot.description,
    priority: snapshot.priority,
    pagePath: snapshot.pagePath,
    attachmentCount: snapshot.attachmentCount,
    confirmationId,
    withTeam: developerSupportDispatchWithTeam(result.dispatch),
  })
}