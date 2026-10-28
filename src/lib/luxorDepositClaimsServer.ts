import 'server-only'

import crypto from 'node:crypto'
import type { LuxorBooking, LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'
import { supabaseRestStrict } from './supabaseRestServer'

type DepositClaim = { id: string; invoice_id: string; state: 'starting' | 'open' | 'uncertain' | 'paid' | 'released'; session_id?: string;
  invoice_total?: number; paid_before?: number; master_invoice_id?: string; event_date?: string; start_time?: string; end_time?: string;
  provider_account?: string; livemode?: boolean; currency?: string }

function parseClaim(value: unknown): DepositClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const claim = value as Partial<DepositClaim>
  if (typeof claim.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(claim.id) ||
      typeof claim.invoice_id !== 'string' || !['starting', 'open', 'uncertain', 'paid', 'released'].includes(String(claim.state)) ||
      (claim.session_id !== undefined && typeof claim.session_id !== 'string')) return null
  return claim as DepositClaim
}

export async function acquireDepositCheckoutClaim(booking: LuxorBooking, invoice: LuxorInvoice,
  provider: { account: string; livemode: boolean; currency: 'usd' }) {
  const [current] = await supabaseRestStrict<Array<Pick<LuxorBooking, 'metadata'>>>(
    `luxor_bookings?id=eq.${encodeURIComponent(booking.id)}&select=metadata&limit=1`,
  )
  if (!current) throw new Error('The booking could not be verified.')
  const raw = current.metadata?.deposit_checkout_claim
  const existing = parseClaim(raw)
  if (raw && !existing) throw new Error('Payment needs reconciliation before another checkout can be opened.')
  if (existing && existing.state !== 'released') {
    if (existing.invoice_id !== invoice.id || existing.state !== 'open' || !existing.session_id ||
        existing.provider_account !== provider.account || existing.livemode !== provider.livemode || existing.currency !== provider.currency) {
      throw new Error('A payment is processing or needs reconciliation. Do not retry the payment.')
    }
    return { claim: existing, created: false }
  }
  if (invoice.stripe_checkout_session_id && (existing?.state !== 'released' || existing.session_id !== invoice.stripe_checkout_session_id)) {
    throw new Error('An older payment link needs reconciliation before a new checkout can be opened.')
  }
  const id = crypto.randomUUID()
  const claimed = parseClaim(await supabaseRestStrict<unknown>('rpc/luxor_claim_deposit_checkout', {
    method: 'POST', body: JSON.stringify({ p_booking_id: booking.id, p_deposit_invoice_id: invoice.id, p_attempt_id: id,
      p_provider_account: provider.account, p_livemode: provider.livemode, p_currency: provider.currency }),
  }))
  if (!claimed || claimed.id !== id || claimed.invoice_id !== invoice.id || claimed.state !== 'starting' ||
      claimed.provider_account !== provider.account || claimed.livemode !== provider.livemode || claimed.currency !== provider.currency) {
    throw new Error('The payment reservation could not be verified.')
  }
  return { claim: claimed, created: true }
}

/** Call only after fetching and verifying the provider's terminal session. */
export async function releaseExpiredDepositClaim(bookingId: string, claimId: string, sessionId: string,
  provider: { account: string; livemode: boolean; currency: 'usd' }) {
  const claim = parseClaim(await supabaseRestStrict<unknown>('rpc/luxor_release_deposit_checkout', {
    method: 'POST', body: JSON.stringify({ p_booking_id: bookingId, p_attempt_id: claimId, p_session_id: sessionId,
      p_status: 'expired', p_payment_status: 'unpaid', p_async_pending: false, p_verified_at: new Date().toISOString(),
      p_provider_account: provider.account, p_livemode: provider.livemode, p_currency: provider.currency }),
  }))
  if (!claim || claim.id !== claimId || claim.state !== 'released' || claim.session_id !== sessionId) {
    throw new Error('The expired payment reservation could not be reconciled.')
  }
}

export async function updateDepositCheckoutClaim(bookingId: string, claimId: string, state: 'open' | 'uncertain', sessionId?: string) {
  const claim = parseClaim(await supabaseRestStrict<unknown>('rpc/luxor_update_deposit_checkout', {
    method: 'POST', body: JSON.stringify({ p_booking_id: bookingId, p_attempt_id: claimId, p_state: state, p_session_id: sessionId || null }),
  }))
  if (!claim || claim.id !== claimId || claim.state !== state || (sessionId && claim.session_id !== sessionId)) {
    throw new Error('The payment reservation could not be verified.')
  }
  return claim
}

export async function assertNoPendingProviderPaidReview(bookingId: string) {
  const rows = await supabaseRestStrict<Array<{ id: string }>>(
    `luxor_payments?select=id&booking_id=eq.${encodeURIComponent(bookingId)}&status=eq.pending&metadata->>deposit_receipt_review=eq.true&metadata->>provider_payment_status=eq.paid&limit=1`,
  )
  if (rows.length) throw new Error('A received payment needs review before another checkout can be opened.')
  const older = await supabaseRestStrict<Array<{ invoice_id: string }>>(
    `luxor_payments?select=invoice_id&booking_id=eq.${encodeURIComponent(bookingId)}&status=eq.pending&metadata->>same_day_payment=eq.true&metadata->>receipt_received=eq.true`,
  )
  const invoiceIds = [...new Set(older.map((row) => row.invoice_id).filter(Boolean))]
  if (invoiceIds.length) {
    const deposits = await supabaseRestStrict<Array<{ id: string }>>(
      `luxor_invoices?select=id&booking_id=eq.${encodeURIComponent(bookingId)}&invoice_kind=eq.deposit&id=in.(${invoiceIds.map(encodeURIComponent).join(',')})&limit=1`,
    )
    if (deposits.length) throw new Error('A received payment needs review before another checkout can be opened.')
  }
}

export async function recordClaimedDeposit(input: {
  bookingId: string; invoiceId: string; claimId: string; amount: number; processor: 'stripe' | 'manual'
  reference: string; paidAt: string; method: string; metadata: Record<string, unknown>
}) {
  const result = await supabaseRestStrict<{ payment?: LuxorPayment; claim?: unknown; review?: boolean; replay?: boolean; invoice_applied?: boolean; booking_terminal?: boolean; reason?: string }>('rpc/luxor_record_claimed_deposit', {
    method: 'POST', body: JSON.stringify({ p_booking_id: input.bookingId, p_attempt_id: input.claimId,
      p_invoice_id: input.invoiceId, p_amount: input.amount, p_processor: input.processor, p_reference: input.reference,
      p_paid_at: input.paidAt, p_method: input.method, p_metadata: input.metadata }),
  })
  const claim = parseClaim(result?.claim)
  if (!result?.payment || claim?.id !== input.claimId || (!result.review && claim.state !== 'paid')) throw new Error('The deposit receipt needs reconciliation.')
  return { payment: result.payment, review: result.review === true, replay: result.replay === true, invoiceApplied: result.invoice_applied === true, bookingTerminal: result.booking_terminal === true, reason: result.reason || null }
}

export async function recordUnmatchedDepositReview(input: {
  bookingId: string; invoiceId: string; amount: number; reference: string; eventId: string
  paidAt: string; metadata: Record<string, unknown>
}) {
  const result = await supabaseRestStrict<{ payment?: LuxorPayment; review?: boolean; identity_conflict?: boolean; in_flight_session?: string | null }>(
    'rpc/luxor_record_unmatched_deposit_review', {
      method: 'POST', body: JSON.stringify({ p_booking_id: input.bookingId, p_invoice_id: input.invoiceId,
        p_amount: input.amount, p_processor: 'stripe', p_reference: input.reference, p_event_id: input.eventId,
        p_paid_at: input.paidAt, p_method: 'stripe_checkout', p_metadata: input.metadata }),
    },
  )
  if (!result?.payment || result.review !== true) throw new Error('The unmatched deposit receipt could not be saved for review.')
  return result
}


export async function recordClaimedSameDayDeposit(input: {
  bookingId: string; invoiceId: string; claimId: string; amount: number; paidAt: string | null
  processor: 'stripe' | 'manual'; reference: string; method: string; eventId: string
  timingVerified: boolean; fingerprint: string; metadata: Record<string, unknown>
}) {
  const recorded = await supabaseRestStrict<{ review: boolean; replay?: boolean; payment?: LuxorPayment; same_day?: { payment?: LuxorPayment }; claimed?: { payment?: LuxorPayment; invoice_applied?: boolean; booking_terminal?: boolean }; reason?: string }>(
    'rpc/luxor_record_claimed_same_day_deposit', {
      method: 'POST', body: JSON.stringify({ p_invoice_id: input.invoiceId, p_booking_id: input.bookingId,
        p_attempt_id: input.claimId, p_amount: input.amount, p_paid_at: input.paidAt, p_processor: input.processor,
        p_reference: input.reference, p_method: input.method, p_event_id: input.eventId, p_timing_verified: input.timingVerified,
        p_fingerprint: input.fingerprint, p_metadata: input.metadata,
        p_booking_patch: { status: 'confirmed', metadata: { deposit_paid_at: input.paidAt, reservation_confirmed_at: input.paidAt, reservation_state: 'confirmed' } },
        p_inquiry_patch: { status: 'booked', pipeline_stage: 'planning' } }),
    },
  )
  const payment = recorded?.payment || recorded?.claimed?.payment || recorded?.same_day?.payment
  if (!recorded || (!recorded.review && !payment)) throw new Error('The same-day deposit needs reconciliation.')
  return { payment: payment || null, review: recorded.review, replay: recorded.replay === true, invoiceApplied: recorded.claimed?.invoice_applied === true, bookingTerminal: recorded.claimed?.booking_terminal === true, reason: recorded.reason || null }
}
