'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleNotch, WarningCircle } from '@phosphor-icons/react'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import {
  clearManualInstallmentDraft,
  loadManualInstallmentDraft,
  normalizeLuxorDraftActor,
  sameManualInstallmentPaymentDetails,
  saveManualInstallmentDraft,
  type ManualInstallmentPaymentDetails,
  type ManualInstallmentPaymentRequest,
} from '@/lib/luxorManualInstallmentDraft'

export type LogPaymentBookingOption = { id: string; label: string }
export type LogPaymentScheduleOption = {
  id: string
  bookingId: string
  label: string
  remainingAmount: number | null
  dueDate: string | null
  eligible: boolean
  reviewReason?: string | null
}

function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function sessionStorageSafely() {
  try { return window.sessionStorage } catch { return null }
}

const inputClass = 'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15 disabled:opacity-60'
const methods = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Zelle', label: 'Zelle' },
  { value: 'Check', label: 'Check' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'ACH', label: 'ACH' },
  { value: 'Other', label: 'Other' },
]

export function LogInstallmentPaymentDialog({
  open,
  onClose,
  bookings,
  schedules,
  initialBookingId,
  initialInstallmentId,
  actorEmail,
  onRecorded,
}: {
  open: boolean
  onClose: () => void
  bookings: LogPaymentBookingOption[]
  schedules: LogPaymentScheduleOption[]
  initialBookingId?: string | null
  initialInstallmentId?: string | null
  actorEmail: string | null
  onRecorded: () => void
}) {
  const [bookingId, setBookingId] = useState(initialBookingId || '')
  const [installmentId, setInstallmentId] = useState(initialInstallmentId || '')
  const [amountText, setAmountText] = useState('')
  const [paidOn, setPaidOn] = useState(chicagoToday)
  const [paymentMethod, setPaymentMethod] = useState<ManualInstallmentPaymentRequest['paymentMethod']>('Zelle')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [knownRejected, setKnownRejected] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [allowSameKeyRetry, setAllowSameKeyRetry] = useState(true)
  const [requestReady, setRequestReady] = useState(false)
  const [persistenceAvailable, setPersistenceAvailable] = useState(true)
  const requestRef = useRef<ManualInstallmentPaymentRequest | null>(null)
  const normalizedActorEmail = normalizeLuxorDraftActor(actorEmail)
  const availableSchedules = useMemo(() => schedules.filter((row) => row.bookingId === bookingId && row.eligible), [schedules, bookingId])
  const selectedSchedule = availableSchedules.find((row) => row.id === installmentId) || null
  const amount = Number(amountText)
  const today = chicagoToday()
  const details: ManualInstallmentPaymentDetails = {
    bookingId,
    installmentId,
    amount: Math.round(amount * 100) / 100,
    paidOn,
    paymentMethod,
    ...(reference.trim() ? { reference: reference.trim() } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  }
  const sameRejectedEntry = Boolean(requestRef.current && sameManualInstallmentPaymentDetails(requestRef.current, details))
  const canSubmit = Boolean(requestReady && bookingId && installmentId && paidOn && paidOn <= today && Number.isFinite(amount) && amount > 0 && selectedSchedule?.remainingAmount != null && amount <= selectedSchedule.remainingAmount && (paymentMethod !== 'Other' || notes.trim()) && !(knownRejected && sameRejectedEntry && !allowSameKeyRetry) && !pending && !success)
  const locked = Boolean(requestRef.current && !knownRejected)

  useEffect(() => {
    requestRef.current = null
    setRequestReady(false)
    setBookingId(initialBookingId || '')
    setInstallmentId(initialInstallmentId || '')
    setAmountText('')
    setPaidOn(chicagoToday())
    setPaymentMethod('Zelle')
    setReference('')
    setNotes('')
    setPending(false)
    setError(null)
    setSuccess(null)
    setKnownRejected(false)
    setUncertain(false)
    setAllowSameKeyRetry(true)

    const restored = loadManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail)
    setPersistenceAvailable(restored.storageAvailable)
    if (restored.request) {
      requestRef.current = restored.request
      setBookingId(restored.request.bookingId)
      setInstallmentId(restored.request.installmentId)
      setAmountText(String(restored.request.amount))
      setPaidOn(restored.request.paidOn)
      setPaymentMethod(restored.request.paymentMethod)
      setReference(restored.request.reference || '')
      setNotes(restored.request.notes || '')
      setAllowSameKeyRetry(restored.retryAllowed)
      setUncertain(true)
      setError(restored.retryAllowed
        ? 'A previous payment save is still unconfirmed. Retry this same entry to check its status.'
        : 'This payment needs reconciliation before it can be retried. Its details and request key are saved for the same Luxor account.')
    }
    setRequestReady(true)
  }, [normalizedActorEmail])

  useEffect(() => {
    if (!open || requestRef.current || success) return
    setBookingId(initialBookingId || '')
    setInstallmentId(initialInstallmentId || '')
  }, [open, initialBookingId, initialInstallmentId, success])

  const resetEntry = () => {
    if (requestRef.current) {
      setPersistenceAvailable(clearManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail, requestRef.current.idempotencyKey))
    }
    requestRef.current = null
    setBookingId(initialBookingId || '')
    setInstallmentId(initialInstallmentId || '')
    setAmountText('')
    setPaidOn(chicagoToday())
    setPaymentMethod('Zelle')
    setReference('')
    setNotes('')
    setPending(false)
    setError(null)
    setSuccess(null)
    setKnownRejected(false)
    setUncertain(false)
    setAllowSameKeyRetry(true)
  }

  const close = () => {
    if (pending || !requestReady) return
    if (!requestRef.current || knownRejected || success) resetEntry()
    onClose()
  }

  const submit = async () => {
    if (pending || !requestReady || (locked && !allowSameKeyRetry)) return
    if (!locked) {
      if (!canSubmit) return
      const previousRequest = requestRef.current
      const sameEntry = previousRequest && sameManualInstallmentPaymentDetails(previousRequest, details)
      requestRef.current = {
        ...details,
        idempotencyKey: sameEntry && allowSameKeyRetry ? previousRequest.idempotencyKey : crypto.randomUUID(),
      }
      setPersistenceAvailable(saveManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail, requestRef.current))
      setKnownRejected(false)
      setUncertain(false)
    }
    if (!requestRef.current) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/payments/manual-installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestRef.current),
      })
      const result = await response.json().catch(() => null) as { payment?: { id?: string }; replayed?: boolean; error?: string; paymentOutcome?: 'not_recorded' | 'unknown'; retryWithSameIdempotencyKey?: boolean } | null
      if (!response.ok) {
        const message = result?.error || 'The payment could not be confirmed.'
        if (result?.paymentOutcome === 'not_recorded') {
          setPersistenceAvailable(clearManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail, requestRef.current.idempotencyKey))
          setKnownRejected(true)
          setUncertain(false)
          setAllowSameKeyRetry(result.retryWithSameIdempotencyKey === true)
          setError(`${message} No payment was recorded. Correct the details and save again, or cancel this entry.`)
        } else {
          const retryAllowed = result?.retryWithSameIdempotencyKey !== false
          setAllowSameKeyRetry(retryAllowed)
          if (requestRef.current) {
            setPersistenceAvailable(saveManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail, requestRef.current, retryAllowed))
          }
          setKnownRejected(false)
          setUncertain(true)
          setError(retryAllowed
            ? `${message} The save result is uncertain. Retry this same entry or close it and return later.`
            : `${message} The save result is uncertain. Luxor marked this request unsafe to retry automatically. Reconcile it before recording another payment.`)
        }
        return
      }
      if (!result?.payment?.id) {
        setUncertain(true)
        setError('The response did not confirm a payment. The save result is uncertain. Retry this same entry or close it and return later.')
        return
      }
      setPersistenceAvailable(clearManualInstallmentDraft(sessionStorageSafely(), normalizedActorEmail, requestRef.current.idempotencyKey))
      setSuccess(result.replayed ? 'This payment was already recorded. The existing receipt has been confirmed.' : 'Payment recorded.')
      setUncertain(false)
      onRecorded()
    } catch (cause) {
      setUncertain(true)
      setError(`${cause instanceof Error ? cause.message : 'The payment could not be confirmed.'} The save result is uncertain. Retry this same entry or close it and return later.`)
    } finally {
      setPending(false)
    }
  }

  const selectedBooking = bookings.find((row) => row.id === bookingId)
  const amountDescription = selectedSchedule?.remainingAmount == null
    ? 'The remaining installment amount needs review before payment can be recorded.'
    : `Up to ${selectedSchedule.remainingAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} remains on this scheduled payment.`

  return <PortalModal isOpen={open} onClose={close} title="Log payment" description="Record a payment already received for a scheduled installment." maxWidth="max-w-xl" fullScreenOnCompact animateClose>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      {success ? <div role="status" className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-[color:var(--portal-text)]"><Check size={17} weight="regular" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" /><p>{success}</p></div> : null}
      {!bookings.length ? <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-4 text-sm text-[color:var(--portal-muted)]">No bookings are currently available for manual installment payment.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Client and booking
          <PortalSelect aria-label="Client and booking" value={bookingId} onChange={(next) => { setBookingId(next); setInstallmentId('') }} disabled={!requestReady || locked || pending || Boolean(success)} options={bookings.map((row) => ({ value: row.id, label: row.label }))} placeholder="Choose a booking" className="mt-1" />
        </label>
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Payment schedule item
          <PortalSelect aria-label="Payment schedule item" value={installmentId} onChange={setInstallmentId} disabled={!requestReady || locked || pending || Boolean(success) || !bookingId} options={availableSchedules.map((row) => ({ value: row.id, label: row.dueDate ? `${row.label} · due ${row.dueDate}` : row.label }))} placeholder={bookingId ? 'Choose an eligible item' : 'Choose a booking first'} className="mt-1" />
        </label>
      </div>
      {selectedBooking && !availableSchedules.length ? <p className="text-xs text-[color:var(--portal-muted)]">No eligible event installment is available for this booking. Deposit and refundable security deposit records use separate workflows.</p> : null}
      {selectedSchedule?.reviewReason ? <p role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-[color:var(--portal-text)]">{selectedSchedule.reviewReason}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Amount received
          <input className={`${inputClass} mt-1 tabular-nums`} type="number" min="0.01" max={selectedSchedule?.remainingAmount ?? undefined} step="0.01" inputMode="decimal" value={amountText} disabled={!requestReady || locked || pending || Boolean(success)} onChange={(event) => setAmountText(event.target.value)} placeholder="0.00" />
          <span className="mt-1 block font-normal">{amountDescription}</span>
        </label>
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Date received
          <div className="mt-1">{locked || success || !requestReady ? <span className="inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)]">{paidOn}</span> : <PortalDatePicker value={paidOn} onChange={setPaidOn} timeZone="America/Chicago" placeholder="Select receipt date" />}</div>
          <span className="mt-1 block font-normal">Use the actual date Luxor received the funds.</span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Payment method
          <PortalSelect aria-label="Payment method" value={paymentMethod} onChange={(value) => setPaymentMethod(value as ManualInstallmentPaymentRequest['paymentMethod'])} disabled={!requestReady || locked || pending || Boolean(success)} options={methods} className="mt-1" />
        </label>
        <label className="min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">Reference <span className="font-normal">(optional)</span>
          <input className={`${inputClass} mt-1`} type="text" maxLength={200} value={reference} disabled={!requestReady || locked || pending || Boolean(success)} onChange={(event) => setReference(event.target.value)} placeholder="Receipt or transfer reference" />
        </label>
      </div>
      <label className="block text-xs font-medium text-[color:var(--portal-muted)]">Internal note <span className="font-normal">{paymentMethod === 'Other' ? '(required for Other)' : '(optional)'}</span>
        <textarea className={`${inputClass} mt-1 min-h-20 resize-y`} maxLength={1000} value={notes} disabled={!requestReady || locked || pending || Boolean(success)} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for the Luxor team" />
        {paymentMethod === 'Other' ? <span className="mt-1 block font-normal">Describe the payment method to record an Other payment.</span> : null}
      </label>
      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-[color:var(--portal-text)]"><WarningCircle size={18} weight="regular" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" /><div><p>{error}</p>{uncertain ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{!allowSameKeyRetry ? persistenceAvailable ? 'The request details and key remain saved for this Luxor account in this tab. Do not retry or enter a new payment until the existing request is reconciled.' : 'Do not retry or enter a new payment. This browser could not retain the request locally; keep this window open while the existing request is reconciled.' : persistenceAvailable ? 'The entered details and key are saved in this Luxor account’s tab. Retrying uses the same key. You can close this dialog and return later while this tab stays open.' : 'Retrying uses the same key. This browser could not retain the request locally, so keep this window open until the result is confirmed.'}</p> : knownRejected ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">A new request key is created only if you change the rejected entry before saving again.</p> : null}</div></div> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
        {!success ? <PortalButton onClick={close} disabled={!requestReady || pending}>{locked ? 'Close for now' : 'Cancel'}</PortalButton> : null}
        {success ? <PortalButton variant="primary" onClick={() => { resetEntry(); onClose() }}>Done</PortalButton> : <PortalButton variant="primary" type="submit" disabled={!requestReady || pending || (locked ? !allowSameKeyRetry : !canSubmit)}>{pending ? <><CircleNotch size={16} weight="regular" className="animate-spin" /> Saving…</> : locked ? allowSameKeyRetry ? 'Retry same payment' : 'Reconciliation required' : 'Save payment'}</PortalButton>}
      </div>
    </form>
  </PortalModal>
}

