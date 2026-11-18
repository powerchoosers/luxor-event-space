import { normalizePastedPlainText } from '@/lib/luxorDocumentCreatorSanitize'

export type TipTapDocNode = Record<string, unknown>

/** Plain-text paste: each line becomes its own paragraph; blank lines stay as empty paragraphs. */
export function plainTextToTipTapDocument(text: string): TipTapDocNode {
  const normalized = normalizePastedPlainText(text)
  const lines = normalized.split('\n')
  const content = lines.map((line) => {
    if (!line) return { type: 'paragraph' }
    return { type: 'paragraph', content: [{ type: 'text', text: line }] }
  })
  if (content.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  return { type: 'doc', content }
}