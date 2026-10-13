import 'server-only'

import type { LuxorBooking, LuxorInvoice } from './luxorInquiryTypes'
import { luxorBookingInsertPayload } from './luxorBookingsServer'
import { supabaseRest } from './supabaseRestServer'

export class LuxorWeekdayRentalError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
    this.name = 'LuxorWeekdayRentalError'
  }
}

/** Admission remains closed until the approved policy and database guard are deployed. */
export function assertLuxorWeekdayRentalAdmission() {
  if (process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED !== 'true' ||
      process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY !== 'true') {
    throw new LuxorWeekdayRentalError('Weekday custom rentals are awaiting approved scheduling rules and booking protection. Existing rental options remain available.')
  }
}

export function weekdayRentalDatabaseError(error: unknown): LuxorWeekdayRentalError | null {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('LUXOR_WEEKDAY_CONFLICT:')) {
    return new LuxorWeekdayRentalError('That rental conflicts with an active booking or its required cleanup time. Contact Luxor to choose another available time.')
  }
  if (message.startsWith('LUXOR_WEEKDAY_')) {
    return new LuxorWeekdayRentalError('The saved weekday rental terms require administrator review before this proposal can be accepted.')
  }
  return null
}

/**
 * A custom proposal claims its booking and first acceptance audit in one
 * transaction. A retry returns the existing locked records; it never creates
 * another booking or changes the original acceptance timestamp/IP/browser.
 */
export async function claimLuxorWeekdayProposalAcceptance(
  invoice: LuxorInvoice,
  bookingPayload: Partial<LuxorBooking> & { client_name: string; invoice_id: string },
  input: { acceptedAt?: string; ip?: string | null; userAgent?: string | null } = {},
): Promise<LuxorInvoice> {
  if (!invoice.proposal_context?.weekday_custom_rental) {
    throw new LuxorWeekdayRentalError('A saved custom weekday rental is required for this acceptance path.')
  }
  if (!invoice.proposal_accepted_at || !invoice.booking_id) {
    assertLuxorWeekdayRentalAdmission()
    const snapshot = invoice.proposal_context.weekday_custom_rental as Record<string, unknown>
    if (snapshot.version !== 2 && snapshot.version !== 3) {
      throw new LuxorWeekdayRentalError('This custom weekday offer requires its matching database booking guard before it can be accepted.')
    }
    if (process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_V3_BOOKING_GUARD_READY !== 'true' &&
        (invoice.proposal_context.weekday_custom_rental as Record<string, unknown>).version === 3) {
      throw new LuxorWeekdayRentalError('This custom weekday offer requires its matching database booking guard before it can be accepted.')
    }
    if (snapshot.booking_policy === 'multiple_per_date') {
      throw new LuxorWeekdayRentalError('Multiple weekday events require approved cleanup-buffer rules and agreement wording before booking can open.')
    }
    if (snapshot.selection_surface !== 'portal_only') {
      throw new LuxorWeekdayRentalError('Public weekday time selection requires owner approval before booking can open. Use the owner portal proposal builder.')
    }
  }
  if (bookingPayload.invoice_id !== invoice.id || bookingPayload.inquiry_id !== invoice.inquiry_id) {
    throw new LuxorWeekdayRentalError('The weekday rental booking must belong to this proposal and client.')
  }
  try {
    const accepted = await supabaseRest<LuxorInvoice>('rpc/luxor_claim_weekday_proposal_acceptance', {
      method: 'POST',
      body: JSON.stringify({
        p_invoice_id: invoice.id,
        p_booking: luxorBookingInsertPayload(bookingPayload),
        p_accepted_at: input.acceptedAt || new Date().toISOString(),
        p_ip: input.ip?.slice(0, 128) || null,
        p_user_agent: input.userAgent?.slice(0, 1_000) || null,
      }),
    })
    if (!accepted?.proposal_accepted_at || !accepted.booking_id || accepted.id !== invoice.id) {
      throw new LuxorWeekdayRentalError('The weekday rental acceptance could not be verified. Please retry or contact Luxor.')
    }
    return accepted
  } catch (error) {
    if (error instanceof LuxorWeekdayRentalError) throw error
    const mapped = weekdayRentalDatabaseError(error)
    if (mapped) throw mapped
    const message = error instanceof Error ? error.message : ''
    if (/luxor_claim_weekday_proposal_acceptance|schema cache|PGRST202/i.test(message)) {
      throw new LuxorWeekdayRentalError('Weekday booking protection is not available yet. Luxor must complete the reviewed database deployment before this proposal can be accepted.')
    }
    throw new LuxorWeekdayRentalError('We could not safely complete the weekday rental acceptance. Please retry or contact Luxor.', 503)
  }
}
