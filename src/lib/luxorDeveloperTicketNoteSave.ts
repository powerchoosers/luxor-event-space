import type { DeveloperTicketAnnotation, DeveloperTicketElementDescriptor } from '@/lib/luxorDeveloperTicketAnnotations'

export function shouldSaveDeveloperTicketNote(input: {
  cancelled: boolean
  suppressed: boolean
  hasAnchor: boolean
  trimmedNote: string
}): boolean {
  if (input.cancelled || input.suppressed) return false
  if (!input.hasAnchor) return false
  return input.trimmedNote.length > 0
}

export function buildDeveloperTicketAnnotationCommit(input: {
  id: string
  note: string
  pagePath: string
  viewport: { width: number; height: number }
  element: DeveloperTicketElementDescriptor
  existing: DeveloperTicketAnnotation | undefined
  now?: number
}): DeveloperTicketAnnotation {
  const now = input.now ?? Date.now()
  return {
    id: input.id,
    note: input.note.trim(),
    pagePath: input.pagePath,
    element: input.element,
    viewport: input.viewport,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function resolveDeveloperTicketAnnotationElement(selector: string): HTMLElement | null {
  if (typeof document === 'undefined' || !selector.trim()) return null
  try {
    const node = document.querySelector(selector)
    return node instanceof HTMLElement ? node : null
  } catch {
    return null
  }
}