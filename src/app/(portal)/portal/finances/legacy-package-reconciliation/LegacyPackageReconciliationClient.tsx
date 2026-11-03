'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

type Result = {
  success?: boolean
  changed?: boolean
  auditId?: string
  reminderQueueReady?: boolean
  queuedReminderCount?: number
  sentReminderCount?: number
  error?: string
}

const APPROVED_BOOKING_ID = '614f6326-5c9a-46de-ae73-cb8d857fc2f8'

export default function LegacyPackageReconciliationClient() {
  const [bookingId] = useState(APPROVED_BOOKING_ID)
  const [confirmation, setConfirmation] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [saving, setSaving] = useState(false)

  const reconcile = async () => {
    if (saving || confirmation !== 'RECONCILE' || !bookingId.trim()) return
    setSaving(true)
    setResult(null)
    try {
      const response = await fetch('/api/portal/financial-reconciliation/legacy-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingId.trim(), confirmCorrection: true }),
      })
      const body = await response.json() as Result
      setResult(body)
    } catch {
      setResult({ error: 'The reconciliation request could not be completed. Check the saved audit before retrying.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalPageFrame>
      <PortalPageHeader
        icon={<CheckCircle2 size={20} />}
        title="Approved invoice reconciliation"
        description="Owner-only correction for the accepted Luxor package record."
        actions={(
          <Link href="/portal/finances" className="inline-flex items-center gap-2 rounded-xl border border-[var(--portal-border)] px-3 py-2 text-sm text-[var(--portal-text)] transition hover:bg-[var(--portal-surface-elevated)]">
            <ArrowLeft size={14} /> Back to finances
          </Link>
        )}
      />

      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--portal-border)] bg-[var(--portal-surface-elevated)] p-5 text-[var(--portal-text)] sm:p-7">
        <h2 className="font-serif text-xl">This action records one approved correction batch</h2>
        <p className="mt-2 text-sm leading-6 opacity-75">
          It validates the accepted proposal and signed schedule before changing anything. It corrects the unsent final-balance draft to $3,256.28, withdraws the older unaccepted offer while retaining its history, restores the four signed installment dates, and updates the eight queued reminders in the same transaction without sending them.
        </p>

        <dl className="mt-5 grid gap-3 border-y border-[var(--portal-border)] py-4 text-sm sm:grid-cols-2">
          <div><dt className="opacity-60">Accepted Luxor services</dt><dd className="mt-1 font-semibold">$3,756.28</dd></div>
          <div><dt className="opacity-60">Booking payment already received</dt><dd className="mt-1 font-semibold">$500.00 · received Oct 31</dd></div>
          <div><dt className="opacity-60">Corrected draft balance</dt><dd className="mt-1 font-semibold">$3,256.28 · remains a draft</dd></div>
          <div><dt className="opacity-60">Separate refundable security deposit</dt><dd className="mt-1 font-semibold">$750.00 · unchanged</dd></div>
          <div className="sm:col-span-2"><dt className="opacity-60">Installments 2–5</dt><dd className="mt-1 font-semibold">Nov 30 · Dec 31 · Jan 31 · Feb 28 · final payment remains Mar 30</dd></div>
        </dl>

        <label className="mt-5 block text-sm font-medium" htmlFor="booking-id">Booking ID</label>
        <input
          id="booking-id"
          value={bookingId}
          readOnly
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full rounded-xl border border-[var(--portal-border)] bg-transparent px-3 py-2.5 font-mono text-sm text-[var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
        />

        <label className="mt-5 block text-sm font-medium" htmlFor="confirm-word">Type RECONCILE to confirm this exact batch</label>
        <input
          id="confirm-word"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
          autoComplete="off"
          className="mt-2 w-full max-w-xs rounded-xl border border-[var(--portal-border)] bg-transparent px-3 py-2.5 text-sm uppercase tracking-[0.18em] text-[var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PortalButton variant="primary" onClick={() => void reconcile()} disabled={saving || confirmation !== 'RECONCILE' || !bookingId.trim()}>
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Reconciling…' : 'Apply approved reconciliation'}
          </PortalButton>
          <p className="text-xs leading-5 opacity-60">The action is idempotent and writes an actor-attributed before/after audit. No customer message is sent.</p>
        </div>

        {result?.error && (
          <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}
        {result?.success && (
          <div role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Reconciliation saved and verified.</p>
            <p className="mt-2">Audit record: <code className="font-mono">{result.auditId}</code></p>
            <p className="mt-1">{result.queuedReminderCount} reminders are queued; {result.sentReminderCount} were sent.</p>
          </div>
        )}
        {result && !result.success && result.reminderQueueReady === false && result.auditId && (
          <div role="alert" className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
            Financial changes are saved under audit record <code className="font-mono">{result.auditId}</code>. The reminder queue needs a retry; no reminder was sent.
          </div>
        )}
      </section>
    </PortalPageFrame>
  )
}
