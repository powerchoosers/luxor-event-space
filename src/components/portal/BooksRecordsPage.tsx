'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowClockwise, CaretDown, CaretUp } from '@phosphor-icons/react'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { AccountantSourceExports } from '@/components/portal/AccountantSourceExports'
import { AccountingReviewSection } from '@/components/portal/AccountingReviewSection'
import { getLuxorReferenceChartOfAccounts, suggestReferenceExpenseAccount } from '@/lib/luxorReferenceChartOfAccounts'
import type { BooksAgingBucket, LuxorBooksHealth } from '@/lib/luxorBooksHealth'

function money(value: number | null) {
  if (value === null) return '—'
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function AgingTable({ label, bucket }: { label: string; bucket: BooksAgingBucket | null }) {
  if (!bucket) {
    return <p className="text-sm text-[color:var(--portal-muted)]">{label} aging is unavailable until balances can be verified.</p>
  }
  const rows = [
    { name: 'Current', amount: bucket.current },
    { name: '1–30 days', amount: bucket.d1_30 },
    { name: '31–60 days', amount: bucket.d31_60 },
    { name: '61–90 days', amount: bucket.d61_90 },
    { name: 'Over 90 days', amount: bucket.d90_plus },
  ]
  return (
    <div className="w-full overflow-x-auto text-sm">
      <table className="w-full">
        <caption className="sr-only">{label} aging</caption>
        <thead>
          <tr className="border-b border-[color:var(--portal-border)] text-left text-xs text-[color:var(--portal-muted)]">
            <th className="pb-2 font-semibold">Bucket</th>
            <th className="pb-2 text-right font-semibold">Known balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--portal-border)]">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="py-2 text-[color:var(--portal-text)]">{row.name}</td>
              <td className="py-2 text-right tabular-nums text-[color:var(--portal-text)]">{money(row.amount > 0.005 ? row.amount : 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[color:var(--portal-border)]">
            <td className="pt-2 font-semibold text-[color:var(--portal-text)]">Total ({bucket.rowCount} {bucket.rowCount === 1 ? 'row' : 'rows'})</td>
            <td className="pt-2 text-right font-semibold tabular-nums text-[color:var(--portal-text)]">{money(bucket.totalKnown)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CollapsibleSection({ title, description, children, defaultOpen = false }: { title: string; description: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <h2 className="text-base font-bold text-[color:var(--portal-text)]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">{description}</p>
        </span>
        {open ? <CaretUp size={18} className="mt-1 shrink-0 text-[color:var(--portal-muted)]" /> : <CaretDown size={18} className="mt-1 shrink-0 text-[color:var(--portal-muted)]" />}
      </button>
      {open ? <div className="mt-5 border-t border-[color:var(--portal-border)] pt-5">{children}</div> : null}
    </section>
  )
}

export function BooksRecordsPage() {
  const [data, setData] = useState<LuxorBooksHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/portal/books-health', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Books health is unavailable.')
        if (!controller.signal.aborted) {
          setData(body as LuxorBooksHealth)
          setError(null)
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Books health is unavailable.')
      })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/portal/accounting-setup', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !Array.isArray(payload.categories)) return
        setCategoryNames(payload.categories.map((row: { name?: string }) => row.name).filter((name: unknown): name is string => typeof name === 'string'))
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  const chart = getLuxorReferenceChartOfAccounts()
  return (
    <PortalPageFrame className="max-md:pt-4 space-y-5">
      <PortalPageHeader title="Books & records" description="See what needs review, download records for your accountant, and preview bank statement matching." />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/portal/finances" className="text-sm font-semibold text-[#9a712e] underline-offset-4 hover:underline dark:text-[#e6c77f]">Financial Center</Link>
        <PortalButton type="button" onClick={() => setRevision((value) => value + 1)}><ArrowClockwise size={15} weight="regular" /> Refresh</PortalButton>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="underline" onClick={() => setRevision((value) => value + 1)}>Try again</button></p>
      ) : !data ? (
        <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading…</p>
      ) : (
        <>
          <p role="status" className="text-sm leading-6 text-[color:var(--portal-text)]">{data.statusSentence}</p>
          <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{data.cashBasisNote}</p>
          <div id="books-kpis" className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portal-muted)]">Client balances</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{money(data.kpis.outstandingReceivable)}</p>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{data.kpis.openReceivableCount ?? '—'} open receivable{data.kpis.openReceivableCount === 1 ? '' : 's'}</p>
              <Link href="/portal/finances/receivables" className="mt-3 inline-block text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">View receivables</Link>
            </div>
            <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portal-muted)]">Vendor balances</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{money(data.kpis.knownPayablesOutstanding)}</p>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{data.kpis.openPayableCount ?? '—'} verified open bill{data.kpis.openPayableCount === 1 ? '' : 's'}</p>
              <Link href="/portal/finances/bills" className="mt-3 inline-block text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">View bills</Link>
            </div>
            <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portal-muted)]">Review items</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{data.issueCount}</p>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Showing up to {data.issues.length} next steps below</p>
            </div>
          </div>
          {data.issues.length ? (
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
              <h2 className="text-base font-bold text-[color:var(--portal-text)]">Next actions</h2>
              <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">
                {data.issues.map((issue) => (
                  <li key={issue.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[color:var(--portal-text)]">{issue.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">{issue.detail}</p>
                    </div>
                    <Link href={issue.href} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Review</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
              <h2 className="text-base font-bold text-[color:var(--portal-text)]">Client money aging</h2>
              <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Outstanding contract balances with verified amounts.</p>
              <div className="mt-4">
                <AgingTable label="Receivable" bucket={data.receivableAging} />
              </div>
            </section>
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
              <h2 className="text-base font-bold text-[color:var(--portal-text)]">Vendor money aging</h2>
              <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Open bills with verified expense payment history.</p>
              <div className="mt-4">
                <AgingTable label="Payable" bucket={data.payableAging} />
              </div>
            </section>
          </div>
          <div id="exports">
            <AccountantSourceExports expenseExportsVerified={data.exports.expenseExportsVerified} clientExportsVerified={data.exports.clientExportsVerified} />
          </div>
          <CollapsibleSection title="Compare a bank statement (preview)" description="Upload a CSV to review rows and suggested matches. Saving imports and recorded match choices stay disabled until secure identity is verified.">
            <AccountingReviewSection canEdit={false} />
          </CollapsibleSection>
          <CollapsibleSection title="Reference chart of accounts" description="Standard account names for discussion with your accountant. Luxor does not post journal entries to these accounts yet.">
            <div className="space-y-6">
              {categoryNames.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Expense category hints</h3>
                  <ul className="mt-2 space-y-1 text-sm text-[color:var(--portal-muted)]">
                    {categoryNames.slice(0, 12).map((name) => (
                      <li key={name}>{name} → suggested {suggestReferenceExpenseAccount(name)}</li>
                    ))}
                    {categoryNames.length > 12 ? <li>…and {categoryNames.length - 12} more categories in Expense Management</li> : null}
                  </ul>
                </div>
              ) : null}
              {chart.map((group) => (
                <div key={group.classification}>
                  <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">{group.label}</h3>
                  <ul className="mt-2 grid gap-1 text-sm text-[color:var(--portal-muted)] sm:grid-cols-2">
                    {group.accounts.map((account) => (
                      <li key={account.name} className="tabular-nums">{account.number ? `${account.number} · ` : ''}{account.name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CollapsibleSection>
          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-muted)]">
            <p><span className="font-semibold text-[color:var(--portal-text)]">Accounting basis:</span> cash-basis tracking from recorded client payments and expense payment lines.</p>
            <p className="mt-2"><span className="font-semibold text-[color:var(--portal-text)]">Currency:</span> USD.</p>
            <p className="mt-2">Confirm opening balances and classifications with your accountant before filing taxes.</p>
          </section>
        </>
      )}
    </PortalPageFrame>
  )
}
