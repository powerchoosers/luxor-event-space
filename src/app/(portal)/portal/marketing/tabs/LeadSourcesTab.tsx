'use client'

import React, { useMemo } from 'react'
import {
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead,
  PortalSelect
} from '@/components/portal/PortalUI'
import {
  TrendingUp,
  ArrowUpRight,
  Filter,
  BarChart2,
  MoreVertical,
  Download
} from 'lucide-react'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'

interface LeadSourcesTabProps {
  inquiries: LuxorInquiry[]
  onFilterSource: (source: string) => void
}

export function LeadSourcesTab({ inquiries, onFilterSource }: LeadSourcesTabProps) {
  
  // Stats cards values from Rendering 1
  const statsData = [
    { label: 'Total Leads', value: '237', change: '8.4% vs last 7 days', positive: true, isDown: true },
    { label: 'Total Tours', value: '96', change: '12.7% vs last 7 days', positive: true, isDown: false },
    { label: 'Total Bookings', value: '37', change: '15.6% vs last 7 days', positive: true, isDown: false },
    { label: 'Total Revenue', value: '$112,450', change: '21.8% vs last 7 days', positive: true, isDown: false },
    { label: 'Overall Conversion Rate', value: '15.6%', change: '3.1% vs last 7 days', positive: true, isDown: false }
  ]

  // Table rows matching Rendering 1 exactly
  const leadSourcesData = [
    { source: 'Google Search (SEO)', leads: 61, tours: 42, bookings: 13, rate: '23.5%', revenue: '$39,240', cost: '$0', cpl: '$0.00', color: '#3b82f6' },
    { source: 'Google Business Profile', leads: 61, tours: 28, bookings: 11, rate: '18.0%', revenue: '$32,150', cost: '$0', cpl: '$0.00', color: '#caa24c' },
    { source: 'Facebook / Meta Ads', leads: 54, tours: 15, bookings: 8, rate: '14.8%', revenue: '$21,300', cost: '$850', cpl: '$17.80', color: '#10b981' },
    { source: 'Instagram', leads: 32, tours: 14, bookings: 5, rate: '15.6%', revenue: '$13,550', cost: '$150', cpl: '$7.85', color: '#ec4899' },
    { source: 'The Knot', leads: 22, tours: 12, bookings: 7, rate: '31.8%', revenue: '$21,850', cost: '$275', cpl: '$12.50', color: '#f59e0b' },
    { source: 'WeddingWire', leads: 18, tours: 9, bookings: 4, rate: '22.2%', revenue: '$10,950', cost: '$172', cpl: '$9.24', color: '#8b5cf6' },
    { source: 'Peerspace', leads: 16, tours: 7, bookings: 3, rate: '18.8%', revenue: '$8,450', cost: '$144', cpl: '$9.00', color: '#6b7280' },
    { source: 'TikTok', leads: 11, tours: 5, bookings: 2, rate: '18.2%', revenue: '$6,800', cost: '$190', cpl: '$18.35', color: '#f43f5e' },
    { source: 'Referral', leads: 9, tours: 6, bookings: 3, rate: '33.3%', revenue: '$10,750', cost: '$0', cpl: '$0.00', color: '#14b8a6' },
    { source: 'Walk-In / Other', leads: 7, tours: 4, bookings: 1, rate: '14.3%', revenue: '$2,350', cost: '$0', cpl: '$0.00', color: '#a1a1aa' }
  ]

  // Totals Row
  const totalRow = {
    leads: 237 + inquiries.length,
    tours: 96,
    bookings: 37,
    rate: '15.6%',
    revenue: '$112,450',
    cost: '$1,570',
    cpl: '$6.33'
  }

  // Top Converting list exactly matching screenshot
  const topConvertingList = [
    { rank: 1, source: 'The Knot', rate: '31.8%', pct: 100 },
    { rank: 2, source: 'Referral', rate: '33.3%', pct: 95 },
    { rank: 3, source: 'WeddingWire', rate: '22.2%', pct: 75 },
    { rank: 4, source: 'Google Search (SEO)', rate: '23.5%', pct: 70 },
    { rank: 5, source: 'Google Business Profile', rate: '18.0%', pct: 55 }
  ]

  return (
    <div className="space-y-6">
      {/* 5 Stats KPI cards row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {statsData.map((stat, idx) => (
          <div key={idx} className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 relative group hover:border-zinc-800 transition-all">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[9px] font-black uppercase tracking-wider">{stat.label}</span>
              <TrendingUp size={14} className="text-zinc-650" />
            </div>
            <h3 className="font-mono text-xl font-bold text-white mt-2.5 leading-none">{stat.value}</h3>
            <span className="inline-block text-[8px] font-bold mt-2.5 text-emerald-400">
              {stat.isDown ? '↓' : '↑'} {stat.change}
            </span>
          </div>
        ))}
      </div>

      {/* Main performance layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Table Column */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <PortalTableCard
            controls={
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Lead Source Performance</h3>
                  <p className="text-[9px] text-zinc-500 mt-0.5">See where your leads come from and how they convert.</p>
                </div>
                <div className="flex items-center gap-2">
                  <PortalSelect
                    value="last-30"
                    onChange={() => {}}
                    options={[{ value: 'last-30', label: 'Last 30 Days' }]}
                  />
                </div>
              </div>
            }
          >
            <PortalStickyTable minWidth="880px">
              <PortalStickyThead>
                <tr className="bg-zinc-950/80 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Source</th>
                  <th className="px-4 py-4 text-right">Leads</th>
                  <th className="px-4 py-4 text-right">Tours</th>
                  <th className="px-4 py-4 text-right">Bookings</th>
                  <th className="px-4 py-4 text-right">Conversion Rate</th>
                  <th className="px-4 py-4 text-right">Revenue</th>
                  <th className="px-4 py-4 text-right">Cost</th>
                  <th className="px-4 py-4 text-right">Cost Per Lead</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </PortalStickyThead>
              <tbody className="divide-y divide-zinc-900/60 text-xs font-semibold">
                {leadSourcesData.map((item, idx) => (
                  <tr
                    key={idx}
                    onClick={() => onFilterSource(item.source)}
                    className="group cursor-pointer hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/40"
                  >
                    <td className="px-6 py-4 flex items-center gap-3 text-white">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span>{item.source}</span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.leads}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.tours}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.bookings}</td>
                    <td className="px-4 py-4 text-right font-mono text-[#caa24c] font-bold">{item.rate}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.revenue}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.cost}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-350">{item.cpl}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="rounded p-1 text-zinc-600 hover:text-white transition-colors">
                        <MoreVertical size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="bg-zinc-950/40 text-xs font-bold border-t border-zinc-800">
                  <td className="px-6 py-4 text-white uppercase tracking-wider text-[9px] font-black">Total</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.leads}</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.tours}</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.bookings}</td>
                  <td className="px-4 py-4 text-right font-mono text-[#caa24c] font-black">{totalRow.rate}</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.revenue}</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.cost}</td>
                  <td className="px-4 py-4 text-right font-mono text-white">{totalRow.cpl}</td>
                  <td className="px-6 py-4"></td>
                </tr>
              </tbody>
            </PortalStickyTable>
          </PortalTableCard>
        </div>

        {/* Right Distribution Panel */}
        <div className="space-y-6">
          {/* Donut Chart */}
          <div className="luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-5 text-center">
            <div className="flex items-center justify-between text-left">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Leads by Source</h4>
              <span className="text-[9px] font-mono font-bold text-zinc-500">Last 90 Days</span>
            </div>

            <div className="relative flex items-center justify-center h-48 w-full">
              {/* SVG donut chart */}
              <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 36 36">
                {/* Google Search (SEO) - 61/237 = 25.7% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="25.7 74.3" strokeDashoffset="100" />
                {/* Google Business Profile - 61/237 = 25.7% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#caa24c" strokeWidth="3" strokeDasharray="25.7 74.3" strokeDashoffset="74.3" />
                {/* Facebook Ads - 54/237 = 22.8% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="22.8 77.2" strokeDashoffset="48.6" />
                {/* Instagram - 32/237 = 13.5% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ec4899" strokeWidth="3" strokeDasharray="13.5 86.5" strokeDashoffset="25.8" />
                {/* The Knot - 22/237 = 9.3% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="9.3 90.7" strokeDashoffset="12.3" />
                {/* WeddingWire - 18/237 = 7.6% */}
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeDasharray="7.6 92.4" strokeDashoffset="3.0" />
              </svg>
              {/* Inner Circle Info */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold text-white leading-none">237</span>
                <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest mt-1">Total Leads</span>
              </div>
            </div>

            {/* Slices legend list */}
            <div className="grid grid-cols-2 gap-2 text-left text-[9px] font-bold text-zinc-400">
              <LegendItem color="bg-[#3b82f6]" label="Google Search" value="25.7%" />
              <LegendItem color="bg-[#caa24c]" label="Google Business" value="25.7%" />
              <LegendItem color="bg-[#10b981]" label="Facebook Ads" value="22.8%" />
              <LegendItem color="bg-[#ec4899]" label="Instagram" value="13.5%" />
              <LegendItem color="bg-[#f59e0b]" label="The Knot" value="9.3%" />
              <LegendItem color="bg-[#8b5cf6]" label="WeddingWire" value="7.6%" />
            </div>

            <button className="rounded-lg border border-zinc-900 hover:border-zinc-800 py-1.5 w-full text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition-colors">
              View Full Report
            </button>
          </div>

          {/* Top Converting Sources */}
          <div className="luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Top Converting Sources</h4>
              <span className="text-[9px] font-mono font-bold text-zinc-500">Last 30 Days</span>
            </div>

            <div className="space-y-3">
              {topConvertingList.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-zinc-350">{item.rank}. {item.source}</span>
                    <span className="font-mono text-emerald-400">{item.rate}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#caa24c]/40 to-[#caa24c] rounded-full" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <button className="rounded-lg border border-zinc-900 hover:border-zinc-800 py-1.5 w-full text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition-colors mt-2">
              View Conversion Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${color}`} />
        <span className="truncate">{label}</span>
      </div>
      <span className="font-mono text-zinc-500 shrink-0">{value}</span>
    </div>
  )
}
