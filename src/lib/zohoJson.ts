/** Zoho IDs can exceed JavaScript's safe integer range, even in numeric JSON fields. */
export function parseZohoJson(text: string): unknown {
  // Match complete string tokens first so digits inside subjects/content are untouched.
  const lossless = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => (
    /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token
  ))
  return JSON.parse(lossless)
}
