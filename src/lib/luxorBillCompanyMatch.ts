type ConfirmedBillCompany = { vendor_id: string | null; provider: string | null }

/** Sender rows must be owner-confirmed, complete, and from one exact sender. */
export function matchConfirmedBillCompany(provider: string | null, rows: ConfirmedBillCompany[], truncated: boolean): string | null {
  const name = provider?.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!name || truncated || !rows.length) return null
  const ids = new Set(rows.map((row) => row.vendor_id).filter((id): id is string => Boolean(id)))
  if (ids.size !== 1 || rows.some((row) => !row.vendor_id)) return null
  if (!rows.some((row) => row.provider?.trim().replace(/\s+/g, ' ').toLowerCase() === name)) return null
  return [...ids][0]
}
