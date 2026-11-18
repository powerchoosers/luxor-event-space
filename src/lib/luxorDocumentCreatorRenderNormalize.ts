/** Normalizes control characters for PDF render only; stored editor JSON is untouched. */
export function normalizeControlCharsForRender(text: string): string {
  return text
    .replace(/\f/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}