export type LuxorDocumentCreatorBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
  | { type: 'bullet'; items: string[] }
  | { type: 'ordered'; items: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectMarksText(node: Record<string, unknown>): { text: string; bold?: boolean; italic?: boolean; underline?: boolean } {
  const text = typeof node.text === 'string' ? node.text : ''
  const marks = Array.isArray(node.marks) ? node.marks : []
  const bold = marks.some((mark) => isRecord(mark) && mark.type === 'bold')
  const italic = marks.some((mark) => isRecord(mark) && mark.type === 'italic')
  const underline = marks.some((mark) => isRecord(mark) && mark.type === 'underline')
  return { text, bold: bold || undefined, italic: italic || undefined, underline: underline || undefined }
}

function paragraphFromNode(node: Record<string, unknown>): Extract<LuxorDocumentCreatorBlock, { type: 'paragraph' }> {
  const content = Array.isArray(node.content) ? node.content : []
  if (content.length === 1 && isRecord(content[0]) && content[0].type === 'text') {
    const segment = collectMarksText(content[0])
    return { type: 'paragraph', ...segment }
  }
  const text = content
    .filter(isRecord)
    .map((child) => (child.type === 'text' && typeof child.text === 'string' ? child.text : child.type === 'hardBreak' ? '\n' : ''))
    .join('')
  return { type: 'paragraph', text }
}

export function blocksFromTipTapJson(body: unknown): LuxorDocumentCreatorBlock[] {
  if (!isRecord(body) || !Array.isArray(body.content)) return []
  const blocks: LuxorDocumentCreatorBlock[] = []
  for (const raw of body.content) {
    if (!isRecord(raw)) continue
    if (raw.type === 'heading') {
      const level = raw.attrs && isRecord(raw.attrs) && typeof raw.attrs.level === 'number'
        ? (Math.min(3, Math.max(1, raw.attrs.level)) as 1 | 2 | 3)
        : 1
      const text = (Array.isArray(raw.content) ? raw.content : [])
        .filter(isRecord)
        .map((child) => (typeof child.text === 'string' ? child.text : ''))
        .join('')
      blocks.push({ type: 'heading', level, text })
      continue
    }
    if (raw.type === 'bulletList' || raw.type === 'orderedList') {
      const items: string[] = []
      for (const listItem of Array.isArray(raw.content) ? raw.content : []) {
        if (!isRecord(listItem)) continue
        for (const inner of Array.isArray(listItem.content) ? listItem.content : []) {
          if (isRecord(inner) && inner.type === 'paragraph') {
            const paragraph = paragraphFromNode(inner)
            if (paragraph.text) items.push(paragraph.text)
          }
        }
      }
      blocks.push(raw.type === 'orderedList' ? { type: 'ordered', items } : { type: 'bullet', items })
      continue
    }
    if (raw.type === 'paragraph') {
      const paragraph = paragraphFromNode(raw)
      if (paragraph.text || blocks.length === 0) blocks.push(paragraph)
    }
  }
  return blocks
}

/** Concatenates block text in document order without normalizing characters. */
export function verbatimPlainTextFromBlocks(blocks: LuxorDocumentCreatorBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        if (block.text) parts.push(block.text)
        break
      case 'bullet':
      case 'ordered':
        for (const item of block.items) {
          if (item) parts.push(item)
        }
        break
      default:
        break
    }
  }
  return parts.join('\n')
}

export function verbatimPlainTextFromTipTap(body: unknown): string {
  return verbatimPlainTextFromBlocks(blocksFromTipTapJson(body))
}