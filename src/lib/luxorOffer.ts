import type { LuxorInvoice, LuxorInvoiceLineItem } from './luxorInquiryTypes'

const MONEY_EPSILON = 0.005

export function roundLuxorMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function clampLuxorDiscountPercent(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, roundLuxorMoney(parsed)))
}

function isRefundableSecurityDeposit(item: LuxorInvoiceLineItem) {
  return item.category === 'Security Deposit' || /refundable security deposit/i.test(item.description)
}

export function calculateLuxorOfferPricing(input: {
  lineItems: LuxorInvoiceLineItem[]
  taxRate: number
  discountPercent?: number
}) {
  const taxRate = Math.min(1, Math.max(0, Number(input.taxRate) || 0))
  const originalSubtotal = roundLuxorMoney(input.lineItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0), 0))
  const eligibleSubtotal = roundLuxorMoney(input.lineItems
    .filter((item) => !isRefundableSecurityDeposit(item))
    .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0), 0))
  const discountPercent = clampLuxorDiscountPercent(input.discountPercent)
  const discountAmount = roundLuxorMoney(eligibleSubtotal * (discountPercent / 100))
  const subtotal = Math.max(0, roundLuxorMoney(originalSubtotal - discountAmount))
  const originalTotal = roundLuxorMoney(originalSubtotal * (1 + taxRate))
  const total = roundLuxorMoney(subtotal * (1 + taxRate))

  return {
    originalSubtotal,
    originalTotal,
    eligibleSubtotal,
    discountPercent,
    discountAmount,
    subtotal,
    total,
    totalSavings: Math.max(0, roundLuxorMoney(originalTotal - total)),
  }
}

export function hasLuxorOffer(invoice: Pick<LuxorInvoice, 'discount_percent' | 'original_total' | 'total'>) {
  return Number(invoice.discount_percent || 0) > 0 && Number(invoice.original_total || invoice.total || 0) > Number(invoice.total || 0) + MONEY_EPSILON
}

export function isLuxorOfferExpired(invoice: Pick<LuxorInvoice, 'offer_expires_at' | 'offer_status'>, now = new Date()) {
  if (invoice.offer_status === 'withdrawn' || invoice.offer_status === 'expired') return true
  if (!invoice.offer_expires_at) return false
  const expiry = new Date(invoice.offer_expires_at)
  return Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()
}

export function formatLuxorOfferExpiry(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date)
}

export function luxorOfferSnapshot(invoice: LuxorInvoice) {
  const originalTotal = roundLuxorMoney(Number(invoice.original_total ?? invoice.total ?? 0))
  const discountedTotal = roundLuxorMoney(Number(invoice.total || 0))
  return {
    originalTotal,
    discountedTotal,
    percent: clampLuxorDiscountPercent(invoice.discount_percent),
    savings: Math.max(0, roundLuxorMoney(originalTotal - discountedTotal)),
    expiresAt: invoice.offer_expires_at || null,
    active: hasLuxorOffer(invoice) && !isLuxorOfferExpired(invoice),
  }
}
