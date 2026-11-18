import type { PDFFont } from 'pdf-lib'

/** Word-wrap a single logical line without joining across newline boundaries. */
export function wrapLuxorPdfLogicalLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return ['']
  const words = text.split(/(\s+)/).filter((part) => part.length > 0)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      const candidate = line + word.replace(/\s+/g, ' ')
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
      else if (line) {
        lines.push(line.trimEnd())
        line = ''
      }
      continue
    }
    const candidate = line ? `${line}${line.endsWith(' ') ? '' : ' '}${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line.trimEnd())
      if (font.widthOfTextAtSize(word, size) <= maxWidth) line = word
      else {
        let chunk = ''
        for (const char of word) {
          const next = chunk + char
          if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next
          else {
            if (chunk) lines.push(chunk)
            chunk = char
          }
        }
        line = chunk
      }
    }
  }
  if (line) lines.push(line.trimEnd())
  return lines.length ? lines : ['']
}

export function wrapLuxorPdfPreservingBreaks(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const logical = text.split('\n')
  return logical.flatMap((row) => wrapLuxorPdfLogicalLine(row, font, size, maxWidth))
}