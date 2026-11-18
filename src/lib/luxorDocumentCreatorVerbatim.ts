export type LuxorDocumentCreatorInline =
  | { kind: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
  | { kind: 'hardBreak' }

export type LuxorDocumentCreatorBlock =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: LuxorDocumentCreatorInline[] }
  | { type: 'paragraph'; inlines: LuxorDocumentCreatorInline[] }
  | { type: 'bullet'; items: LuxorDocumentCreatorInline[][] }
  | { type: 'ordered'; items: LuxorDocumentCreatorInline[][] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function inlinesFromContent(content: unknown): LuxorDocumentCreatorInline[] {
  const nodes = Array.isArray(content) ? content : []
  const inlines: LuxorDocumentCreatorInline[] = []
  for (const node of nodes) {
    if (!isRecord(node)) continue
    if (node.type === 'hardBreak') {
      inlines.push({ kind: 'hardBreak' })
      continue
    }
    if (node.type === 'text' && typeof node.text === 'string') {
      const marks = Array.isArray(node.marks) ? node.marks : []
      const bold = marks.some((mark) => isRecord(mark) && mark.type === 'bold')
      const italic = marks.some((mark) => isRecord(mark) && mark.type === 'italic')
      const underline = marks.some((mark) => isRecord(mark) && mark.type === 'underline')
      inlines.push({
        kind: 'text',
        text: node.text,
        bold: bold || undefined,
        italic: italic || undefined,
        underline: underline || undefined,
      })
    }
  }
  return inlines
}

function paragraphIsEmpty(inlines: LuxorDocumentCreatorInline[]) {
  return inlines.length === 0 || inlines.every((part) => part.kind === 'hardBreak')
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
      const inlines = inlinesFromContent(raw.content)
      blocks.push({ type: 'heading', level, inlines })
      continue
    }
    if (raw.type === 'bulletList' || raw.type === 'orderedList') {
      const items: LuxorDocumentCreatorInline[][] = []
      for (const listItem of Array.isArray(raw.content) ? raw.content : []) {
        if (!isRecord(listItem)) continue
        const itemInlines: LuxorDocumentCreatorInline[] = []
        for (const inner of Array.isArray(listItem.content) ? listItem.content : []) {
          if (isRecord(inner) && inner.type === 'paragraph') {
            const inlines = inlinesFromContent(inner.content)
            if (itemInlines.length && inlines.length) itemInlines.push({ kind: 'hardBreak' })
            itemInlines.push(...inlines)
          }
        }
        if (itemInlines.length) items.push(itemInlines)
      }
      blocks.push(raw.type === 'orderedList' ? { type: 'ordered', items } : { type: 'bullet', items })
      continue
    }
    if (raw.type === 'paragraph') {
      const inlines = inlinesFromContent(raw.content)
      if (!paragraphIsEmpty(inlines) || blocks.length === 0) blocks.push({ type: 'paragraph', inlines })
    }
  }
  return blocks
}

export function inlinesToPlainText(inlines: LuxorDocumentCreatorInline[]): string {
  return inlines
    .map((part) => (part.kind === 'hardBreak' ? '\n' : part.text))
    .join('')
}

/** Concatenates block text in document order without normalizing characters. */
export function verbatimPlainTextFromBlocks(blocks: LuxorDocumentCreatorBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph': {
        const text = inlinesToPlainText(block.inlines)
        if (text) parts.push(text)
        break
      }
      case 'bullet':
      case 'ordered':
        for (const item of block.items) {
          const text = inlinesToPlainText(item)
          if (text) parts.push(text)
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