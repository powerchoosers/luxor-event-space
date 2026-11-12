'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BillReview } from '@/components/portal/BillsPayableLedger'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect, PortalTabTransition, PortalSkeleton } from '@/components/portal/PortalUI'
import { getBillBalance, type BillExpense } from '@/lib/luxorBillBalances'
import { isLuxorBillCategory, LUXOR_BILL_CATEGORIES } from '@/lib/luxorBillCategories'
import type { LuxorBill, LuxorVendor } from '@/lib/luxorInquiryTypes'

type Records = { bills: LuxorBill[]; vendors: LuxorVendor[]; expenses: BillExpense[] | null }

/** The same bill review journey can be opened from schedules or company records. */
export default function BillDetailsPanel({ billId, onClose, onOpenExpense, onCreateExpense, onBillChanged, refreshKey = 0, initialBill }: {
  billId: string
  refreshKey?: number
  onClose: () => void
  onOpenExpense?: (id: string) => void
  onCreateExpense?: (billId: string) => void
  onBillChanged?: (bill: LuxorBill) => void
  initialBill?: LuxorBill | null
}) {
  const [records, setRecords] = useState<Records | null>(() => initialBill ? { bills: [initialBill], vendors: [], expenses: null } : null)
  const [open, setOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  const [activeId, setActiveId] = useState(billId)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [companyChoice, setCompanyChoice] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [draft, setDraft] = useState<LuxorBill | null>(null)
  const [amount, setAmount] = useState('')
  useEffect(() => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); setActiveId(billId); setDraft(null); setMessage(null); setCompanyChoice(''); setCompanyName('') }, [billId])
  useEffect(() => {
    let current = true
    setError('')
    Promise.all([fetch('/api/portal/bill-center', { cache: 'no-store' }), fetch('/api/expenses', { cache: 'no-store' }).catch(() => null)]).then(async ([center, expensesResponse]) => {
      if (!center.ok) throw new Error('Bill details could not be loaded.')
      const result = await center.json()
      if (!Array.isArray(result.bills) || !Array.isArray(result.vendors)) throw new Error('Bill details could not be verified.')
      let expenses: BillExpense[] | null = null
      if (expensesResponse?.ok && expensesResponse.headers.get('X-Luxor-Expense-History') !== 'legacy-only') {
        const payload = await expensesResponse.json()
        if (Array.isArray(payload)) expenses = payload
      }
      if (current) setRecords({ bills: result.bills, vendors: result.vendors, expenses })
    }).catch(() => { if (current) setError('Bill details could not be loaded. Please try again.') })
    return () => { current = false }
  }, [billId, retry, refreshKey])
  const bill = records?.bills.find((item) => item.id === activeId)
  const updateBill = useCallback((updated: LuxorBill) => {
    setRecords((current) => current ? { ...current, bills: current.bills.map((item) => item.id === updated.id ? updated : item) } : current)
    onBillChanged?.(updated)
  }, [onBillChanged])
  const updateVendor = (updated: LuxorVendor) => setRecords((current) => current ? { ...current, vendors: current.vendors.some((item) => item.id === updated.id) ? current.vendors.map((item) => item.id === updated.id ? { ...item, ...updated } : item) : [...current.vendors, updated] } : current)
  async function review(action: 'approve' | 'flag' | 'mark_paid' | 'confirm_distinct') {
    if (!bill || busy) return
    setBusy(action); setMessage(null)
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(bill.id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedUpdatedAt: bill.updated_at }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bill review failed.')
      updateBill(result); setMessage(action === 'approve' ? 'Approved and ready for payment.' : action === 'confirm_distinct' ? 'Marked as a separate bill. Review the details before approval.' : 'Bill updated.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Bill review failed.') }
    finally { setBusy(null) }
  }
  async function linkCompany(create: boolean) {
    if (!bill || busy) return
    setBusy('company'); setMessage(null)
    try {
      const paid = bill.status === 'paid'
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(bill.id)}/${paid ? 'paid-provider' : 'company'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(create ? { name: companyName } : { vendorId: companyChoice }), expectedUpdatedAt: bill.updated_at, ...(paid ? { confirmed: true } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Company could not be saved.')
      updateBill(result.bill); updateVendor(result.vendor); setCompanyChoice(''); setCompanyName(''); setMessage('Company confirmed.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Company could not be saved.') }
    finally { setBusy(null) }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    if (draft.amount_state === 'known' && (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0)) { setMessage('Enter an amount, or choose unknown or variable.'); return }
    setBusy('edit'); setMessage(null)
    try {
      const response = await fetch('/api/operations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bill', id: draft.id, expectedUpdatedAt: draft.updated_at, service: draft.service, provider: draft.provider, frequency: draft.frequency, due_date: draft.due_date || null, status: draft.status, bill_category: draft.bill_category || null, amount_state: draft.amount_state, ...(draft.amount_state === 'known' ? { amount: Number(amount) } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bill could not be saved.')
      updateBill(result); setDraft(null); setMessage('Bill details saved.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Bill could not be saved.') }
    finally { setBusy(null) }
  }
  function back() {
    if (busy) return
    if (draft) { setDraft(null); setMessage(null) }
    else if (activeId !== billId) { setActiveId(billId); setMessage(null); setCompanyChoice(''); setCompanyName('') }
    else {
      setOpen(false)
      closeTimer.current = setTimeout(onClose, 380)
    }
  }
  const field = 'mt-1 min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/10'
  return <PortalModal isOpen={open} onClose={back} title={draft ? 'Edit bill details' : 'Bill details'} description={bill?.service} headerBack sidePanel maxWidth="max-w-[600px]" animateClose>
    {error ? <div role="alert" className="space-y-3 text-sm text-[color:var(--portal-text)]"><p>{error}</p><PortalButton onClick={() => setRetry((value) => value + 1)}>Try again</PortalButton></div> : !records ? (
      <div className="space-y-6 pt-1" aria-busy="true" aria-label="Loading bill details">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PortalSkeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <PortalSkeleton className="h-4 w-32 rounded" />
              <PortalSkeleton className="h-3 w-24 rounded opacity-60" />
            </div>
          </div>
          <PortalSkeleton className="h-6 w-16 rounded-md" />
        </div>
        <PortalSkeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <PortalSkeleton className="h-10 w-full rounded-lg" />
          <PortalSkeleton className="h-10 w-full rounded-lg" />
          <PortalSkeleton className="h-10 w-full rounded-lg" />
          <PortalSkeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    ) : !bill ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">This bill is no longer available.</p> : <PortalTabTransition activeKey={draft ? 'edit' : activeId}>
      {draft ? <form onSubmit={(event) => void save(event)} className="space-y-4">
        <label className="block text-sm text-[color:var(--portal-text)]">Bill title<input required value={draft.service || ''} onChange={(event) => setDraft({ ...draft, service: event.target.value })} className={field} /></label>
        <label className="block text-sm text-[color:var(--portal-text)]">Company<input required value={draft.provider || ''} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} className={field} /></label>
        <div className="text-sm text-[color:var(--portal-text)]">Category<PortalSelect aria-label="Bill category" value={draft.bill_category || ''} onChange={(value) => setDraft({ ...draft, bill_category: isLuxorBillCategory(value) ? value : null })} options={[{ value: '', label: 'Choose category' }, ...LUXOR_BILL_CATEGORIES.map((value) => ({ value, label: value }))]} buttonClassName="mt-1 min-h-11 w-full" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="text-sm text-[color:var(--portal-text)]">Amount type<PortalSelect aria-label="Amount type" value={draft.amount_state || 'legacy'} onChange={(value) => setDraft({ ...draft, amount_state: value === 'legacy' ? null : value as 'known' | 'unknown' | 'variable' })} options={[{ value: 'legacy', label: 'Unconfirmed' }, { value: 'known', label: 'Known amount' }, { value: 'unknown', label: 'Unknown amount' }, { value: 'variable', label: 'Variable amount' }]} buttonClassName="mt-1 min-h-11 w-full" /></div><label className="block text-sm text-[color:var(--portal-text)]">Amount ({bill.currency || 'USD'})<input disabled={draft.amount_state !== 'known'} type="number" min="0" step="0.01" value={draft.amount_state === 'known' ? amount : ''} onChange={(event) => setAmount(event.target.value)} className={`${field} tabular-nums disabled:opacity-50`} /></label></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="text-sm text-[color:var(--portal-text)]">Frequency<PortalSelect aria-label="Frequency" value={draft.frequency || 'One-time'} onChange={(value) => setDraft({ ...draft, frequency: value })} options={Array.from(new Set(['One-time', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually', draft.frequency].filter(Boolean))).map((value) => ({ value, label: value }))} buttonClassName="mt-1 min-h-11 w-full" /></div><div className="text-sm text-[color:var(--portal-text)]">Due date<PortalDatePicker value={draft.due_date?.slice(0, 10) || ''} onChange={(value) => setDraft({ ...draft, due_date: value })} className="mt-1" /></div></div>
        {message ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{message}</p> : null}
        <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4"><PortalButton type="button" disabled={Boolean(busy)} onClick={back}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={Boolean(busy)}>{busy ? 'Saving…' : 'Save details'}</PortalButton></div>
      </form> : <BillReview key={bill.id} bill={bill} balance={getBillBalance(bill, records.expenses)} busy={busy} message={message} onClose={back} onReview={(action) => void review(action)} onBillChanged={updateBill} onEdit={() => { setDraft({ ...bill }); setAmount(String(bill.amount ?? '')); setMessage(null) }} vendors={records.vendors} companyChoice={companyChoice} setCompanyChoice={setCompanyChoice} companyName={companyName} setCompanyName={setCompanyName} onLinkCompany={(create) => void linkCompany(create)} onVendorChanged={updateVendor} onOpenExpense={onOpenExpense} onCreateExpense={onCreateExpense} onOpenBill={(id) => { if (!records.bills.some((item) => item.id === id)) { setRecords(null); setRetry((value) => value + 1) } setActiveId(id); setMessage(null); setCompanyChoice(''); setCompanyName('') }} />}
    </PortalTabTransition>}
  </PortalModal>
}
