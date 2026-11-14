// Minimal nanoid-compatible ID generator — avoids an extra dependency.
export function nanoid(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(12))
    : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256))
  for (const byte of bytes) {
    result += chars[byte % chars.length]
  }
  return result
}
