'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert } from '@/lib/icons/phosphor-compat'
import { getLuxorAttentionSignals } from '@/lib/luxorAttentionSignals'
import type { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'
import type { LuxorInventoryItem, LuxorMaintenanceTask } from '@/app/api/operations/route'

type Props = {
  bills: LuxorBill[]
  billIntakes: LuxorBillIntake[]
  inventory: LuxorInventoryItem[]
  maintenanceTasks: LuxorMaintenanceTask[]
  loading?: boolean
}

/** Focused action list for use inside existing Finance or Operations views. */
export function NeedsAttentionNow({ bills, billIntakes, inventory, maintenanceTasks, loading = false }: Props) {
  const signals = useMemo(() => {
    const rank = { urgent: 0, review: 1, normal: 2 }
    return getLuxorAttentionSignals({ bills, billIntakes, inventory, maintenanceTasks }).sort((a, b) => rank[a.tone] - rank[b.tone])
  }, [bills, billIntakes, inventory, maintenanceTasks])
  const markedPaidCount = bills.filter((bill) => !bill.archived_at && bill.status === 'paid').length

  if (loading) {
    return <section aria-label="Needs attention now" aria-busy="true" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
      <div className="luxor-skeleton h-5 w-44 rounded-md" />
      <div className="mt-4 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="luxor-skeleton h-14 rounded-xl" />)}</div>
    </section>
  }

  return <section aria-labelledby="needs-attention-now-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="needs-attention-now-title" className="text-base font-bold text-[color:var(--portal-text)]">Needs attention now</h2>
        <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{signals.length ? `${signals.length} open record${signals.length === 1 ? '' : 's'} with a next step.` : 'No open bills, review items, maintenance tasks, or low supplies in the records loaded here.'}</p>
      </div>
      <span className="tabular-nums text-sm font-semibold text-[color:var(--portal-muted)]" aria-label={`${signals.length} records`}>{signals.length}</span>
    </div>
    {signals.length ? <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">
      {signals.slice(0, 8).map((signal) => <li key={signal.id}>
        <Link href={signal.href} className="group flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${signal.tone === 'urgent' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : signal.tone === 'review' ? 'bg-[#caa24c]/10 text-[#8b672d] dark:text-[#e6c77f]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
            {signal.tone === 'urgent' ? <CircleAlert size={17} /> : <ArrowUpRight size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{signal.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[color:var(--portal-muted)]">{signal.detail}</span>
          </span>
          <span className="hidden shrink-0 text-[10px] font-semibold text-[color:var(--portal-faint)] sm:inline">{signal.group}</span>
          <ArrowUpRight size={15} className="shrink-0 text-[color:var(--portal-faint)] transition-colors group-hover:text-[#a8792f]" />
        </Link>
      </li>)}
    </ul> : <div className="mt-4 flex items-center gap-2 rounded-xl bg-[color:var(--portal-soft)] px-3 py-3 text-sm text-[color:var(--portal-muted)]"><CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />Nothing currently needs attention in these records.</div>}
    {markedPaidCount ? <p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-xs leading-5 text-[color:var(--portal-muted)]"><strong className="text-[color:var(--portal-text)]">{markedPaidCount} {markedPaidCount === 1 ? 'bill is' : 'bills are'} marked paid in the bill record.</strong> Payment history is not checked on this page. <Link href="/portal/finances" className="font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">Review in Finances</Link>.</p> : null}
    {signals.length > 8 ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Showing the first 8 by urgency. Open the linked workspaces for the full lists.</p> : null}
  </section>
}
