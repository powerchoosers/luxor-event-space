import 'server-only'

import { LuxorInvoice, LuxorInvoiceKind, LuxorInvoiceLineItem, LuxorInvoiceStatus, LuxorBill, LuxorPayment, LuxorProposalContext } from './luxorInquiryTypes'
import { roundLuxorMoney } from './luxorOffer'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from './luxorBookingMoney'

type SupabaseError = {
  message?: string
  error?: string
  details?: string
  hint?: string
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SupabaseError
    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function listInvoices(limit = 1000) {
  return supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`
  )
}

export async function listInvoicesByInquiry(inquiryId: string) {
  return supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`
  )
}

export async function listInvoicesByBooking(bookingId: string) {
  return supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc`,
  )
}

export async function getInvoiceByBookingAndKind(bookingId: string, invoiceKind: Exclude<LuxorInvoiceKind, 'event'>) {
  const invoices = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&invoice_kind=eq.${invoiceKind}&order=created_at.desc&limit=1`,
  )
  return invoices[0] ?? null
}

export async function getInvoice(id: string) {
  const [invoice] = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return invoice ?? null
}

export async function getInvoiceByPublicToken(token: string) {
  const [invoice] = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&public_token=eq.${encodeURIComponent(token)}&limit=1`,
  )
  return invoice ?? null
}

export async function listPaidPaymentsByInvoice(invoiceId: string) {
  return supabaseRest<LuxorPayment[]>(
    `luxor_payments?select=*&invoice_id=eq.${encodeURIComponent(invoiceId)}&status=eq.paid&order=created_at.desc`,
  )
}

export async function createInvoice(data: {
  client_name: string
  event_type?: string | null
  description?: string | null
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  tax_rate: number
  total: number
  original_subtotal?: number | null
  original_total?: number | null
  discount_percent?: number | null
  discount_amount?: number | null
  discount_type?: 'percent' | 'fixed' | null
  discount_value?: number | null
  offer_expires_at?: string | null
  offer_status?: 'active' | 'redeemed' | 'expired' | 'withdrawn'
  offer_redeemed_at?: string | null
  stripe_coupon_id?: string | null
  stripe_promotion_code_id?: string | null
  due_date?: string | null
  inquiry_id?: string | null
  lead_event_id?: string | null
  notes?: string | null
  booking_id?: string | null
  parent_invoice_id?: string | null
  invoice_kind?: LuxorInvoiceKind
  status?: LuxorInvoiceStatus
  proposal_context?: LuxorProposalContext | null
  proposal_accepted_at?: string | null
  proposal_accepted_ip?: string | null
  proposal_accepted_user_agent?: string | null
  price_locked_at?: string | null
  supersedes_invoice_id?: string | null
  proposal_version?: number | null
}) {
  const [created] = await supabaseRest<LuxorInvoice[]>('luxor_invoices?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_name: data.client_name,
      event_type: data.event_type || null,
      description: data.description || null,
      line_items: data.line_items,
      subtotal: data.subtotal,
      tax_rate: data.tax_rate,
      total: data.total,
      original_subtotal: data.original_subtotal ?? data.subtotal,
      original_total: data.original_total ?? data.total,
      discount_percent: data.discount_percent ?? 0,
      discount_amount: data.discount_amount ?? 0,
      discount_type: data.discount_type ?? 'percent',
      discount_value: data.discount_value ?? 0,
      offer_expires_at: data.offer_expires_at ?? null,
      offer_status: data.offer_status ?? 'active',
      offer_redeemed_at: data.offer_redeemed_at ?? null,
      stripe_coupon_id: data.stripe_coupon_id ?? null,
      stripe_promotion_code_id: data.stripe_promotion_code_id ?? null,
      due_date: data.due_date || null,
      inquiry_id: data.inquiry_id || null,
      lead_event_id: data.lead_event_id || null,
      notes: data.notes || null,
      booking_id: data.booking_id || null,
      parent_invoice_id: data.parent_invoice_id || null,
      invoice_kind: data.invoice_kind || 'event',
      status: data.status || 'draft',
      proposal_context: data.proposal_context ?? {},
      proposal_accepted_at: data.proposal_accepted_at ?? null,
      proposal_accepted_ip: data.proposal_accepted_ip ?? null,
      proposal_accepted_user_agent: data.proposal_accepted_user_agent ?? null,
      price_locked_at: data.price_locked_at ?? null,
      supersedes_invoice_id: data.supersedes_invoice_id ?? null,
      proposal_version: data.proposal_version ?? 1,
    }),
  })

  return created
}

export async function updateInvoice(
  id: string,
  updates: Partial<Pick<LuxorInvoice,
    | 'status'
    | 'due_date'
    | 'paid_at'
    | 'notes'
    | 'line_items'
    | 'subtotal'
    | 'tax_rate'
    | 'total'
    | 'original_subtotal'
    | 'original_total'
    | 'discount_percent'
    | 'discount_amount'
    | 'discount_type'
    | 'discount_value'
    | 'offer_expires_at'
    | 'offer_status'
    | 'offer_redeemed_at'
    | 'stripe_coupon_id'
    | 'stripe_promotion_code_id'
    | 'public_token'
    | 'proposal_sent_at'
    | 'proposal_viewed_at'
    | 'payment_requested_at'
    | 'payment_requested_amount'
    | 'payment_requested_label'
    | 'stripe_checkout_session_id'
    | 'stripe_checkout_url'
    | 'stripe_checkout_opened_at'
    | 'stripe_invoice_id'
    | 'booking_id'
    | 'proposal_context'
    | 'proposal_accepted_at'
    | 'proposal_accepted_ip'
    | 'proposal_accepted_user_agent'
    | 'price_locked_at'
    | 'supersedes_invoice_id'
    | 'proposal_version'
  >>
) {
  const [updated] = await supabaseRest<LuxorInvoice[]>(`luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...updates,
      updated_at: new Date().toISOString(),
    }),
  })

  return updated ?? null
}

/**
 * Records the first real client opening of a published proposal. The
 * `proposal_viewed_at=is.null` condition makes this safe if a browser opens
 * the private link in more than one tab at the same time: exactly one request
 * wins and can create the matching owner activity notification.
 */
export async function markLuxorProposalViewed(id: string, viewedAt = new Date().toISOString()) {
  const [updated] = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}&proposal_viewed_at=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        proposal_viewed_at: viewedAt,
        updated_at: viewedAt,
      }),
    },
  )

  return updated ?? null
}

/**
 * Claims the first public acceptance without replacing the original IP or
 * browser audit trail when the prospect retries in another tab.
 */
export async function claimLuxorProposalAcceptance(
  id: string,
  input: { acceptedAt?: string; ip?: string | null; userAgent?: string | null },
) {
  const acceptedAt = input.acceptedAt || new Date().toISOString()
  const [updated] = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}&proposal_accepted_at=is.null&status=eq.sent`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        proposal_accepted_at: acceptedAt,
        proposal_accepted_ip: input.ip || null,
        proposal_accepted_user_agent: input.userAgent || null,
        offer_status: 'active',
        updated_at: acceptedAt,
      }),
    },
  )

  return updated ?? null
}

export async function deleteInvoice(id: string) {
  await supabaseRest<null>(`luxor_payments?invoice_id=eq.${encodeURIComponent(id)}&status=neq.paid`, {
    method: 'DELETE',
  })
  await supabaseRest<null>(`luxor_invoices?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function listAllBills() {
  return supabaseRest<LuxorBill[]>('luxor_bills?select=*&order=due_date.asc')
}

export const LUXOR_REFUNDABLE_SECURITY_DEPOSIT_AMOUNT = LUXOR_DEFAULT_SECURITY_DEPOSIT
export const LUXOR_NON_REFUNDABLE_DEPOSIT_RATE = 0.3

const roundMoney = roundLuxorMoney

function securityDepositGross(invoice: LuxorInvoice) {
  const securitySubtotal = invoice.line_items
    .filter((item) => /refundable security deposit/i.test(item.description) || item.category === 'Security Deposit')
    .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0), 0)
  return roundMoney(securitySubtotal * (1 + Math.max(0, Number(invoice.tax_rate) || 0)))
}

export function calculateLuxorThirtyPercentDeposit(invoice: LuxorInvoice) {
  const refundableSecurityDeposit = Math.min(Number(invoice.total || 0), securityDepositGross(invoice))
  const nonSecurityTotal = Math.max(0, roundMoney(Number(invoice.total || 0) - refundableSecurityDeposit))
  const depositAmount = Math.min(nonSecurityTotal, roundMoney(nonSecurityTotal * LUXOR_NON_REFUNDABLE_DEPOSIT_RATE))
  const originalInvoiceTotal = Number(invoice.original_total ?? invoice.total ?? 0)
  const originalNonSecurityTotal = Math.max(0, roundMoney(originalInvoiceTotal - refundableSecurityDeposit))
  const originalDepositAmount = Math.min(originalNonSecurityTotal, roundMoney(originalNonSecurityTotal * LUXOR_NON_REFUNDABLE_DEPOSIT_RATE))
  return {
    depositAmount,
    originalDepositAmount,
    depositSavings: Math.max(0, roundMoney(originalDepositAmount - depositAmount)),
    refundableSecurityDeposit,
    finalBalance: Math.max(0, roundMoney(Number(invoice.total || 0) - depositAmount)),
  }
}

// Compatibility helper for legacy callers. Final-payment timing is now part
// of the approved proposal payment plan, so an event date must never invent a
// due date on its own.
export function luxorFinalPaymentDueDate(_eventDate: string | null | undefined): null {
  return null
}

export async function ensureLuxorDepositInvoice(input: {
  masterInvoice: LuxorInvoice
  bookingId: string
  dueDate?: string | null
  reservationDepositAmount?: number | null
}) {
  const existing = await getInvoiceByBookingAndKind(input.bookingId, 'deposit')
  const calculated = calculateLuxorThirtyPercentDeposit(input.masterInvoice)
  const reservationPayment = Math.min(
    Math.max(0, Number(input.masterInvoice.total || 0) - calculated.refundableSecurityDeposit),
    Math.max(0, roundMoney(Number(input.reservationDepositAmount ?? calculated.depositAmount))),
  )
  // The refundable deposit is a fixed, separate $750 hold for every booking.
  // It is intentionally not configurable per proposal or payment method.
  const securityDeposit = LUXOR_DEFAULT_SECURITY_DEPOSIT
  if (reservationPayment < 0.5) throw new Error('The configured initial booking payment must be at least $0.50 to create a payment invoice.')
  const total = roundMoney(reservationPayment + securityDeposit)
  const lineItems: LuxorInvoiceLineItem[] = [
    {
      description: 'Initial Booking Payment', quantity: 1, unitPrice: reservationPayment, total: reservationPayment,
      category: 'Booking Payment', paymentBucket: 'venue', required: true,
    },
    {
      description: 'Refundable Security Deposit', quantity: 1, unitPrice: securityDeposit, total: securityDeposit,
      category: 'Security Deposit', paymentBucket: 'security_deposit', required: true,
      detail: 'Held through the post-event inspection and returned subject to the Event Agreement.',
    },
  ]
  const notes = 'Amount due after the signed Event Agreement: the initial booking payment plus the separate refundable security deposit. The security deposit is held through post-event inspection and is not part of the Event Price.'
  if (existing) {
    if (existing.status === 'paid') return existing
    return await updateInvoice(existing.id, {
      line_items: lineItems,
      subtotal: total,
      tax_rate: 0,
      total,
      original_subtotal: total,
      original_total: total,
      discount_percent: 0,
      discount_amount: 0,
      offer_expires_at: null,
      offer_status: 'active',
      stripe_coupon_id: null,
      stripe_promotion_code_id: null,
      due_date: input.dueDate || new Date().toISOString().slice(0, 10),
      notes,
    }) || existing
  }
  return createInvoice({
    inquiry_id: input.masterInvoice.inquiry_id,
    booking_id: input.bookingId,
    parent_invoice_id: input.masterInvoice.id,
    invoice_kind: 'deposit',
    client_name: input.masterInvoice.client_name,
    event_type: input.masterInvoice.event_type,
    description: 'Initial booking payment and refundable security deposit',
    line_items: lineItems,
    subtotal: total,
    tax_rate: 0,
    total,
    original_subtotal: total,
    original_total: total,
    discount_percent: 0,
    discount_amount: 0,
    offer_expires_at: null,
    offer_status: 'active',
    stripe_coupon_id: null,
    stripe_promotion_code_id: null,
    due_date: input.dueDate || new Date().toISOString().slice(0, 10),
    notes,
  })
}

export async function ensureLuxorFinalBalanceInvoice(input: {
  masterInvoice: LuxorInvoice
  bookingId: string
  dueDate: string | null
  depositPaid?: number
  securityDepositAmount?: number | null
}) {
  const dueDate = typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
    ? input.dueDate
    : null
  if (!dueDate) {
    throw new Error('A configured final payment due date is required before a final-balance invoice can be created.')
  }
  const existing = await getInvoiceByBookingAndKind(input.bookingId, 'final_balance')
  const { depositAmount: defaultDepositAmount, refundableSecurityDeposit } = calculateLuxorThirtyPercentDeposit(input.masterInvoice)
  // New proposals collect the separate refundable security deposit with the
  // signed-agreement booking payment. Keep it out of the final event balance
  // so it can never be charged twice.
  const eventTotal = Math.max(0, roundMoney(Number(input.masterInvoice.total || 0) - refundableSecurityDeposit))
  const depositAmount = Math.min(eventTotal, Math.max(0, roundMoney(input.depositPaid ?? defaultDepositAmount)))
  const remainingEventBalance = Math.max(0, roundMoney(eventTotal - depositAmount))
  const finalBalance = remainingEventBalance
  const lineItems: LuxorInvoiceLineItem[] = [
    { description: 'Remaining Event Balance After Initial Booking Payment', quantity: 1, unitPrice: remainingEventBalance, total: remainingEventBalance, category: 'Final Balance', paymentBucket: 'event', required: true },
  ]
  if (existing) {
    if (existing.status === 'paid') return existing
    return await updateInvoice(existing.id, {
      line_items: lineItems,
      subtotal: finalBalance,
      tax_rate: 0,
      total: finalBalance,
      due_date: dueDate,
      notes: `Final Event Price balance after the ${depositAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} initial booking payment. The refundable security deposit was collected separately with the initial payment and remains held through post-event inspection.`,
    }) || existing
  }
  return createInvoice({
    inquiry_id: input.masterInvoice.inquiry_id,
    booking_id: input.bookingId,
    parent_invoice_id: input.masterInvoice.id,
    invoice_kind: 'final_balance',
    client_name: input.masterInvoice.client_name,
    event_type: input.masterInvoice.event_type,
    description: 'Remaining Final Event Price balance',
    line_items: lineItems,
    subtotal: finalBalance,
    tax_rate: 0,
    total: finalBalance,
    due_date: dueDate,
    notes: `Final Event Price balance after the ${depositAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} initial booking payment. The refundable security deposit was collected separately with the initial payment and remains held through post-event inspection.`,
  })
}

export function calculateLuxorDepositAmounts(params: {
  lineItems: LuxorInvoiceLineItem[]
  taxRate?: number
  depositType?: 'solidify_date' | 'non_refundable_booking'
  customBookingDeposit?: number
  initialSecurityDeposit?: number
}) {
  const taxRate = Math.max(0, params.taxRate || 0)
  const depositType = params.depositType || 'solidify_date'
  const subtotal = params.lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0), 0)
  const total = Math.round(subtotal * (1 + taxRate) * 100) / 100

  if (depositType === 'non_refundable_booking') {
    const depositAmount = params.customBookingDeposit && params.customBookingDeposit > 0
      ? Math.round(params.customBookingDeposit * 100) / 100
      : Math.round(total * LUXOR_NON_REFUNDABLE_DEPOSIT_RATE * 100) / 100
    const remainingBalance = Math.max(0, Math.round((total - depositAmount) * 100) / 100)
    return {
      depositType: 'non_refundable_booking' as const,
      depositAmount: Math.min(depositAmount, total),
      remainingBalance,
      total,
      description: 'Non-refundable booking deposit (remaining balance due on the date in the Event Agreement)',
    }
  }

  // The 50% option is still a booking payment. The separate refundable
  // security deposit is collected with the initial booking payment instead of
  // being added to the Final Event Price balance.
  const rentalItemsSubtotal = params.lineItems
    .filter((item) => /venue|hall|rental|space|hire/i.test(item.description) || item.category === 'Hall Hire')
    .reduce((sum, item) => sum + (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0), 0)
  
  const rentalBase = rentalItemsSubtotal > 0 ? rentalItemsSubtotal : subtotal
  const rentalDepositPortion = Math.round(rentalBase * 0.5 * (1 + taxRate) * 100) / 100
  const depositAmount = Math.min(total, rentalDepositPortion)
  const remainingBalance = Math.max(0, Math.round((total - depositAmount) * 100) / 100)

  return {
    depositType: 'solidify_date' as const,
    depositAmount,
    rentalDepositPortion,
    remainingBalance,
    total,
    description: '50% booking deposit (separate refundable security deposit collected with the initial booking payment)',
  }
}

export function ensureRefundableSecurityDepositLineItem(lineItems: LuxorInvoiceLineItem[], securityDepositAmount = LUXOR_REFUNDABLE_SECURITY_DEPOSIT_AMOUNT): LuxorInvoiceLineItem[] {
  const existingIndex = lineItems.findIndex(
    (item) => /refundable security deposit/i.test(item.description) || item.category === 'Security Deposit',
  )

  const itemsCopy = [...lineItems]

  if (existingIndex >= 0) {
    itemsCopy[existingIndex] = {
      ...itemsCopy[existingIndex],
      quantity: 1,
      unitPrice: securityDepositAmount,
      total: securityDepositAmount,
      description: 'Refundable Security Deposit (Due with Initial Booking Payment After Signed Agreement)',
      category: 'Security Deposit',
    }
  } else {
    itemsCopy.push({
      description: 'Refundable Security Deposit (Due with Initial Booking Payment After Signed Agreement)',
      quantity: 1,
      unitPrice: securityDepositAmount,
      total: securityDepositAmount,
      category: 'Security Deposit',
    })
  }

  return itemsCopy
}
