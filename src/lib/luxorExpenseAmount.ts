/** Parse an expense amount without treating missing or malformed data as zero. */
export function expenseAmountState(value: unknown, metadata?: Record<string, unknown> | null) {
  let amount: number | null = null
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 0) amount = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed) && parsed >= 0) amount = parsed
    }
  }

  const state = metadata?.amount_state
  return {
    amount,
    known: amount !== null && state !== 'unknown' && state !== 'variable',
  }
}
