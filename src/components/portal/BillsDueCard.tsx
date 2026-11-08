'use client'

import Link from 'next/link'
import { Receipt, ChevronRight } from '@/lib/icons/phosphor-compat'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

/** A reminder list only: the linked expense ledger is authoritative for balances. */
export function BillsDueCard({ initialBills }: { initialBills: LuxorBill[] }) {
  const open = initialBills.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const rows = open.slice(0, 5)
  return <div className="flex h-full flex-col">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Receipt size={19} className="text-[#a8792f] dark:text-[#caa24c]" /><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Bills to review</h3></div><Link href="/portal/operations?tab=bills" className="inline-flex items-center gap-1 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">View all <ChevronRight size={14} /></Link></div>
    {rows.length ? <div className="mt-4 divide-y divide-[color:var(--portal-border)]">{rows.map((bill) => <Link key={bill.id} href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{bill.provider}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{bill.service} · {bill.due_date ? `Due ${bill.due_date}` : 'Due date not set'}</span></span><ChevronRight size={16} className="shrink-0 text-[color:var(--portal-muted)]" /></Link>)}</div> : <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No open bills to review.</p>}
    <p className="mt-4 text-xs text-[color:var(--portal-muted)]">Open a bill to review it or record a payment through its linked expense.</p>
  </div>
}
