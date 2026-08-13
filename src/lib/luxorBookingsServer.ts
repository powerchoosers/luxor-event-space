import 'server-only'

import { LuxorBooking, LuxorBookingStatus, LuxorContractStatus, LuxorPayment, LuxorBookingExpense } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

export type LuxorBookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

export async function listLuxorBookings(limit = 1000) {
  return supabaseRest<LuxorBooking[]>(
    `luxor_bookings?select=*&order=event_date.asc,created_at.desc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function listLuxorBookingsByInquiry(inquiryId: string) {
  return supabaseRest<LuxorBooking[]>(
    `luxor_bookings?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=event_date.asc,created_at.desc`,
  )
}

export async function getLuxorBooking(id: string) {
  const [booking] = await supabaseRest<LuxorBooking[]>(
    `luxor_bookings?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )

  return booking ?? null
}

export async function getLuxorBookingByInvoice(invoiceId: string) {
  const [booking] = await supabaseRest<LuxorBooking[]>(
    `luxor_bookings?select=*&invoice_id=eq.${encodeURIComponent(invoiceId)}&limit=1`,
  )

  return booking ?? null
}

export async function findLuxorBookingConflicts(eventDate: string, excludeId?: string) {
  const filters = [
    'select=id,client_name,event_date,start_time,end_time,status',
    `event_date=eq.${encodeURIComponent(eventDate)}`,
    'status=in.(tentative,confirmed)',
  ]
  if (excludeId) filters.push(`id=neq.${encodeURIComponent(excludeId)}`)
  return supabaseRest<LuxorBooking[]>(`luxor_bookings?${filters.join('&')}&limit=10`)
}

export async function listLuxorPaymentsByBooking(bookingId: string) {
  return supabaseRest<LuxorPayment[]>(
    `luxor_payments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc`,
  )
}

export async function listLuxorBookingsWithPayments(limit = 1000): Promise<LuxorBookingWithPayments[]> {
  const bookings = await listLuxorBookings(limit)
  if (bookings.length === 0) return []

  const ids = bookings.map((booking) => booking.id).join(',')
  const payments = await supabaseRest<LuxorPayment[]>(
    `luxor_payments?select=*&booking_id=in.(${ids})&order=created_at.desc`,
  ).catch(() => [])

  return bookings.map((booking) => {
    const bookingPayments = payments.filter((payment) => payment.booking_id === booking.id)
    const paidTotal = bookingPayments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const contractTotal = Number(booking.contract_total || 0)

    return {
      ...booking,
      payments: bookingPayments,
      paid_total: paidTotal,
      balance_due: Math.max(contractTotal - paidTotal, 0),
    }
  })
}

type LuxorBookingCreateInput = Partial<LuxorBooking> & { client_name: string }

function luxorBookingInsertPayload(data: LuxorBookingCreateInput) {
  return {
    inquiry_id: data.inquiry_id || null,
    invoice_id: data.invoice_id || null,
    lead_event_id: data.lead_event_id || null,
    client_name: data.client_name,
    email: data.email || null,
    phone: data.phone || null,
    event_type: data.event_type || null,
    event_date: data.event_date || null,
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    guest_count: data.guest_count ?? null,
    package_name: data.package_name || null,
    status: data.status || 'tentative',
    booked_at: data.booked_at || new Date().toISOString(),
    contract_total: data.contract_total || 0,
    deposit_required: data.deposit_required || 0,
    security_deposit_amount: data.security_deposit_amount ?? 750,
    final_payment_due_date: data.final_payment_due_date || null,
    contract_status: data.contract_status || 'not_sent',
    security_deposit_status: data.security_deposit_status || 'not_collected',
    notes: data.notes || null,
    metadata: data.metadata || {},
  }
}

export async function createLuxorBooking(data: LuxorBookingCreateInput) {
  const [created] = await supabaseRest<LuxorBooking[]>('luxor_bookings?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(luxorBookingInsertPayload(data)),
  })

  return created
}

/**
 * Claims the booking linked to a published proposal in one database operation.
 * The unique invoice_id constraint means a replay or parallel browser tab gets
 * the original booking instead of inserting another reservation.
 */
export async function createOrGetLuxorBookingForInvoice(data: LuxorBookingCreateInput & { invoice_id: string }) {
  try {
    const [created] = await supabaseRest<LuxorBooking[]>(
      'luxor_bookings?on_conflict=invoice_id&select=*',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(luxorBookingInsertPayload(data)),
      },
    )
    if (created) return { booking: created, created: true }
  } catch (error) {
    // A concurrent writer may have committed between the INSERT and the REST
    // response. Reuse its booking when the unique constraint reports a clash.
    const existing = await getLuxorBookingByInvoice(data.invoice_id).catch(() => null)
    if (existing) return { booking: existing, created: false }
    throw error
  }

  const existing = await getLuxorBookingByInvoice(data.invoice_id)
  if (existing) return { booking: existing, created: false }
  throw new Error('The proposal booking is being created. Please retry the acceptance request.')
}

export async function updateLuxorBooking(
  id: string,
  updates: Partial<LuxorBooking> & { status?: LuxorBookingStatus; contract_status?: LuxorContractStatus },
) {
  const [updated] = await supabaseRest<LuxorBooking[]>(`luxor_bookings?select=*&id=eq.${encodeURIComponent(id)}`, {
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
 * Move a sent agreement to its first-viewed state without ever overwriting a
 * signed agreement if the client opens and signs in adjacent requests.
 */
export async function markLuxorBookingContractViewed(id: string, viewedAt = new Date().toISOString()) {
  const [updated] = await supabaseRest<LuxorBooking[]>(
    `luxor_bookings?select=*&id=eq.${encodeURIComponent(id)}&contract_status=in.(sent,not_sent)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        contract_status: 'viewed',
        updated_at: viewedAt,
      }),
    },
  )

  return updated ?? null
}

export async function listAllPayments() {
  return supabaseRest<LuxorPayment[]>('luxor_payments?select=*')
}

export async function listAllExpenses() {
  return supabaseRest<LuxorBookingExpense[]>('luxor_booking_expenses?select=*')
}
