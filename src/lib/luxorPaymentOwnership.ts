import type { LuxorInvoice, LuxorInvoiceLineItem } from './luxorInquiryTypes'

/** New proposals use this marker so locked legacy payment behavior remains unchanged. */
export const LUXOR_PAYMENT_COLLECTION_SCOPE = 'luxor_services_only'

const LUXOR_SERVICE_IDS = new Set(['venue-rental', 'required-cleaning', 'required-security', 'essential-decor'])

function money(value: number) { return Math.round(value * 100) / 100 }

function lineId(item: LuxorInvoiceLineItem) {
  return String(item.id || item.catalogId || '').trim().toLowerCase()
}

export function isLuxorCollectedLineItem(item: LuxorInvoiceLineItem) {
  if (LUXOR_SERVICE_IDS.has(lineId(item))) return true
  const text = `${item.category || ''} ${item.description || ''}`.toLowerCase()
  return /venue\s+rental|required\s+cleaning|required\s+security|essential\s+decor/.test(text)
}

/** Calculates the amount Stripe may collect for a new proposal. */
export function luxorCollectionAmounts(invoice: LuxorInvoice) {
  const context = invoice.proposal_context && typeof invoice.proposal_context === 'object'
    ? invoice.proposal_context as Record<string, unknown>
    : {}
  const scoped = context.payment_collection_scope === LUXOR_PAYMENT_COLLECTION_SCOPE
  const serviceItems = (Array.isArray(invoice.line_items) ? invoice.line_items : [])
    .filter((item) => item.paymentBucket !== 'security_deposit')
    .filter((item) => item.pricingRole !== 'discount' && item.pricingRole !== 'tax' && !item.isChecklistItem)
  const completeEventTotal = money(Number(invoice.total || 0))
  const luxorBase = money(serviceItems.filter(isLuxorCollectedLineItem).reduce((sum, item) => sum + Number(item.total || 0), 0))
  if (!scoped) return { scoped: false, luxorServicesTotal: completeEventTotal, plannerServicesTotal: 0 }
  const serviceSubtotal = money(serviceItems.reduce((sum, item) => sum + Number(item.total || 0), 0))
  // Apply the locked proposal's tax/discount result proportionally to the
  // two collection channels so their amounts still reconcile exactly to the
  // contract total without applying a promotion again in Stripe.
  const luxorServicesTotal = serviceSubtotal > 0
    ? money(completeEventTotal * Math.min(1, Math.max(0, luxorBase / serviceSubtotal)))
    : 0
  return {
    scoped: true,
    luxorServicesTotal: Math.min(completeEventTotal, Math.max(0, luxorServicesTotal)),
    plannerServicesTotal: Math.max(0, money(completeEventTotal - luxorServicesTotal)),
  }
}
