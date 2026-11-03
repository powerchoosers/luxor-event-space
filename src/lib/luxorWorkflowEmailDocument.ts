import type { EmailBlock, LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'

const blockFields: Record<string, string[]> = {
  hero: ['headline', 'subheadline', 'backgroundImage', 'overlayOpacity', 'textAlign', 'ctaLabel', 'ctaUrl', 'ctaVisible'],
  text: ['content', 'fontSize', 'textAlign', 'color'],
  image_text: ['imageUrl', 'imageAlt', 'imagePosition', 'headline', 'body', 'ctaLabel', 'ctaUrl'],
  button: ['label', 'url', 'align', 'bgColor', 'textColor'],
  two_column: ['leftHeadline', 'leftBody', 'rightHeadline', 'rightBody'],
  divider: ['color', 'thickness', 'style'], spacer: ['height'],
  footer: ['companyName', 'address', 'phone', 'website', 'unsubscribeUrl', 'showSocial', 'instagramUrl', 'facebookUrl', 'tiktokUrl'],
}
const numericFields: Record<string, [number, number]> = { overlayOpacity: [0, 1], fontSize: [8, 72], thickness: [1, 10], height: [0, 160] }
const colorPattern = /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i
const urlFields = new Set(['backgroundImage', 'imageUrl', 'ctaUrl', 'url', 'unsubscribeUrl', 'instagramUrl', 'facebookUrl', 'tiktokUrl', 'website'])

export function isSafeWorkflowEmailUrl(value: string) {
  if (!value || value === '#unsubscribe') return true
  if (/[\u0000-\u0020<>"'`\\]/.test(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try { const url = new URL(value.startsWith('www.') || /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(value) ? `https://${value}` : value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}

/** A bounded block document, not arbitrary HTML, is the shared authoring contract. */
export function validateWorkflowEmailDocument(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Choose a valid email template.'
  const doc = value as Partial<LuxorEmailDocument>
  if (JSON.stringify(value).length > 120000 || doc.schemaVersion !== 2 || typeof doc.subject !== 'string' || doc.subject.length > 500 || typeof doc.preheader !== 'string' || doc.preheader.length > 500
    || !Array.isArray(doc.blocks) || !doc.blocks.length || doc.blocks.length > 30) return 'Email templates need 1 to 30 blocks and a supported document version.'
  const ids = new Set<string>()
  for (const block of doc.blocks) {
    if (!block || typeof block !== 'object' || Array.isArray(block) || !blockFields[block.type] || typeof block.id !== 'string' || !block.id || block.id.length > 120 || ids.has(block.id)) return 'Every email block needs a supported type and a unique ID.'
    ids.add(block.id)
    const fields = blockFields[block.type]
    for (const field of Object.keys(block)) if (!['id', 'type', ...fields].includes(field)) return `Unsupported email block field: ${field}.`
    const values = block as unknown as Record<string, unknown>
    for (const field of fields) {
      const item = values[field]
      if (field === 'tiktokUrl' && item === undefined) continue
      if (field in numericFields) { const [min, max] = numericFields[field]; if (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max) return `Choose a valid ${field} value.` }
      else if (['ctaVisible', 'showSocial'].includes(field)) { if (typeof item !== 'boolean') return `Choose a valid ${field} option.` }
      else {
        if (typeof item !== 'string' || item.length > 12000) return `The ${field} field must be text under 12,000 characters.`
        if (urlFields.has(field) && !isSafeWorkflowEmailUrl(item)) return 'Email images and links must use a valid web address.'
        if (['color', 'bgColor', 'textColor'].includes(field) && !colorPattern.test(item)) return 'Choose a valid email color.'
        if (['align', 'textAlign'].includes(field) && !['left', 'center', 'right'].includes(item)) return 'Choose a valid text alignment.'
        if (field === 'imagePosition' && !['left', 'right'].includes(item)) return 'Choose left or right image placement.'
        if (field === 'style' && !['solid', 'dashed', 'dotted'].includes(item)) return 'Choose a supported divider style.'
      }
    }
  }
  const theme = doc.theme
  if (!theme || typeof theme !== 'object' || !['light', 'dark', 'brand'].includes(theme.mode)) return 'Choose a supported email theme.'
  if (!Number.isFinite(theme.radius) || theme.radius < 0 || theme.radius > 40 || !Number.isFinite(theme.contentWidth) || theme.contentWidth < 320 || theme.contentWidth > 800) return 'Choose a valid email width and corner radius.'
  for (const key of ['canvas', 'surface', 'surfaceAlt', 'text', 'muted', 'accent', 'accentText', 'border'] as const) if (typeof theme[key] !== 'string' || !colorPattern.test(theme[key])) return 'Choose valid theme colors.'
  for (const key of ['fontHeading', 'fontBody'] as const) if (typeof theme[key] !== 'string' || theme[key].length > 150 || !/^[\w\s,'"-]+$/.test(theme[key])) return 'Choose a valid email font.'
  return null
}

export function mapWorkflowEmailBlocks(blocks: EmailBlock[], transform: (value: string, field: string) => string): EmailBlock[] {
  return blocks.map((block) => Object.fromEntries(Object.entries(block).map(([key, value]) => [key, typeof value === 'string' && key !== 'id' && key !== 'type' ? transform(value, key) : value])) as unknown as EmailBlock)
}
