export type DeveloperTicketViewport = {
  width: number
  height: number
}

export type DeveloperTicketElementDescriptor = {
  selector: string
  role: string | null
  label: string
  visibleText: string | null
}

export type DeveloperTicketAnnotation = {
  id: string
  note: string
  pagePath: string
  element: DeveloperTicketElementDescriptor
  viewport: DeveloperTicketViewport
  createdAt: number
  updatedAt: number
}

export const LUXOR_DEVELOPER_TICKET_ANNOTATIONS_MAX = 25
export const LUXOR_DEVELOPER_TICKET_ANNOTATION_NOTE_MAX = 2_000

const NOTE_TRIM_RE = /\s+/g

export function developerTicketAnnotationLabel(element: DeveloperTicketElementDescriptor): string {
  const role = element.role?.trim() || 'element'
  const label = element.label?.trim() || element.visibleText?.trim() || element.selector
  const short = label.length > 48 ? `${label.slice(0, 45)}…` : label
  return `${role} · ${short}`
}

export function developerTicketAnnotationDisplayLine(annotation: DeveloperTicketAnnotation): string {
  const quote = annotation.note.trim().replace(NOTE_TRIM_RE, ' ')
  const label = developerTicketAnnotationLabel(annotation.element)
  return `“${quote}” — ${label}`
}

export function parseDeveloperSupportAnnotations(input: unknown): DeveloperTicketAnnotation[] {
  if (input == null) return []
  if (!Array.isArray(input)) throw new Error('Invalid ticket annotations.')
  if (input.length > LUXOR_DEVELOPER_TICKET_ANNOTATIONS_MAX) {
    throw new Error(`At most ${LUXOR_DEVELOPER_TICKET_ANNOTATIONS_MAX} page notes can be sent with a developer ticket.`)
  }
  const out: DeveloperTicketAnnotation[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid ticket annotations.')
    const value = item as Record<string, unknown>
    const allowed = ['id', 'note', 'pagePath', 'element', 'viewport', 'createdAt', 'updatedAt']
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Invalid ticket annotations.')
    if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 64) throw new Error('Invalid ticket annotations.')
    if (typeof value.note !== 'string' || !value.note.trim() || value.note.trim().length > LUXOR_DEVELOPER_TICKET_ANNOTATION_NOTE_MAX) {
      throw new Error('Invalid ticket annotations.')
    }
    if (typeof value.pagePath !== 'string' || !value.pagePath.trim() || value.pagePath.length > 2048) {
      throw new Error('Invalid ticket annotations.')
    }
    if (!value.element || typeof value.element !== 'object' || Array.isArray(value.element)) {
      throw new Error('Invalid ticket annotations.')
    }
    const el = value.element as Record<string, unknown>
    if (Object.keys(el).some((key) => !['selector', 'role', 'label', 'visibleText'].includes(key))) {
      throw new Error('Invalid ticket annotations.')
    }
    if (typeof el.selector !== 'string' || !el.selector.trim() || el.selector.length > 512) throw new Error('Invalid ticket annotations.')
    const role = el.role == null ? null : typeof el.role === 'string' ? el.role.trim().slice(0, 64) || null : null
    if (typeof el.label !== 'string' || !el.label.trim() || el.label.length > 120) throw new Error('Invalid ticket annotations.')
    const visibleText = el.visibleText == null
      ? null
      : typeof el.visibleText === 'string'
        ? el.visibleText.trim().slice(0, 120) || null
        : null
    if (!value.viewport || typeof value.viewport !== 'object' || Array.isArray(value.viewport)) {
      throw new Error('Invalid ticket annotations.')
    }
    const vp = value.viewport as Record<string, unknown>
    if (typeof vp.width !== 'number' || typeof vp.height !== 'number' || !Number.isFinite(vp.width) || !Number.isFinite(vp.height)) {
      throw new Error('Invalid ticket annotations.')
    }
    if (vp.width < 200 || vp.width > 10_000 || vp.height < 200 || vp.height > 10_000) throw new Error('Invalid ticket annotations.')
    const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now()
    const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt
    out.push({
      id: value.id.trim(),
      note: value.note.trim(),
      pagePath: value.pagePath.trim(),
      element: { selector: el.selector.trim(), role, label: el.label.trim(), visibleText },
      viewport: { width: Math.round(vp.width), height: Math.round(vp.height) },
      createdAt,
      updatedAt,
    })
  }
  return out
}

export function developerSupportAnnotationsForWebhook(
  annotations: DeveloperTicketAnnotation[],
): Array<{
  id: string
  note: string
  pagePath: string
  selector: string
  role: string | null
  elementLabel: string
  visibleText: string | null
  viewportWidth: number
  viewportHeight: number
}> {
  return annotations.map((item) => ({
    id: item.id,
    note: item.note,
    pagePath: item.pagePath,
    selector: item.element.selector,
    role: item.element.role,
    elementLabel: item.element.label,
    visibleText: item.element.visibleText,
    viewportWidth: item.viewport.width,
    viewportHeight: item.viewport.height,
  }))
}

export function formatDeveloperSupportAnnotationsContext(annotations: DeveloperTicketAnnotation[]): string | null {
  if (!annotations.length) return null
  const lines = ['Owner page notes (element annotations):']
  for (const item of annotations) {
    lines.push(`- ${developerTicketAnnotationDisplayLine(item)}`)
    lines.push(`  Path: ${item.pagePath}`)
    lines.push(`  Selector: ${item.element.selector}`)
    lines.push(`  Viewport: ${item.viewport.width}×${item.viewport.height}`)
  }
  return lines.join('\n')
}

export function developerTicketAnnotationsPersistenceJson(annotations: DeveloperTicketAnnotation[]): DeveloperTicketAnnotation[] {
  return parseDeveloperSupportAnnotations(annotations)
}