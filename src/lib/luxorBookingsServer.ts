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

export async function createLuxorBooking(data: Partial<LuxorBooking> & { client_name: string }) {
  const [created] = await supabaseRest<LuxorBooking[]>('luxor_bookings?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: data.inquiry_id || null,
      invoice_id: data.invoice_id || null,
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
      final_payment_due_date: data.final_payment_due_date || null,
      contract_status: data.contract_status || 'not_sent',
      security_deposit_status: data.security_deposit_status || 'not_collected',
      notes: data.notes || null,
      metadata: data.metadata || {},
    }),
  })

  return created
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

export async function listAllPayments() {
  return supabaseRest<LuxorPayment[]>('luxor_payments?select=*')
}

export async function listAllExpenses() {
  return supabaseRest<LuxorBookingExpense[]>('luxor_booking_expenses?select=*')
}
