/** PostgREST often returns `2026-07-29 02:27:20.733+00`, which `Date.parse` rejects. */
export function luxorTimestampMs(value: string): number | null {
  const direct = Date.parse(value)
  if (Number.isFinite(direct)) return direct
  const normalized = value.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})$/,
    (_, date, time, offset) => `${date}T${time}${offset}:00`,
  )
  if (normalized === value) return null
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function luxorTimestampIsKnown(value: string): boolean {
  return luxorTimestampMs(value) !== null
}
