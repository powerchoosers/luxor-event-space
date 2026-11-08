/** A JSON number is accepted only when its canonical decimal is an exact cent. */
export function isExactPlanningCent(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const match = /^-?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value))
  if (!match) return false
  const fraction = match[2] || ''
  const excessDigits = fraction.length - Number(match[3] || 0) - 2
  if (excessDigits <= 0) return true
  const digits = match[1] + fraction
  if (excessDigits > digits.length) return /^0+$/.test(digits)
  return /^0+$/.test(digits.slice(-excessDigits))
}

/** Conservative bounds matching the transactional v1 compatibility guard. */
export function hasSupportedPlanningBounds(kind: 'goal' | 'opening_scenario', payload: Record<string, unknown>): boolean {
  const label = kind === 'goal' ? payload.title : payload.label
  if (typeof label !== 'string' || new TextEncoder().encode(label).length > 120 || !Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0 || Number(payload.revision) >= 2147483647) return false
  if (kind === 'goal') return isExactPlanningCent(payload.target)
  return (payload.openingAmount === null || isExactPlanningCent(payload.openingAmount)) && (payload.minimumReserve === null || isExactPlanningCent(payload.minimumReserve))
}
