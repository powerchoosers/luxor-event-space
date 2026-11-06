import 'server-only'
import { isDeepStrictEqual } from 'node:util'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'

type AllocationResult = {
  status: 'allocated' | 'unapplied' | 'review'
  reason?: string
  payment_id?: string
  unapplied_amount: number | null
  replayed?: boolean
  allocations?: unknown[]
}

// This marker is saved with the receipt, before the allocation call. It makes
// a failed RPC retryable without selecting arbitrary historical receipts.
export function pendingExistingPaymentAllocation(invoiceKind: string | null | undefined) {
  return process.env.LUXOR_PAYMENT_AUTO_ALLOCATION_READY === 'true' && ['event', 'deposit', 'final_balance'].includes(invoiceKind || '')
    ? { installment_allocation_status: 'pending' }
    : {}
}

export function existingPaymentAllocationPending(payment: LuxorPayment) {
  return payment.metadata?.installment_allocation_status === 'pending' || payment.metadata?.installment_allocation_status === 'review'
}

function allocationBase(metadata: Record<string, unknown>) {
  const base = { ...metadata }
  delete base.installment_allocations
  delete base.installment_unapplied_amount
  delete base.installment_auto_allocation_version
  return base
}

async function saveAllocationStatus(payment: LuxorPayment, result: AllocationResult) {
  const paymentId = payment.id
  const evaluatedMetadata = payment.metadata || {}
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [current] = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(paymentId)}&limit=1`)
    if (!current || current.status !== 'paid' || current.booking_id !== payment.booking_id
      || current.invoice_id !== payment.invoice_id || current.inquiry_id !== payment.inquiry_id
      || Number(current.amount) !== Number(payment.amount) || current.paid_at !== payment.paid_at) {
      throw new Error('The paid receipt changed before allocation status could be saved.')
    }
    const metadata = current.metadata || {}
    // Review returns do not mutate the receipt. A success changes only the
    // allocator-owned fields. Reject a result based on an older state, even
    // when the latest JSONB could otherwise be patched successfully.
    const sameState = result.status === 'review'
      ? isDeepStrictEqual(metadata, evaluatedMetadata)
      : isDeepStrictEqual(allocationBase(metadata), allocationBase(evaluatedMetadata))
        && Number(metadata.installment_auto_allocation_version) === 1
        && isDeepStrictEqual(metadata.installment_allocations, result.allocations)
        && metadata.installment_unapplied_amount != null
        && Number(metadata.installment_unapplied_amount) === Number(result.unapplied_amount)
    if (!sameState) throw new Error('The payment changed after allocation was evaluated. Retry reconciliation.')
    const identityFilter = (name: string, value: string | null) => value === null ? `${name}=is.null` : `${name}=eq.${encodeURIComponent(value)}`
    const identity = [identityFilter('booking_id', current.booking_id), identityFilter('invoice_id', current.invoice_id),
      identityFilter('inquiry_id', current.inquiry_id), identityFilter('paid_at', current.paid_at), `amount=eq.${encodeURIComponent(String(current.amount))}`].join('&')
    const [saved] = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?id=eq.${encodeURIComponent(paymentId)}&status=eq.paid&${identity}&metadata=eq.${encodeURIComponent(JSON.stringify(metadata))}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: {
        ...metadata,
        installment_allocation_status: result.status,
        installment_allocation_review_reason: result.status === 'review' ? result.reason || 'allocation_review_required' : null,
        ...(result.status === 'review' ? { installment_allocation_review_unapplied_amount: result.unapplied_amount } : { installment_allocation_review_unapplied_amount: null }),
      } }),
    })
    if (saved) return
  }
  throw new Error('The receipt changed while saving allocation status. Retry reconciliation.')
}

async function ensureAllocationNote(payment: LuxorPayment, detail: string) {
  // Unmatched receipts have no lead activity stream. Their review state stays
  // on the payment, where finance source checks can identify the missing link.
  if (!payment.inquiry_id) return
  const note = `Payment ${payment.id} was received but its installment allocation needs owner review (${detail}). Do not record another payment.`
  const notes = await listNotesByInquiry(payment.inquiry_id)
  if (!notes.some((item) => item.content === note)) await createNote(payment.inquiry_id, note, 'note', 'Payment allocation')
}

export async function allocateExistingPayment(payment: LuxorPayment, expected: { bookingId: string; invoiceId: string }) {
  if (process.env.LUXOR_PAYMENT_AUTO_ALLOCATION_READY !== 'true') throw new Error('Payment allocation is disabled; the receipt remains pending for reconciliation.')
  if (!existingPaymentAllocationPending(payment)) throw new Error('This receipt is not marked for automatic allocation.')
  if (!payment.id || payment.status !== 'paid' || payment.booking_id !== expected.bookingId || payment.invoice_id !== expected.invoiceId) {
    throw new Error('The saved receipt does not match the expected booking and invoice.')
  }
  let result: AllocationResult
  try {
    result = await supabaseRestStrict<AllocationResult>('rpc/luxor_allocate_existing_payment', {
    method: 'POST', body: JSON.stringify({ p_payment_id: payment.id }),
    })
  } catch (cause) {
    await ensureAllocationNote(payment, 'allocation attempt failed; retry pending')
    throw new Error('Payment saved; installment allocation is pending. Retry this same payment workflow; do not record another payment.', { cause })
  }
  if (!result || !['allocated', 'unapplied', 'review'].includes(result.status)
    || (result.payment_id && result.payment_id !== payment.id)
    || (result.unapplied_amount !== null && (!Number.isFinite(Number(result.unapplied_amount)) || Number(result.unapplied_amount) < 0))
    || (result.status === 'allocated' && (result.unapplied_amount === null || Number(result.unapplied_amount) !== 0))
    || (result.status === 'unapplied' && (result.unapplied_amount === null || Number(result.unapplied_amount) <= 0))) {
    throw new Error('The allocator returned an invalid result. Retry reconciliation.')
  }
  if (result.status === 'review' && result.reason === 'earlier_unassigned_receipt') {
    await ensureAllocationNote(payment, 'an earlier payment must be reconciled first; retry pending')
    throw new Error('Payment saved; an earlier payment must be reconciled before allocation. Retry this workflow without recording another payment.')
  }
  if (result.status === 'review' || result.status === 'unapplied') {
    const detail = result.status === 'review' ? result.reason || 'allocation_review_required' : `unapplied amount: ${Number(result.unapplied_amount).toFixed(2)}`
    await ensureAllocationNote(payment, detail)
  }
  await saveAllocationStatus(payment, result)
  return result
}

/** Continue only receipts marked by this feature, in stable receipt order. */
export async function drainPendingPaymentAllocations(bookingId: string) {
  if (process.env.LUXOR_PAYMENT_AUTO_ALLOCATION_READY !== 'true') throw new Error('Payment allocation is disabled; pending receipts are preserved.')
  const pending = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&status=eq.paid&metadata->>installment_allocation_status=eq.pending&order=paid_at.asc,id.asc&limit=101`)
  for (const receipt of pending.slice(0, 100)) {
    if (!receipt.invoice_id) throw new Error('A pending payment has no invoice; owner review is required.')
    await allocateExistingPayment(receipt, { bookingId, invoiceId: receipt.invoice_id })
  }
  if (pending.length > 100) throw new Error('Further pending payment allocations remain; retry reconciliation.')
}

async function deferPendingReceipt(id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [current] = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!current || current.status !== 'paid' || current.metadata?.installment_allocation_status !== 'pending') return
    const [saved] = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?id=eq.${encodeURIComponent(id)}&status=eq.paid&metadata=eq.${encodeURIComponent(JSON.stringify(current.metadata))}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: { ...current.metadata, installment_allocation_attempted_at: new Date().toISOString() } }),
    })
    if (saved) return
  }
  throw new Error('Could not defer the pending receipt after concurrent changes.')
}

/** Independent, bounded recovery; no unmarked historical receipt is selected. */
export async function processPendingPaymentAllocations(limit = 10) {
  if (process.env.LUXOR_PAYMENT_AUTO_ALLOCATION_READY !== 'true') throw new Error('Payment allocation is disabled; pending receipts are preserved.')
  const bounded = Math.min(20, Math.max(1, Math.floor(limit)))
  // Failed rows move behind never-attempted and older-attempted rows, so a
  // permanently failing receipt cannot starve the rest of the queue.
  const pending = await supabaseRestStrict<LuxorPayment[]>(`luxor_payments?select=*&status=eq.paid&metadata->>installment_allocation_status=eq.pending&order=metadata->>installment_allocation_attempted_at.asc.nullsfirst,id.asc&limit=${bounded}`)
  let completed = 0
  let review = 0
  let failed = 0
  for (const payment of pending) {
    try {
      if (!payment.booking_id || !payment.invoice_id) {
        await ensureAllocationNote(payment, 'booking or invoice link is missing')
        await saveAllocationStatus(payment, { status: 'review', reason: 'missing_receipt_link', unapplied_amount: null })
        review += 1
        continue
      }
      const result = await allocateExistingPayment(payment, { bookingId: payment.booking_id, invoiceId: payment.invoice_id })
      if (result.status === 'allocated') completed += 1
      else review += 1
    } catch {
      failed += 1
      // If even this fails, propagate so the worker cannot report success.
      await deferPendingReceipt(payment.id)
    }
  }
  return { attempted: pending.length, completed, review, failed }
}
