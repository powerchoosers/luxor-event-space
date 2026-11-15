function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function coachingMarkdownInlineHtml(text: string) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function coachingBulletList(items: string[]) {
  return `<ul style="margin:0 0 8px;padding:0 0 0 18px;color:#201b16;font-size:14px;line-height:1.65;">${items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join('')}</ul>`
}

function isCoachingListLine(line: string) {
  return /^[-*]\s+/.test(line)
}

function listLineText(line: string) {
  return line.replace(/^[-*]\s+/, '').trim()
}

/** Line-aware Marcus coaching markdown: paragraphs vs bullet lists, with **bold** in both. */
export function coachingMarkdownToHtml(markdown: string) {
  const lines = markdown.trim().split('\n')
  const chunks: string[] = []
  let listBuffer: string[] = []
  let paragraphLines: string[] = []

  const flushList = () => {
    if (!listBuffer.length) return
    chunks.push(coachingBulletList(listBuffer.map((line) => coachingMarkdownInlineHtml(line))))
    listBuffer = []
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const body = paragraphLines
      .map((line) => coachingMarkdownInlineHtml(line))
      .join('<br />')
    chunks.push(
      `<p style="margin:0 0 12px;color:#201b16;font-size:15px;line-height:1.72;">${body}</p>`,
    )
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      flushParagraph()
      continue
    }
    if (isCoachingListLine(line)) {
      flushParagraph()
      listBuffer.push(listLineText(line))
      continue
    }
    flushList()
    paragraphLines.push(trimmed)
  }

  flushList()
  flushParagraph()
  return chunks.join('')
}