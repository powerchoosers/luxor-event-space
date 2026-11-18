/** Strips C0 controls except newline/tab from plain text (paste/display normalization). */
export function normalizePastedPlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function stripControlCharsFromHtml(html: string): string {
  return html.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Walk TipTap JSON and clean visible text without changing structure. */
export function sanitizeTipTapDocumentForEditor(doc: unknown): unknown {
  if (!isRecord(doc)) return doc
  const content = Array.isArray(doc.content) ? doc.content.map(sanitizeTipTapNodeForEditor) : doc.content
  return { ...doc, content }
}

function sanitizeTipTapNodeForEditor(node: unknown): unknown {
  if (!isRecord(node)) return node
  if (node.type === 'text' && typeof node.text === 'string') {
    return { ...node, text: normalizePastedPlainText(node.text) }
  }
  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map(sanitizeTipTapNodeForEditor) }
  }
  return node
}