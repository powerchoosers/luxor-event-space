'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronRight } from '@/lib/icons/phosphor-compat'
import { PortalModal, PortalPagination, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { BillExpense } from '@/lib/luxorBillBalances'
import BillDetailsPanel from '@/components/portal/BillDetailsPanel'
import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'
import { createVendorRefreshFence } from '@/lib/luxorVendorRefreshFence'
import { getVendorBillHistory } from '@/lib/luxorVendorBillLinks'
import VendorBusinessDetails, { type VendorDetails } from '@/components/portal/VendorBusinessDetails'
import VendorDocuments from '@/components/portal/VendorDocuments'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'
import BillDocumentPreview from '@/components/portal/BillDocumentPreview'
import { groupUnlinkedRecurringBills } from '@/lib/luxorRecurringBillSuggestion'

type Receipt = { id: string; expense_id: string | null; file_name: string; title: string }
type BookingLabel = { id: string; client_name: string | null; event_type: string | null; event_date: string | null }
type ProfileData = { bills: LuxorBill[]; intakes: LuxorBillIntake[]; vendors: LuxorVendor[]; templates: LuxorExpenseTemplate[]; expenses: BillExpense[] | null; receipts: Receipt[]; bookings: BookingLabel[] | null }
function money(amount: number, code = 'USD') { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount) } catch { return `${amount.toFixed(2)} ${code}` } }
function date(value: string | null | undefined) {
  const day = value?.slice(0, 10) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Not set'
  const [year, month, dayNumber] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, dayNumber))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== dayNumber) return 'Not set'
  return day
}

export default function VendorBillsProfile({ vendorId, embedded = false, hideUnlinkedBills = false, onWebsiteSuggested }: { vendorId: string; embedded?: boolean; hideUnlinkedBills?: boolean; onWebsiteSuggested?: (vendorId: string, suggestion: { website: string; source: string } | null) => void }) {
  const [billPage, setBillPage] = useState(1)
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null)
  const [expenseId, setExpenseId] = useState<string | null>(null)
  const [importBillId, setImportBillId] = useState<string | null>(null)
  const [billRefresh, setBillRefresh] = useState(0)
  const [data, setData] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fence = useRef(createVendorRefreshFence())
  const refresh = useCallback(async () => {
    const generation = fence.current.begin()
    try {
      const [center, expenseResponse] = await Promise.all([fetch('/api/portal/bill-center', { cache: 'no-store' }), fetch('/api/expenses', { cache: 'no-store' })])
      if (!center.ok || !expenseResponse.ok) throw new Error('Operations and finance access are required to load this profile.')
      const [result, expenses] = await Promise.all([center.json(), expenseResponse.json()])
      if (![result.bills, result.billIntakes, result.vendors, result.templates, result.receipts, expenses].every(Array.isArray) || (result.bookings !== null && result.bookings !== undefined && !Array.isArray(result.bookings))) throw new Error('Vendor records could not be verified.')
      if (!fence.current.isCurrent(generation)) return
      setData({ bills: result.bills, intakes: result.billIntakes, vendors: result.vendors, templates: result.templates, receipts: result.receipts, bookings: Array.isArray(result.bookings) ? result.bookings : null, expenses: expenseResponse.headers.get('X-Luxor-Expense-History') === 'legacy-only' ? null : expenses }); setError(null)
    } catch (cause) { if (!fence.current.isCurrent(generation)) return; setData(null); setError(cause instanceof Error ? cause.message : 'Vendor records could not be loaded.') }
  }, [])
  useEffect(() => { void refresh(); window.addEventListener('focus', refresh); return () => { window.removeEventListener('focus', refresh); fence.current.invalidate() } }, [refresh])
  useEffect(() => {
    if (!data?.intakes.some((intake) => intake.status === 'received' || intake.status === 'processing')) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [data, refresh])
  const vendor = data?.vendors.find((item) => item.id === vendorId) as VendorDetails | undefined
  const { bills, intakes } = getVendorBillHistory(vendorId, data?.bills || [], data?.intakes || [])
  const updateBill = (bill: LuxorBill) => setData((current) => current ? { ...current, bills: current.bills.map((item) => item.id === bill.id ? bill : item) } : current)
  const vendorNameKey = vendor?.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  const possibleBills = vendorNameKey ? groupUnlinkedRecurringBills(data?.bills || [], [vendor?.name || '']).find((group) => group.key === `name:${vendorNameKey}`)?.bills || [] : []
  // Bill and expense responses are independent snapshots. Never derive balances
  // from their combination; show only an unambiguous link to the expense.
  const linked = bills.map((bill) => {
    const matches = (data?.expenses || []).filter((expense) => expense.source_bill_id === bill.id)
    return { bill, expense: matches.length === 1 ? matches[0] : null }
  })

  return <PortalPageFrame>
    {!embedded ? <><PortalPageHeader icon={<Building2 size={22} />} title={vendor?.name || 'Vendor profile'} description="Bills, payment history, and documents linked to this company." />
    <Link href="/portal/finances?view=bill-providers" className="w-fit text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">Back to providers</Link></> : null}
    {error ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error} <button onClick={() => void refresh()} className="font-semibold text-[#9a712e]">Try again</button></p> : !data ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading vendor records…</p> : !vendor ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">Vendor not found or no longer available.</p> : <>
      <section className="relative border-b border-[color:var(--portal-border)] pb-6">
        <div className="pr-12"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Company details</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{vendor.vendor_type || 'Provider'}</p></div><VendorBusinessDetails vendor={vendor} onWebsiteSuggested={onWebsiteSuggested} onSaved={(updated) => { if (updated.business_website || updated.name !== vendor.name || updated.vendor_type !== vendor.vendor_type) onWebsiteSuggested?.(vendor.id, null); fence.current.invalidate(); setData((current) => current ? { ...current, vendors: current.vendors.map((item) => item.id === updated.id ? updated : item) } : current); void refresh() }} >
        <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">{([['Contact', vendor.contact_person], ['Email', vendor.email], ['Phone', vendor.phone], ['Website', vendor.business_website], ['Mailing address', vendor.mailing_address], ['Category', vendor.vendor_category], ['Notes', vendor.internal_notes]] as Array<[string, string | null | undefined]>).filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium text-[color:var(--portal-text)]">{value}</dd></div>)}</dl>
        <div className="mt-5 border-t border-[color:var(--portal-border)] pt-4"><p className="text-xs font-medium tabular-nums text-[color:var(--portal-text)]">{bills.length} linked {bills.length === 1 ? 'bill' : 'bills'}</p><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Provider totals are unavailable. Open an expense to review its payment history.</p></div>
        </VendorBusinessDetails>
      </section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
        <div className="flex items-baseline justify-between gap-3"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Bills and payment history</h2><span className="text-xs tabular-nums text-[color:var(--portal-muted)]">{linked.length} {linked.length === 1 ? 'bill' : 'bills'}</span></div>
        {!linked.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No bills have been linked to this company.</p> : <>
          <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{linked.slice((Math.min(billPage, Math.ceil(linked.length / 5)) - 1) * 5, Math.min(billPage, Math.ceil(linked.length / 5)) * 5).map(({ bill }) => {
            const amount = bill.amount_state === 'known' && bill.amount != null && String(bill.amount).trim() !== '' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0 ? money(Number(bill.amount), bill.currency) : 'Amount unknown'
            const status = bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id ? 'Possible duplicate' : bill.status === 'paid' ? 'Marked paid' : bill.extraction_status === 'ready' && bill.reviewed_at ? 'Reviewed' : 'Needs review'
            return <button key={bill.id} type="button" onClick={() => setSelectedBillId(bill.id)} className="flex w-full items-center gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-[color:var(--portal-text)]">{bill.service || 'Bill'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">Due {date(bill.due_date)} · {status}{bill.archived_at ? ' · Archived' : ''}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{amount}</span><ChevronRight size={16} className="shrink-0 text-[color:var(--portal-muted)]" /></button>
          })}</div>
          <div className="flex justify-end"><PortalPagination currentPage={Math.min(billPage, Math.ceil(linked.length / 5))} totalPages={Math.ceil(linked.length / 5)} onPageChange={setBillPage} scrollToTop={false} /></div>
        </>}
      </section>
      {selectedBillId ? <BillDetailsPanel billId={selectedBillId} refreshKey={billRefresh} onClose={() => { setSelectedBillId(null); void refresh() }} onBillChanged={updateBill} onOpenExpense={setExpenseId} onCreateExpense={setImportBillId} /> : null}
      {importBillId ? <ExpenseManagement view="business" embedded panelOnly initialBillId={importBillId} onBack={() => { setImportBillId(null); setBillRefresh((value) => value + 1); void refresh() }} /> : null}
      <PortalModal isOpen={Boolean(expenseId)} onClose={() => { setExpenseId(null); setBillRefresh((value) => value + 1); void refresh() }} title="Expense & payments" sidePanel headerBack animateClose maxWidth="max-w-[600px]">
        {expenseId ? <ExpenseManagement view="detail" expenseId={expenseId} embedded onBack={() => { setExpenseId(null); setBillRefresh((value) => value + 1); void refresh() }} onOpenBill={(id) => { setExpenseId(null); setSelectedBillId(id); setBillRefresh((value) => value + 1) }} /> : null}
      </PortalModal>
      {!hideUnlinkedBills && possibleBills.length ? <section className="space-y-2"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Possible unlinked bills</h2><p className="text-sm text-[color:var(--portal-muted)]">These bills have the same recorded name, but aren’t linked to this provider. Check each one before linking it.</p><ul className="divide-y divide-[color:var(--portal-border)]">{possibleBills.map((bill) => <li key={bill.id} className="space-y-2 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><span className="text-sm font-semibold text-[color:var(--portal-text)]">{bill.service}</span><span className="text-sm tabular-nums text-[color:var(--portal-text)]">{bill.amount_state === 'known' && bill.amount != null && String(bill.amount).trim() !== '' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0 ? money(Number(bill.amount), bill.currency) : 'Amount unknown'}</span></div><p className="text-xs text-[color:var(--portal-muted)]">Due {date(bill.due_date)}</p><BillDocumentPreview bill={bill} /><button type="button" onClick={() => setSelectedBillId(bill.id)} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Review bill <ChevronRight size={14} /></button></li>)}</ul></section> : null}
      <VendorDocuments key={vendor.id} vendorId={vendor.id} archived={Boolean(vendor.archived_at)} onOpenBill={setSelectedBillId} />
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Linked intake history</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Includes intake records linked to these bills or flagged as possible duplicates.</p>{intakes.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{intakes.map((intake) => <li key={intake.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-[color:var(--portal-text)]">{intake.filename}</span><span className="text-xs text-[color:var(--portal-muted)]">{date(intake.received_at)} · {intake.status.replaceAll('_', ' ')}</span></li>)}</ul> : <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No linked intake records.</p>}</section>
    </>}
  </PortalPageFrame>
}
