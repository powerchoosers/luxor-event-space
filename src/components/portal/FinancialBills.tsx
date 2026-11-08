'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Receipt } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'

type Expense = { id: string; source_bill_id?: string | null; remaining_balance?: number | null; paid_amount?: number }
type Data = { bills: LuxorBill[]; billIntakes: LuxorBillIntake[]; vendors: LuxorVendor[]; expenses: Expense[] }
const currency = (value: number, code = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(value) }
  catch { return `${value.toFixed(2)} ${code}` }
}
const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'No due date'

export default function FinancialBills() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = useCallback(async () => {
    try {
      const [operations, expenses] = await Promise.all([fetch('/api/operations', { cache: 'no-store' }), fetch('/api/expenses', { cache: 'no-store' })])
      if (!operations.ok || !expenses.ok) throw new Error('Bills and expenses could not be loaded. Operations and finance access are required.')
      const [ops, expenseRows] = await Promise.all([operations.json(), expenses.json()])
      if (!Array.isArray(ops.bills) || !Array.isArray(ops.billIntakes) || !Array.isArray(ops.vendors) || !Array.isArray(expenseRows)) throw new Error('Bill records could not be verified. Please try again.')
      setData({ bills: ops.bills, billIntakes: ops.billIntakes, vendors: ops.vendors, expenses: expenseRows })
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load bills.') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!data?.billIntakes.some((intake) => intake.status === 'received' || intake.status === 'processing')) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [data, refresh])
  async function upload(file: File) {
    setUploading(true); setNotice(null)
    try {
      const form = new FormData(); form.set('file', file)
      const response = await fetch('/api/operations/bills/intake', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bill upload failed.')
      setNotice('Bill uploaded and queued for immediate AI analysis. Review the extracted details before approving them.')
      await refresh()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Bill upload failed.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const openBills = data?.bills.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate') || []
  const sorted = [...openBills].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  return <PortalPageFrame>
    <PortalPageHeader icon={<Receipt size={22} />} title="Bills and vendors" description="Upload a bill, review its details, and follow it through payment." actions={<><input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Choose a bill to upload" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} /><PortalButton variant="primary" disabled={uploading || !data || Boolean(error)} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload bill'}</PortalButton></>} />
    <Link href="/portal/finances" className="w-fit text-sm font-semibold text-[#9a712e] underline-offset-4 hover:underline dark:text-[#e6c77f]">Financial Center</Link>
    {notice ? <p role="status" className="text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
    {error ? <div role="alert" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="ml-2 font-semibold text-[#a8792f]" onClick={() => void refresh()}>Try again</button></div> : null}
    {!data && !error ? <p className="text-sm text-[color:var(--portal-muted)]">Loading bills…</p> : null}
    {data ? <>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Open bills</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Amounts extracted by AI need review. Payments are recorded in Expense Management.</p></div><Link href="/portal/operations?tab=bills" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]">Review all bills <ArrowUpRight size={14} className="inline" /></Link></div>
        {data.billIntakes.some((item) => ['received', 'processing', 'failed', 'ignored', 'duplicate'].includes(item.status)) ? <div className="mt-4 space-y-2 border-t border-[color:var(--portal-border)] pt-4">{data.billIntakes.filter((item) => ['received', 'processing', 'failed', 'ignored', 'duplicate'].includes(item.status)).map((item) => <p key={item.id} className="text-sm text-[color:var(--portal-muted)]">{item.filename}: {item.status === 'failed' ? 'Analysis failed; retry in Operations' : item.status === 'ignored' ? 'Analysis stopped or ignored; review in Operations' : item.status === 'duplicate' ? 'Possible duplicate; review in Operations' : 'Queued or analyzing…'}</p>)}</div> : null}
        {!sorted.length ? <p className="mt-5 text-sm text-[color:var(--portal-muted)]">No open bills. Upload one or add it in Operations.</p> : <div className="mt-4 divide-y divide-[color:var(--portal-border)]">{sorted.map((bill) => {
          const expense = data.expenses.find((item) => item.source_bill_id === bill.id)
          const known = bill.amount_state === 'known' && Number.isFinite(Number(bill.amount))
          const remaining = expense && expense.remaining_balance != null && Number.isFinite(Number(expense.remaining_balance)) ? Number(expense.remaining_balance) : null
          return <Link key={bill.id} href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:text-[#a8792f]"><span className="min-w-0"><span className="block font-semibold text-[color:var(--portal-text)]">{bill.provider}</span><span className="mt-1 block text-sm text-[color:var(--portal-muted)]">{bill.service} · {date(bill.due_date)} · {bill.extraction_status === 'ready' ? 'Ready' : 'Needs review'}</span></span><span className="text-right text-sm tabular-nums text-[color:var(--portal-text)]">{known ? currency(Number(bill.amount), bill.currency) : bill.amount_state === 'variable' ? 'Variable amount' : 'Amount unknown'}{remaining !== null ? <span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{currency(remaining)} remaining</span> : null}</span></Link>
        })}</div>}
      </section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Vendors</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Companies linked to your bills and operations.</p></div><Link href="/portal/operations?tab=vendors" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]">Manage vendors <ArrowUpRight size={14} className="inline" /></Link></div>{data.vendors.length ? <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">{data.vendors.map((vendor) => <li key={vendor.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold text-[color:var(--portal-text)]">{vendor.name}</span><span className="text-[color:var(--portal-muted)]">{vendor.vendor_type}</span></li>)}</ul> : <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No vendors added yet.</p>}</section>
    </> : null}
  </PortalPageFrame>
}
