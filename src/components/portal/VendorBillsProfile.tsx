'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Building2 } from '@/lib/icons/phosphor-compat'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { BillExpense } from '@/lib/luxorBillBalances'
import { createVendorRefreshFence } from '@/lib/luxorVendorRefreshFence'
import { getVendorBillHistory } from '@/lib/luxorVendorBillLinks'
import VendorBusinessDetails, { type VendorDetails } from '@/components/portal/VendorBusinessDetails'
import VendorDocuments from '@/components/portal/VendorDocuments'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'

type Receipt = { id: string; expense_id: string | null; file_name: string; title: string }
type BookingLabel = { id: string; client_name: string | null; event_type: string | null; event_date: string | null }
type ProfileData = { bills: LuxorBill[]; intakes: LuxorBillIntake[]; vendors: LuxorVendor[]; expenses: BillExpense[] | null; receipts: Receipt[]; bookings: BookingLabel[] | null }
function money(amount: number, code = 'USD') { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount) } catch { return `${amount.toFixed(2)} ${code}` } }
function date(value: string | null | undefined) {
  const day = value?.slice(0, 10) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Not set'
  const [year, month, dayNumber] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, dayNumber))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== dayNumber) return 'Not set'
  return day
}

export default function VendorBillsProfile({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fence = useRef(createVendorRefreshFence())
  const refresh = useCallback(async () => {
    const generation = fence.current.begin()
    try {
      const [center, expenseResponse] = await Promise.all([fetch('/api/portal/bill-center', { cache: 'no-store' }), fetch('/api/expenses', { cache: 'no-store' })])
      if (!center.ok || !expenseResponse.ok) throw new Error('Operations and finance access are required to load this profile.')
      const [result, expenses] = await Promise.all([center.json(), expenseResponse.json()])
      if (![result.bills, result.billIntakes, result.vendors, result.receipts, expenses].every(Array.isArray) || (result.bookings !== null && result.bookings !== undefined && !Array.isArray(result.bookings))) throw new Error('Vendor records could not be verified.')
      if (!fence.current.isCurrent(generation)) return
      setData({ bills: result.bills, intakes: result.billIntakes, vendors: result.vendors, receipts: result.receipts, bookings: Array.isArray(result.bookings) ? result.bookings : null, expenses: expenseResponse.headers.get('X-Luxor-Expense-History') === 'legacy-only' ? null : expenses }); setError(null)
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
  // Bill and expense responses are independent snapshots. Never derive balances
  // from their combination; show only an unambiguous link to the expense.
  const linked = bills.map((bill) => {
    const matches = (data?.expenses || []).filter((expense) => expense.source_bill_id === bill.id)
    return { bill, expense: matches.length === 1 ? matches[0] : null }
  })

  return <PortalPageFrame>
    <PortalPageHeader icon={<Building2 size={22} />} title={vendor?.name || 'Vendor profile'} description="Bills, payment history, and documents linked to this company." />
    <Link href="/portal/finances/bills" className="w-fit text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">Back to bills and vendors</Link>
    {error ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error} <button onClick={() => void refresh()} className="font-semibold text-[#9a712e]">Try again</button></p> : !data ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading vendor records…</p> : !vendor ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">Vendor not found or no longer available.</p> : <>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Company details</h2><VendorBusinessDetails vendor={vendor} onSaved={(updated) => { fence.current.invalidate(); setData((current) => current ? { ...current, vendors: current.vendors.map((item) => item.id === updated.id ? updated : item) } : current); void refresh() }} /></div><p className="mt-2 text-sm text-[color:var(--portal-muted)]">{vendor.vendor_type}{vendor.email ? ` · ${vendor.email}` : ''}{vendor.phone ? ` · ${vendor.phone}` : ''}</p>{vendor.contact_person || vendor.business_website || vendor.mailing_address || vendor.vendor_category || vendor.internal_notes ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{([['Contact', vendor.contact_person], ['Website', vendor.business_website], ['Mailing address', vendor.mailing_address], ['Category', vendor.vendor_category], ['Notes', vendor.internal_notes]] as Array<[string, string | null | undefined]>).filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-[color:var(--portal-text)]">{value}</dd></div>)}</dl> : null}<p className="mt-4 text-sm text-[color:var(--portal-text)]">{bills.length} linked bills</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Vendor totals are currently unavailable. Open an expense to review its payment history.</p></section>
      <VendorDocuments key={vendor.id} vendorId={vendor.id} archived={Boolean(vendor.archived_at)} />
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Bills and payment history</h2>{!linked.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No bills have been linked to this company.</p> : <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{linked.map(({ bill, expense }) => {
        const receipts = (data.receipts || []).filter((receipt) => expense && receipt.expense_id === expense.id)
        const booking = expense?.booking_id && data.bookings ? data.bookings.find((item) => item.id === expense.booking_id) : null
        const eventDay = booking?.event_date?.slice(0, 10)
        const eventDate = eventDay && /^\d{4}-\d{2}-\d{2}$/.test(eventDay) ? date(eventDay) : ''
        const eventLabel = expense?.booking_id ? (booking ? `${booking.client_name || 'Event'}${booking.event_type ? ` · ${booking.event_type}` : ''}${eventDate ? ` · ${eventDate}` : ''}` : 'Event expense') : expense ? 'General overhead' : ''
        return <article key={bill.id} className="space-y-3 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">{bill.service} <ArrowUpRight size={13} className="inline" /></Link><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.invoice_number ? `#${bill.invoice_number} · ` : ''}Due {date(bill.due_date)}{bill.frequency ? ` · ${bill.frequency}` : ''}{eventLabel ? ` · ${eventLabel}` : ''} · {bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id ? 'Possible duplicate' : bill.status === 'paid' ? 'Recorded paid; verify expense' : bill.extraction_status === 'ready' && bill.reviewed_at ? 'Reviewed' : 'Needs review'}{(bill as LuxorBill & { archived_at?: string | null }).archived_at ? ' · Archived' : ''}{bill.vendor_link_method === 'matched' ? ' · Automatically matched' : bill.vendor_link_method === 'owner' ? '' : ' · Company link method not recorded'}</p></div><div className="text-sm tabular-nums text-[color:var(--portal-text)]"><span className="block text-xs text-[color:var(--portal-muted)]">Original bill amount</span>{bill.amount_state === 'known' && bill.amount != null && String(bill.amount).trim() !== '' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0 ? money(Number(bill.amount), bill.currency) : 'Amount unknown'}</div></div><p className="text-xs text-[color:var(--portal-muted)]">Bill details are from the last refresh. {expense ? 'Open the linked expense to review payment history.' : 'The expense link is unavailable; review this bill in Operations.'}</p>
          {bill.source_attachment_id && bill.source_message_id ? <a href={`/api/operations/bills/${encodeURIComponent(bill.id)}/document`} target="_blank" rel="noreferrer" className="mr-4 inline-block text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">View source bill <ArrowUpRight size={12} className="inline" /></a> : null}
          {expense && Array.isArray(expense.payments) ? <ul className="space-y-1 text-xs text-[color:var(--portal-muted)]"><li>Recorded activity. These lines are not a vendor total.</li>{expense.payments.length ? [...expense.payments].sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)) || a.id.localeCompare(b.id)).map((payment) => { const amount = Number(payment.amount); return <li key={payment.id} className="text-[color:var(--portal-text)]">{date(payment.payment_date)} · {Number.isFinite(amount) ? money(amount) : 'Amount unavailable'} · {payment.transaction_type} · {payment.payment_method || 'Method not recorded'}{payment.reference_number ? ` · ${payment.reference_number}` : ''}</li> }) : <li>No payment lines are saved on the linked expense.</li>}</ul> : null}
          {expense ? <Link href={`/portal/finances/expenses/${encodeURIComponent(expense.id)}`} className="inline-block text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open expense and payment history <ArrowUpRight size={12} className="inline" /></Link> : null}
          {receipts.length ? <ul className="space-y-1 text-xs">{receipts.map((receipt) => <li key={receipt.id}><a href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=0`} target="_blank" rel="noreferrer" className="text-[#9a712e] hover:underline dark:text-[#e6c77f]">Receipt: {receipt.file_name}</a></li>)}</ul> : null}

        </article>
      })}</div>}</section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Linked intake history</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Includes intake records linked to these bills or flagged as possible duplicates.</p>{intakes.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{intakes.map((intake) => <li key={intake.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-[color:var(--portal-text)]">{intake.filename}</span><span className="text-xs text-[color:var(--portal-muted)]">{date(intake.received_at)} · {intake.status.replaceAll('_', ' ')}</span></li>)}</ul> : <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No linked intake records.</p>}</section>
    </>}
  </PortalPageFrame>
}
