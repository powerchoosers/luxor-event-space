/**
 * Decodes HTML entities (such as &#39;, &quot;, &amp;, &lt;, &gt;, &nbsp;, etc.)
 * into clean, plain-text strings for rendering in UI previews and dossiers.
 * Supports multi-pass decoding for double-escaped strings.
 */
export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return ''
  let text = String(value)

  for (let pass = 0; pass < 3; pass++) {
    if (!text.includes('&')) break
    const previous = text
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#x2f;/gi, '/')
      .replace(/&nbsp;/g, ' ')
      .replace(/&rsquo;/gi, "'")
      .replace(/&lsquo;/gi, "'")
      .replace(/&rdquo;/gi, '"')
      .replace(/&ldquo;/gi, '"')
      .replace(/&ndash;/gi, '–')
      .replace(/&mdash;/gi, '—')
      .replace(/&hellip;/gi, '…')
      .replace(/&copy;/gi, '©')
      .replace(/&reg;/gi, '®')
      .replace(/&trade;/gi, '™')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

    if (text === previous) break
  }

  return text
}
