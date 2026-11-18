export type TipTapDocNode = Record<string, unknown>

export function plainTextToTipTapDocument(text: string): TipTapDocNode {
  const trimmed = text.replace(/\r\n/g, '\n')
  if (!trimmed.trim()) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  const paragraphs = trimmed.split(/\n{2,}/)
  const content = paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n')
    const inline: TipTapDocNode[] = []
    lines.forEach((line, index) => {
      if (line) inline.push({ type: 'text', text: line })
      if (index < lines.length - 1) inline.push({ type: 'hardBreak' })
    })
    if (inline.length === 0) inline.push({ type: 'hardBreak' })
    return { type: 'paragraph', content: inline }
  })
  return { type: 'doc', content }
}