import { isLuxorTestAvailabilityBooking } from './luxorAvailability'
import type { LuxorBooking, LuxorInvoice } from './luxorInquiryTypes'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorTestLeadPolicy'

export type LuxorFinanceExpense = {
  booking_id: string | null
  metadata?: Record<string, unknown> | null
}

/** Exclude only explicitly verified test records from finance dashboard metrics. */
export function getLuxorBusinessFinanceRows<TBooking extends LuxorBooking & { id: string }, TExpense extends LuxorFinanceExpense>(input: {
  invoices: LuxorInvoice[]
  bookings: TBooking[]
  expenses: TExpense[]
  testInquiryIds: ReadonlySet<string>
  testBookingIds: ReadonlySet<string>
}) {
  const inquiryIds = new Set([...input.testInquiryIds].map((id) => id.toLowerCase()))
  const bookingIds = new Set([...input.testBookingIds].map((id) => id.toLowerCase()))
  for (const booking of input.bookings) {
    if (isLuxorTestAvailabilityBooking(booking) || Boolean(booking.inquiry_id && inquiryIds.has(booking.inquiry_id.toLowerCase()))) {
      bookingIds.add(booking.id.toLowerCase())
    }
  }

  const bookings = input.bookings.filter((booking) => !bookingIds.has(booking.id.toLowerCase()))
  const invoices = input.invoices.filter((invoice) => !(invoice.inquiry_id && inquiryIds.has(invoice.inquiry_id.toLowerCase()))
    && invoice.inquiry_id?.toLowerCase() !== LUXOR_PERMANENT_TEST_LEAD_ID.toLowerCase()
    && !(invoice.booking_id && bookingIds.has(invoice.booking_id.toLowerCase()))
    && (invoice.proposal_context as Record<string, unknown> | null | undefined)?.is_test_record !== true)
  const expenses = input.expenses.filter((expense) => !(expense.booking_id && bookingIds.has(expense.booking_id.toLowerCase()))
    && expense.metadata?.is_test_record !== true)

  return { invoices, bookings, expenses }
}
