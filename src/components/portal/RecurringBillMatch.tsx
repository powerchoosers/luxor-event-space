'use client'

import { useEffect, useState } from 'react'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

type Occurrence = { id: string; updated_at: string; recurring_template_id: string | null; source_bill_id: string | null; matched_expense_id?: string | null; description: string | null; due_date: string | null; billing_period_start: string | null; billing_period_end: string | null; amount: number; status: string; paid_amount: number | null; metadata: Record<string, unknown> | null; payments: unknown[] }

export default function RecurringBillMatch({ bill }: { bill: LuxorBill }) {
  const [choices, setChoices] = useState<Occurrence[]>([])
  const [selection, setSelection] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [billExpense, setBillExpense] = useState<Occurrence | null>(null)
  const [matched, setMatched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    let live = true
    async function load() {
      try {
        const response = await fetch('/api/expenses/management', { cache: 'no-store' })
        if (!response.ok) throw new Error('Recurring schedules are unavailable.')
        const data = await response.json() as { expenses: Occurrence[]; templates: LuxorExpenseTemplate[] }
        if (!Array.isArray(data.expenses) || !Array.isArray(data.templates)) throw new Error('Recurring schedules could not be verified.')
        const source = data.expenses.filter((item) => item.source_bill_id === bill.id)
        if (source.length > 1) throw new Error('Multiple expenses are linked to this bill. Review them before matching.')
        if (live) { setBillExpense(source[0] || null); setMatched(Boolean(source[0] && (source[0].recurring_template_id || data.expenses.some((item) => item.matched_expense_id === source[0].id)))) }
        const ids = new Set(data.templates.filter((item) => item.vendor_id === bill.vendor_id).map((item) => item.id))
        if (live) setChoices(data.expenses.filter((item) => item.recurring_template_id && ids.has(item.recurring_template_id) && !item.source_bill_id && item.status !== 'cancelled' && item.status !== 'paid' && (item.paid_amount === 0 || (item.paid_amount === null && Number(item.amount) === 0 && item.metadata?.amount_state === 'variable' && !Object.hasOwn(item.metadata, 'legacy_paid_amount'))) && Array.isArray(item.payments) && item.payments.length === 0))
      } catch (error) { if (live) setMessage(error instanceof Error ? error.message : 'Recurring schedules are unavailable.') }
      finally { if (live) setLoading(false) }
    }
    void load()
    return () => { live = false }
  }, [bill.id, bill.vendor_id])

  async function match() {
    const occurrence = choices.find((item) => item.id === selection)
    if (!occurrence) return
    setBusy(true); setMessage('')
    try {
      const response = billExpense
        ? await fetch('/api/expenses/reconcile-bill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bill_id: bill.id, expense_id: billExpense.id, occurrence_id: occurrence.id, expense_updated_at: billExpense.updated_at, occurrence_updated_at: occurrence.updated_at, confirmed: true }) })
        : await fetch(`/api/expenses/${encodeURIComponent(occurrence.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_bill_id: bill.id, confirm_source_bill: true, expected_updated_at: occurrence.updated_at, amount: Number(bill.amount), due_date: bill.due_date }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The match could not be saved.')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The match could not be confirmed. Refresh before retrying.') }
    finally { setBusy(false) }
  }
  const selected = choices.find((item) => item.id === selection)
  return <section className="space-y-2"><h4 className="text-xs font-semibold text-[color:var(--portal-text)]">Match a recurring charge</h4><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{billExpense ? 'Match an expected period to this bill’s existing expense. Its payments and documents remain there.' : 'Choose the expected period for this bill. The actual amount replaces its estimate; this does not record a payment.'}</p>{loading ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading expected periods…</p> : message && !choices.length ? null : matched ? <p className="text-xs text-[color:var(--portal-muted)]">This bill is already matched to an expected period.</p> : choices.length ? <><PortalSelect value={selection} onChange={(value) => { setSelection(value); setConfirming(false) }} options={[{ value: '', label: 'Choose an expected period' }, ...choices.map((item) => ({ value: item.id, label: `${item.description || 'Recurring charge'} · due ${item.due_date || 'date unknown'} · period ${item.billing_period_start || 'unknown'} to ${item.billing_period_end || 'unknown'}` }))]} buttonClassName="min-h-10 w-full" />{confirming && selected ? <div className="space-y-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3"><p className="text-xs leading-5 text-[color:var(--portal-text)]">Match {bill.provider} · {Number(bill.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} to {selected.description || 'the recurring charge'} due {selected.due_date || 'date unknown'}?</p><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{billExpense ? 'The expected period leaves active totals. The existing expense, payments, and documents remain in place.' : 'The bill amount replaces the expected amount. No payment is recorded.'}</p><div className="flex gap-2"><PortalButton disabled={busy} onClick={() => setConfirming(false)}>Cancel</PortalButton><PortalButton variant="primary" disabled={busy} onClick={() => void match()}>{busy ? 'Matching…' : 'Confirm match'}</PortalButton></div></div> : <PortalButton className="w-full" disabled={!selection || busy} onClick={() => setConfirming(true)}>Review match</PortalButton>}</> : <p className="text-xs text-[color:var(--portal-muted)]">No unmatched, unpaid periods are available for this provider.</p>}{message ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{message}</p> : null}</section>
}
