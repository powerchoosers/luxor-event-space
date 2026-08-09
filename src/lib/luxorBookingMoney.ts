export const LUXOR_DEFAULT_SECURITY_DEPOSIT = 750

export function parseLuxorCurrency(value: unknown) {
  const normalized = String(value ?? '').replace(/[^0-9.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0
}

export function formatLuxorCurrency(value: unknown) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseLuxorCurrency(value))
}

export function defaultLuxorReservationDeposit(contractTotal: unknown) {
  return Math.round(parseLuxorCurrency(contractTotal) * 0.3 * 100) / 100
}
