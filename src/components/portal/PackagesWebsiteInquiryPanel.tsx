'use client'

import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

type PackagesConfiguratorSnapshot = {
  schema_version?: number
  summary_lines?: Array<{ label: string; amount: number; obligation?: string; category?: string }>
  totals?: {
    totalEstimate?: number | null
    amountToReserve?: number | null
    refundableSecurityDeposit?: number | null
  }
  configurator_input?: {
    eventDate?: string
    guestCount?: number
    rentalPeriod?: string
    packageTierId?: string
    eventType?: string | null
  }
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function readPackagesSnapshot(lead: LuxorInquiry): PackagesConfiguratorSnapshot | null {
  const raw = lead.metadata?.packagesConfigurator
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as PackagesConfiguratorSnapshot : null
}

export function PackagesWebsiteInquiryPanel({ lead }: { lead: LuxorInquiry }) {
  const snapshot = readPackagesSnapshot(lead)
  if (!snapshot) return null
  const input = snapshot.configurator_input
  const lines = snapshot.summary_lines?.filter((line) => line.category && !['total', 'schedule'].includes(line.category)) || []

  return (
    <section className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Website package estimate</p>
      {input ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {input.eventDate ? <div><dt className="text-[color:var(--portal-muted)]">Event date</dt><dd className="font-medium tabular-nums text-[color:var(--portal-text)]">{input.eventDate}</dd></div> : null}
          {input.eventType ? <div><dt className="text-[color:var(--portal-muted)]">Event type</dt><dd className="font-medium text-[color:var(--portal-text)]">{input.eventType}</dd></div> : null}
          {input.guestCount ? <div><dt className="text-[color:var(--portal-muted)]">Guests</dt><dd className="font-medium tabular-nums text-[color:var(--portal-text)]">{input.guestCount}</dd></div> : null}
          {input.rentalPeriod ? <div><dt className="text-[color:var(--portal-muted)]">Rental period</dt><dd className="font-medium text-[color:var(--portal-text)]">{input.rentalPeriod.replace('_', ' ')}</dd></div> : null}
          {input.packageTierId ? <div><dt className="text-[color:var(--portal-muted)]">Package</dt><dd className="font-medium capitalize text-[color:var(--portal-text)]">{input.packageTierId}</dd></div> : null}
        </dl>
      ) : null}
      {lines.length ? (
        <ul className="mt-4 space-y-2 border-t border-[color:var(--portal-border)] pt-4 text-sm">
          {lines.map((line) => (
            <li key={`${line.label}-${line.amount}`} className="flex items-start justify-between gap-3">
              <span className="text-[color:var(--portal-text)]">{line.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-[color:var(--portal-text)]">{money.format(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {snapshot.totals?.totalEstimate != null ? (
        <p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-sm font-semibold text-[color:var(--portal-text)]">
          Total estimate: <span className="font-mono tabular-nums">{money.format(snapshot.totals.totalEstimate)}</span>
        </p>
      ) : null}
    </section>
  )
}
