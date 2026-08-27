'use client'

import React, { useMemo } from 'react'
import { ArrowUpRight, MapPin, TrendingUp, Users } from 'lucide-react'
import { PortalStickyTable, PortalStickyThead, PortalTableCard } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

interface LeadSourcesTabProps {
  inquiries: LuxorInquiry[]
  loading?: boolean
  onFilterSource: (source: string) => void
}

type SourceRow = {
  source: string
  leads: number
  tours: number
  bookings: number
  conversionRate: number
  latestAt: string
}

export function LeadSourcesTab({ inquiries, loading = false, onFilterSource }: LeadSourcesTabProps) {
  const sourceRows = useMemo<SourceRow[]>(() => {
    const grouped = new Map<string, SourceRow>()

    inquiries.forEach((inquiry) => {
      const source = inquiry.source?.trim() || 'Source not recorded'
      const current = grouped.get(source) || {
        source,
        leads: 0,
        tours: 0,
        bookings: 0,
        conversionRate: 0,
        latestAt: inquiry.created_at,
      }
      current.leads += 1
      if (isInTourPipeline(inquiry)) current.tours += 1
      if (inquiry.status === 'booked') current.bookings += 1
      if (new Date(inquiry.created_at).getTime() > new Date(current.latestAt).getTime()) current.latestAt = inquiry.created_at
      grouped.set(source, current)
    })

    return Array.from(grouped.values())
      .map((row) => ({ ...row, conversionRate: row.leads ? Math.round((row.bookings / row.leads) * 1000) / 10 : 0 }))
      .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source))
  }, [inquiries])

  const totals = useMemo(() => {
    const tours = inquiries.filter(isInTourPipeline).length
    const bookings = inquiries.filter((inquiry) => inquiry.status === 'booked').length
    return {
      leads: inquiries.length,
      tours,
      bookings,
      conversionRate: inquiries.length ? Math.round((bookings / inquiries.length) * 1000) / 10 : 0,
      sourceCount: sourceRows.length,
    }
  }, [inquiries, sourceRows.length])

  const topConverting = [...sourceRows]
    .filter((row) => row.bookings > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate || b.bookings - a.bookings)
    .slice(0, 5)
  const maxLeads = Math.max(...sourceRows.map((row) => row.leads), 0)
  const leadingSource = sourceRows[0]
  const bestConverter = topConverting[0]

  const stats = [
    { label: 'Total Inquiries', value: totals.leads.toLocaleString(), detail: 'All inquiry records' },
    { label: 'Tour Pipeline', value: totals.tours.toLocaleString(), detail: 'Tour requested through booked' },
    { label: 'Booked', value: totals.bookings.toLocaleString(), detail: 'Inquiries marked booked' },
    { label: 'Booking Conversion', value: `${totals.conversionRate}%`, detail: 'Booked ÷ total inquiries' },
    { label: 'Recorded Sources', value: totals.sourceCount.toLocaleString(), detail: 'Distinct saved source values' },
  ]

  return (
    <div className="space-y-7 pb-8">
      <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[color:var(--portal-border)] md:grid-cols-5 md:divide-y-0">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-3 p-5">
                <div className="h-3 w-20 rounded luxor-skeleton" />
                <div className="h-6 w-12 rounded luxor-skeleton" />
                <div className="h-2.5 w-24 rounded luxor-skeleton" />
              </div>
            ))
          : stats.map((stat) => (
              <div key={stat.label} className="p-5 transition-colors hover:bg-[color:var(--portal-soft)]/45">
                <div className="flex items-center justify-between text-[color:var(--portal-muted)]">
                  <span className="text-[9px] font-black uppercase tracking-wider">{stat.label}</span>
                  <TrendingUp size={14} className="text-[color:var(--portal-accent)]" />
                </div>
                <h3 className="mt-2.5 font-mono text-xl font-bold text-[color:var(--portal-text)]">{stat.value}</h3>
                <p className="mt-2.5 text-[8px] font-bold leading-4 text-[color:var(--portal-muted)]">{stat.detail}</p>
              </div>
            ))}
        </div>
      </div>

      {!loading && sourceRows.length ? (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--portal-card)] text-[color:var(--portal-accent)]">
                <Users size={16} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Where demand starts</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{formatSource(leadingSource.source)} is your largest inquiry source.</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{leadingSource.leads.toLocaleString()} inquiries · {totals.leads ? Math.round((leadingSource.leads / totals.leads) * 1000) / 10 : 0}% of all recorded demand</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Where demand converts</p>
            {bestConverter ? (
              <button type="button" onClick={() => onFilterSource(bestConverter.source)} className="mt-2 flex w-full items-center justify-between gap-4 text-left">
                <span className="text-sm font-semibold text-[color:var(--portal-text)]">{formatSource(bestConverter.source)}</span>
                <span className="font-mono text-sm font-bold text-[color:var(--portal-accent)]">{bestConverter.conversionRate}% <ArrowUpRight className="ml-1 inline" size={14} /></span>
              </button>
            ) : <p className="mt-2 text-sm text-[color:var(--portal-muted)]">No booked inquiries yet.</p>}
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Highest booking conversion among sources with a booking.</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-h-0 lg:col-span-2">
          <PortalTableCard controls={(
              <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Source performance</h3>
              <p className="mt-0.5 text-[9px] text-[color:var(--portal-muted)]">Select a row to open that source’s inquiries. Conversion is booked ÷ inquiries.</p>
            </div>
          )}>
            <PortalStickyTable minWidth="760px">
              <PortalStickyThead>
                <tr className="bg-[color:var(--portal-soft)] text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                  <th className="px-6 py-4">Source</th>
                  <th className="px-4 py-4 text-right">Inquiries</th>
                  <th className="px-4 py-4 text-right">Tour Pipeline</th>
                  <th className="px-4 py-4 text-right">Booked</th>
                  <th className="px-4 py-4 text-right">Conversion</th>
                  <th className="px-4 py-4">Latest Inquiry</th>
                  <th className="px-6 py-4 text-right">Open</th>
                </tr>
              </PortalStickyThead>
              <tbody className="divide-y divide-[color:var(--portal-border)] text-xs font-semibold">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 w-32 rounded luxor-skeleton" /></td>
                      <td className="px-4 py-4 text-right"><div className="h-4 w-8 ml-auto rounded luxor-skeleton" /></td>
                      <td className="px-4 py-4 text-right"><div className="h-4 w-8 ml-auto rounded luxor-skeleton" /></td>
                      <td className="px-4 py-4 text-right"><div className="h-4 w-8 ml-auto rounded luxor-skeleton" /></td>
                      <td className="px-4 py-4 text-right"><div className="h-4 w-12 ml-auto rounded luxor-skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-24 rounded luxor-skeleton" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 w-4 ml-auto rounded luxor-skeleton" /></td>
                    </tr>
                  ))
                ) : sourceRows.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-xs text-[color:var(--portal-muted)]">No inquiry source data is available yet.</td></tr>
                ) : null}
                {sourceRows.map((row) => (
                  <tr key={row.source} tabIndex={0} onClick={() => onFilterSource(row.source)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onFilterSource(row.source) }} aria-label={`Open inquiries from ${formatSource(row.source)}`} className="group cursor-pointer border-b border-[color:var(--portal-border)] transition-colors hover:bg-[color:var(--portal-soft)] focus:bg-[color:var(--portal-soft)] focus:outline-none">
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2 text-[color:var(--portal-text)]"><MapPin size={12} className="text-[color:var(--portal-accent)]" /> {formatSource(row.source)}</span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{row.leads.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{row.tours.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{row.bookings.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-[color:var(--portal-accent)]">{row.conversionRate}%</td>
                    <td className="px-4 py-4 text-[color:var(--portal-muted)]">{formatDate(row.latestAt)}</td>
                    <td className="px-6 py-4 text-right"><ArrowUpRight size={13} className="ml-auto text-[color:var(--portal-muted)] transition-colors group-hover:text-[color:var(--portal-text)]" /></td>
                  </tr>
                ))}
                {sourceRows.length ? (
                  <tr className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-xs font-bold">
                    <td className="px-6 py-4 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-text)]">Total</td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{totals.leads.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{totals.tours.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-[color:var(--portal-text)]">{totals.bookings.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono font-black text-[color:var(--portal-accent)]">{totals.conversionRate}%</td>
                    <td colSpan={2} className="px-4 py-4" />
                  </tr>
                ) : null}
              </tbody>
            </PortalStickyTable>
          </PortalTableCard>
        </div>

        <div className="space-y-6">
          <section className="portal-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-[color:var(--portal-text)]">Where demand comes from</h4>
              <span className="font-mono text-[9px] text-[color:var(--portal-muted)]">All records</span>
            </div>
            {sourceRows.length ? (
              <div className="mt-5 space-y-4">
                {sourceRows.slice(0, 8).map((row) => (
                  <div key={row.source} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                      <span className="truncate text-[color:var(--portal-text)]">{formatSource(row.source)}</span>
                      <span className="shrink-0 font-mono text-[color:var(--portal-muted)]">{row.leads} · {totals.leads ? Math.round((row.leads / totals.leads) * 1000) / 10 : 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-border)]">
                      <div className="h-full rounded-full bg-[color:var(--portal-accent)]" style={{ width: `${maxLeads ? (row.leads / maxLeads) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No sources to chart." />
            )}
          </section>

          <section className="portal-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
            <h4 className="text-xs font-black uppercase tracking-wider text-[color:var(--portal-text)]">Best converting channels</h4>
            {topConverting.length ? (
              <div className="mt-4 divide-y divide-[color:var(--portal-border)]">
                {topConverting.map((row, index) => (
                  <button key={row.source} type="button" onClick={() => onFilterSource(row.source)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                    <span className="truncate text-[10px] font-bold text-[color:var(--portal-text)]">{index + 1}. {formatSource(row.source)}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-[color:var(--portal-accent)]">{row.conversionRate}% · {row.bookings} booked</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState message="No source has a booked inquiry yet." />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function isInTourPipeline(inquiry: LuxorInquiry) {
  return ['tour_requested', 'tour_confirmed', 'proposal_sent', 'booked'].includes(inquiry.status)
}

function formatSource(value: string) {
  return value === 'Source not recorded' ? value : value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function EmptyState({ message }: { message: string }) {
  return <div className="mt-4 rounded-xl border border-dashed border-[color:var(--portal-border)] p-5 text-center text-xs text-[color:var(--portal-muted)]">{message}</div>
}
