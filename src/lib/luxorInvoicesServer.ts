import 'server-only'

import { LuxorInvoice, LuxorInvoiceKind, LuxorInvoiceLineItem, LuxorInvoiceStatus, LuxorBill, LuxorPayment } from './luxorInquiryTypes'

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
  due_date?: string | null
  inquiry_id?: string | null
  notes?: string | null
  booking_id?: string | null
  parent_invoice_id?: string | null
  invoice_kind?: LuxorInvoiceKind
  status?: LuxorInvoiceStatus
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
      due_date: data.due_date || null,
      inquiry_id: data.inquiry_id || null,
      notes: data.notes || null,
      booking_id: data.booking_id || null,
      parent_invoice_id: data.parent_invoice_id || null,
      invoice_kind: data.invoice_kind || 'event',
      status: data.status || 'draft',
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

export const LUXOR_REFUNDABLE_SECURITY_DEPOSIT_AMOUNT = 750
export const LUXOR_NON_REFUNDABLE_DEPOSIT_RATE = 0.3

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

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
  return {
    depositAmount,
    refundableSecurityDeposit,
    finalBalance: Math.max(0, roundMoney(Number(invoice.total || 0) - depositAmount)),
  }
}

export function luxorFinalPaymentDueDate(eventDate: string | null | undefined) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
  const date = new Date(`${eventDate}T12:00:00-06:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() - 60)
  return date.toISOString().slice(0, 10)
}

export async function ensureLuxorDepositInvoice(input: {
  masterInvoice: LuxorInvoice
  bookingId: string
  dueDate?: string | null
}) {
  const existing = await getInvoiceByBookingAndKind(input.bookingId, 'deposit')
  const { depositAmount } = calculateLuxorThirtyPercentDeposit(input.masterInvoice)
  if (depositAmount < 0.5) throw new Error('The event total is too low to create a 30% deposit invoice.')
  if (existing) {
    if (existing.status === 'paid') return existing
    return await updateInvoice(existing.id, {
      line_items: [{ description: '30% Non-Refundable Booking Deposit', quantity: 1, unitPrice: depositAmount, total: depositAmount, category: 'Booking Deposit' }],
      subtotal: depositAmount,
      tax_rate: 0,
      total: depositAmount,
      due_date: input.dueDate || new Date().toISOString().slice(0, 10),
      notes: 'Non-refundable deposit required to reserve the event date. The reservation is confirmed after both payment and contract signature.',
    }) || existing
  }
  return createInvoice({
    inquiry_id: input.masterInvoice.inquiry_id,
    booking_id: input.bookingId,
    parent_invoice_id: input.masterInvoice.id,
    invoice_kind: 'deposit',
    client_name: input.masterInvoice.client_name,
    event_type: input.masterInvoice.event_type,
    description: '30% non-refundable booking deposit',
    line_items: [{ description: '30% Non-Refundable Booking Deposit', quantity: 1, unitPrice: depositAmount, total: depositAmount, category: 'Booking Deposit' }],
    subtotal: depositAmount,
    tax_rate: 0,
    total: depositAmount,
    due_date: input.dueDate || new Date().toISOString().slice(0, 10),
    notes: 'Non-refundable deposit required to reserve the event date. The reservation is confirmed after both payment and contract signature.',
  })
}

export async function ensureLuxorFinalBalanceInvoice(input: {
  masterInvoice: LuxorInvoice
  bookingId: string
  dueDate: string | null
  depositPaid?: number
}) {
  const existing = await getInvoiceByBookingAndKind(input.bookingId, 'final_balance')
  const { depositAmount: defaultDepositAmount, refundableSecurityDeposit } = calculateLuxorThirtyPercentDeposit(input.masterInvoice)
  // Older proposals may not have the security line yet.  The final invoice is
  // the safe place to collect it whenever the event was not paid in full.
  const securityDepositAmount = refundableSecurityDeposit || LUXOR_REFUNDABLE_SECURITY_DEPOSIT_AMOUNT
  const eventTotal = Math.max(0, roundMoney(Number(input.masterInvoice.total || 0) - refundableSecurityDeposit))
  const depositAmount = Math.min(eventTotal, Math.max(0, roundMoney(input.depositPaid ?? defaultDepositAmount)))
  const remainingEventBalance = Math.max(0, roundMoney(eventTotal - depositAmount))
  const finalBalance = roundMoney(remainingEventBalance + securityDepositAmount)
  const lineItems: LuxorInvoiceLineItem[] = [
    { description: 'Remaining Event Balance After Booking Payment', quantity: 1, unitPrice: remainingEventBalance, total: remainingEventBalance, category: 'Final Balance' },
    { description: 'Refundable Security Deposit', quantity: 1, unitPrice: securityDepositAmount, total: securityDepositAmount, category: 'Security Deposit' },
  ]
  if (existing) {
    if (existing.status === 'paid') return existing
    return await updateInvoice(existing.id, {
      line_items: lineItems,
      subtotal: finalBalance,
      tax_rate: 0,
      total: finalBalance,
      due_date: input.dueDate,
      notes: `Final payment after the ${depositAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} booking payment. Includes the refundable security deposit and is due 60 days before the event.`,
    }) || existing
  }
  return createInvoice({
    inquiry_id: input.masterInvoice.inquiry_id,
    booking_id: input.bookingId,
    parent_invoice_id: input.masterInvoice.id,
    invoice_kind: 'final_balance',
    client_name: input.masterInvoice.client_name,
    event_type: input.masterInvoice.event_type,
    description: 'Final event balance due 60 days before the event',
    line_items: lineItems,
    subtotal: finalBalance,
    tax_rate: 0,
    total: finalBalance,
    due_date: input.dueDate,
    notes: `Final payment after the ${depositAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} booking payment. Includes the refundable security deposit and is due 60 days before the event.`,
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
      description: 'Non-refundable booking deposit (balance due 60 days before event)',
    }
  }

  // The 50% option is still a booking payment. The refundable security deposit
  // stays on the final invoice so it can be refunded cleanly after the event.
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
    description: '50% booking deposit (refundable security deposit due with final payment)',
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
      description: 'Refundable Security Deposit (Due 60 Days Prior to Event)',
      category: 'Security Deposit',
    }
  } else {
    itemsCopy.push({
      description: 'Refundable Security Deposit (Due 60 Days Prior to Event)',
      quantity: 1,
      unitPrice: securityDepositAmount,
      total: securityDepositAmount,
      category: 'Security Deposit',
    })
  }

  return itemsCopy
}
