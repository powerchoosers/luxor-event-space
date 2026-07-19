'use client'

import React, { useMemo } from 'react'
import { ArrowUpRight, MapPin, TrendingUp } from 'lucide-react'
import { PortalStickyTable, PortalStickyThead, PortalTableCard } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

interface LeadSourcesTabProps {
  inquiries: LuxorInquiry[]
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

export function LeadSourcesTab({ inquiries, onFilterSource }: LeadSourcesTabProps) {
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

  const stats = [
    { label: 'Total Inquiries', value: totals.leads.toLocaleString(), detail: 'All Supabase inquiry records' },
    { label: 'Tour Pipeline', value: totals.tours.toLocaleString(), detail: 'Tour requested through booked' },
    { label: 'Booked', value: totals.bookings.toLocaleString(), detail: 'Inquiries marked booked' },
    { label: 'Booking Conversion', value: `${totals.conversionRate}%`, detail: 'Booked ÷ total inquiries' },
    { label: 'Recorded Sources', value: totals.sourceCount.toLocaleString(), detail: 'Distinct saved source values' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 transition-all hover:border-zinc-800">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[9px] font-black uppercase tracking-wider">{stat.label}</span>
              <TrendingUp size={14} className="text-[#caa24c]" />
            </div>
            <h3 className="mt-2.5 font-mono text-xl font-bold text-white">{stat.value}</h3>
            <p className="mt-2.5 text-[8px] font-bold leading-4 text-zinc-600">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-h-0 lg:col-span-2">
          <PortalTableCard controls={(
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Lead Source Performance</h3>
              <p className="mt-0.5 text-[9px] text-zinc-500">Counts are calculated from the current inquiry records; no ad spend or revenue is inferred.</p>
            </div>
          )}>
            <PortalStickyTable minWidth="760px">
              <PortalStickyThead>
                <tr className="bg-zinc-950/80 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Source</th>
                  <th className="px-4 py-4 text-right">Inquiries</th>
                  <th className="px-4 py-4 text-right">Tour Pipeline</th>
                  <th className="px-4 py-4 text-right">Booked</th>
                  <th className="px-4 py-4 text-right">Conversion</th>
                  <th className="px-4 py-4">Latest Inquiry</th>
                  <th className="px-6 py-4 text-right">Open</th>
                </tr>
              </PortalStickyThead>
              <tbody className="divide-y divide-zinc-900/60 text-xs font-semibold">
                {sourceRows.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-xs text-zinc-600">No inquiry source data is available yet.</td></tr>
                ) : null}
                {sourceRows.map((row) => (
                  <tr key={row.source} onClick={() => onFilterSource(row.source)} className="group cursor-pointer border-b border-zinc-900/40 transition-colors hover:bg-zinc-900/10">
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2 text-white"><MapPin size={12} className="text-[#caa24c]" /> {formatSource(row.source)}</span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{row.leads.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{row.tours.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{row.bookings.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-[#caa24c]">{row.conversionRate}%</td>
                    <td className="px-4 py-4 text-zinc-500">{formatDate(row.latestAt)}</td>
                    <td className="px-6 py-4 text-right"><ArrowUpRight size={13} className="ml-auto text-zinc-600 transition-colors group-hover:text-white" /></td>
                  </tr>
                ))}
                {sourceRows.length ? (
                  <tr className="border-t border-zinc-800 bg-zinc-950/40 text-xs font-bold">
                    <td className="px-6 py-4 text-[9px] font-black uppercase tracking-wider text-white">Total</td>
                    <td className="px-4 py-4 text-right font-mono text-white">{totals.leads.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-white">{totals.tours.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono text-white">{totals.bookings.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-mono font-black text-[#caa24c]">{totals.conversionRate}%</td>
                    <td colSpan={2} className="px-4 py-4" />
                  </tr>
                ) : null}
              </tbody>
            </PortalStickyTable>
          </PortalTableCard>
        </div>

        <div className="space-y-6">
          <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Inquiry Distribution</h4>
              <span className="font-mono text-[9px] text-zinc-500">All records</span>
            </div>
            {sourceRows.length ? (
              <div className="mt-5 space-y-4">
                {sourceRows.slice(0, 8).map((row) => (
                  <div key={row.source} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                      <span className="truncate text-zinc-300">{formatSource(row.source)}</span>
                      <span className="shrink-0 font-mono text-zinc-500">{row.leads} · {totals.leads ? Math.round((row.leads / totals.leads) * 1000) / 10 : 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                      <div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${maxLeads ? (row.leads / maxLeads) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No sources to chart." />
            )}
          </section>

          <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-6">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Top Booking Conversion</h4>
            {topConverting.length ? (
              <div className="mt-4 divide-y divide-zinc-900/60">
                {topConverting.map((row, index) => (
                  <button key={row.source} type="button" onClick={() => onFilterSource(row.source)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                    <span className="truncate text-[10px] font-bold text-zinc-300">{index + 1}. {formatSource(row.source)}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-emerald-400">{row.conversionRate}% · {row.bookings} booked</span>
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
  return <div className="mt-4 rounded-xl border border-dashed border-zinc-850 p-5 text-center text-xs text-zinc-600">{message}</div>
}
