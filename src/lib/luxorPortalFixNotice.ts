export const PORTAL_FIX_NOTICE_DISMISS_PREFIX = 'luxor_portal_fix_notice_dismissed:'

export function portalFixNoticeDismissStorageKey(noticeId: string): string {
  return `${PORTAL_FIX_NOTICE_DISMISS_PREFIX}${noticeId}`
}

export function isPortalFixNoticeDismissed(noticeId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(portalFixNoticeDismissStorageKey(noticeId)) === '1'
  } catch {
    return false
  }
}

export function dismissPortalFixNotice(noticeId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(portalFixNoticeDismissStorageKey(noticeId), '1')
  } catch {
    /* Keep the modal usable when storage is unavailable. */
  }
}

export type PortalFixStep = { title: string; text: string }

export type PortalFixNotice = {
  id: string
  bannerLabel: string
  title: string
  summary: string[]
  fixedText: string
  unchangedText: string
  steps: PortalFixStep[]
  ifStuck: string
}

function textList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) return null
  const items = value.map((item) => (typeof item === 'string' ? item.trim() : ''))
  if (items.some((item) => !item || item.length > maxLength)) return null
  return items
}

export function parsePortalFixNotice(row: unknown): PortalFixNotice | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const value = row as Record<string, unknown>
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) return null
  const bannerLabel = typeof value.banner_label === 'string' && value.banner_label.trim() ? value.banner_label.trim() : 'A portal fix is ready'
  if (bannerLabel.length > 80) return null
  const summary = textList(value.summary, 8, 800)
  const stepsRaw = Array.isArray(value.steps) ? value.steps : null
  if (!summary || !stepsRaw || stepsRaw.length < 1 || stepsRaw.length > 12) return null
  const steps: PortalFixStep[] = []
  for (const step of stepsRaw) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null
    const item = step as Record<string, unknown>
    if (typeof item.title !== 'string' || typeof item.text !== 'string') return null
    const title = item.title.trim()
    const text = item.text.trim()
    if (!title || title.length > 120 || !text || text.length > 400) return null
    steps.push({ title, text })
  }
  if (typeof value.fixed_text !== 'string' || typeof value.unchanged_text !== 'string' || typeof value.if_stuck !== 'string') return null
  const fixedText = value.fixed_text.trim()
  const unchangedText = value.unchanged_text.trim()
  const ifStuck = value.if_stuck.trim()
  if (!fixedText || fixedText.length > 500 || !unchangedText || unchangedText.length > 500 || !ifStuck || ifStuck.length > 500) return null
  return { id: value.id, bannerLabel, title: value.title.trim(), summary, fixedText, unchangedText, steps, ifStuck }
}
