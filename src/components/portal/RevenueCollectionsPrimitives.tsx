'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { PortalSkeleton } from '@/components/portal/PortalUI'

const muted = 'text-sm leading-relaxed text-[color:var(--portal-muted)]'
const card = 'min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm sm:p-5'

export function formatFinanceCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable'
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function FinancialMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
  loading = false,
}: {
  label: string
  value: number | null
  detail: string
  icon: Icon
  href?: string
  loading?: boolean
}) {
  const content = <>
    <div className="flex items-center justify-between gap-3">
      <h2 className={muted}>{label}</h2>
      <Icon aria-hidden="true" size={18} weight="regular" className="shrink-0 text-[#a8792f] dark:text-[#e6c77f]" />
    </div>
    <div className="mt-3 min-h-[32px] flex items-center">
      {loading ? (
        <PortalSkeleton className="h-8 w-28 rounded-md my-0.5" />
      ) : (
        <p className="break-words text-2xl font-semibold tracking-tight text-[color:var(--portal-text)] tabular-nums sm:text-3xl">{formatFinanceCurrency(value)}</p>
      )}
    </div>
    <p className="mt-2 text-xs leading-relaxed text-[color:var(--portal-muted)]">{detail}</p>
    {href && !loading ? <span className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">View records <span aria-hidden="true" className="ml-1">→</span></span> : null}
  </>
  return href && !loading
    ? <Link href={href} className={`${card} block transition-colors hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50`}>{content}</Link>
    : <section className={card}>{content}</section>
}

export function FinanceReviewNotice({ issues }: { issues: string[] }) {
  if (!issues.length) return null
  return <section role="status" aria-label="Figures needing review" className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-[color:var(--portal-text)]">
    <h2 className="font-semibold">Records requiring verification</h2>
    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{issues.join(' · ')}</p>
  </section>
}

export type CollectionChartRow = { key: string; label: string; collected: number | null; expected: number | null }

export function MonthlyCollectionsBars({ rows, title = 'Collections by month' }: { rows: CollectionChartRow[]; title?: string }) {
  const titleId = useId()
  const max = Math.max(0, ...rows.flatMap((row) => [row.collected, row.expected]).filter((value): value is number => value !== null && Number.isFinite(value)))
  return <section className={card} aria-labelledby={titleId}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id={titleId} className="font-semibold text-[color:var(--portal-text)]">{title}</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Collected is actual. Expected is the unpaid scheduled balance.</p></div>
      <div className="flex gap-3 text-xs text-[color:var(--portal-muted)]"><span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[#a8792f]" />Collected</span><span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[#e6c99d]" />Expected</span></div>
    </div>
    {rows.length ? <>
      <div className="mt-5 overflow-x-auto"><div className="flex min-w-[600px] items-end gap-2"><div className="relative h-28 w-12 shrink-0 self-start text-right text-[10px] text-[color:var(--portal-muted)]">{[max, max / 2, 0].map((value, index) => <span key={index} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${index * 50}%` }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)}</span>)}</div><div className="relative grid flex-1 grid-cols-12 items-end gap-2" role="img" aria-label={`${title}; each month separates collected and expected amounts`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-28 flex-col justify-between">{[0, 1, 2].map((line) => <div key={line} className="border-t border-[color:var(--portal-border)]" />)}</div>
        {rows.map((row) => {
          const actualHeight = max ? Math.max(0, (row.collected ?? 0) / max * 100) : 0
          const expectedHeight = max ? Math.max(0, (row.expected ?? 0) / max * 100) : 0
          return <div key={row.key} className="flex min-w-0 flex-col items-center gap-2">
            <div className="flex h-28 w-full max-w-14 items-end justify-center gap-1 border-b border-[color:var(--portal-border)]" title={`${row.label}: collected ${formatFinanceCurrency(row.collected)}, expected ${formatFinanceCurrency(row.expected)}`}>
              <div className="w-2/5 rounded-t-sm bg-[#a8792f]" style={{ height: `${actualHeight}%` }} />
              <div className="w-2/5 rounded-t-sm bg-[#e6c99d] dark:bg-[#8d7142]" style={{ height: `${expectedHeight}%` }} />
            </div>
            <span className="max-w-full truncate text-[10px] text-[color:var(--portal-muted)]">{row.label}</span>
          </div>
        })}
      </div></div></div>
    </> : <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No monthly collection data is available.</p>}
  </section>
}

export function FinanceEmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-5 py-8 text-center">
    <h2 className="font-semibold text-[color:var(--portal-text)]">{title}</h2>
    <p className="mx-auto mt-1 max-w-lg text-sm text-[color:var(--portal-muted)]">{detail}</p>
  </div>
}

