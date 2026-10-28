import 'server-only'

import type { LuxorAvailabilityBooking } from './luxorAvailability'
import { supabaseRestStrict } from './supabaseRestServer'

/** A provider-paid receipt awaiting review must still protect its rental period. */
export async function annotateLuxorReviewAvailability<T extends LuxorAvailabilityBooking>(bookings: T[]) {
  const ids = [...new Set(bookings.map((booking) => booking.id).filter((id): id is string => Boolean(id)))]
  const reviewIds = new Set<string>()
  const depositedIds = new Set<string>()
  for (let index = 0; index < ids.length; index += 100) {
    const filter = ids.slice(index, index + 100).map(encodeURIComponent).join(',')
    const rows = await supabaseRestStrict<Array<{ booking_id: string }>>(
      `luxor_payments?select=booking_id&booking_id=in.(${filter})&status=eq.pending&metadata->>deposit_receipt_review=eq.true&metadata->>provider_payment_status=eq.paid`,
    )
    for (const row of rows) if (row.booking_id) reviewIds.add(row.booking_id)
    const invoices = await supabaseRestStrict<Array<{ id: string; booking_id: string; total: number }>>(
      `luxor_invoices?select=id,booking_id,total&booking_id=in.(${filter})&invoice_kind=eq.deposit`,
    )
    if (invoices.length) {
      const invoiceFilter = invoices.map((invoice) => encodeURIComponent(invoice.id)).join(',')
      const oldPending = await supabaseRestStrict<Array<{ invoice_id: string; booking_id: string }>>(
        `luxor_payments?select=invoice_id,booking_id&invoice_id=in.(${invoiceFilter})&status=eq.pending&metadata->>same_day_payment=eq.true&metadata->>receipt_received=eq.true`,
      )
      for (const payment of oldPending) {
        if (invoices.some((invoice) => invoice.id === payment.invoice_id && invoice.booking_id === payment.booking_id)) reviewIds.add(payment.booking_id)
      }
      const payments = await supabaseRestStrict<Array<{ invoice_id: string; booking_id: string; amount: number; metadata: Record<string, unknown> | null }>>(
        `luxor_payments?select=invoice_id,booking_id,amount,metadata&invoice_id=in.(${invoiceFilter})&status=eq.paid`,
      )
      for (const invoice of invoices) {
        const related = payments.filter((payment) => payment.invoice_id === invoice.id && payment.booking_id === invoice.booking_id)
        if (related.some((payment) => !Number.isFinite(Number(payment.amount)))) {
          throw new Error('Deposit payment records could not be verified for availability.')
        }
        if (related.some((payment) => Number(payment.amount) > 0)) depositedIds.add(invoice.booking_id)
      }
    }
  }
  return bookings.map((booking) => ({ ...booking, availability_payment_review: Boolean(booking.id && reviewIds.has(booking.id)),
    availability_deposit_paid: Boolean(booking.id && depositedIds.has(booking.id)) }))
}
