'use client'

import React, { useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  Calendar,
  Zap,
  ArrowUpRight,
  RefreshCw,
  FileText
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader
} from '@/components/portal/PortalUI'

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<BarChart3 size={18} />}
        title="Business Analytics & Reports"
        description="Core metrics, performance logs, and business trends for Luxor Event Space."
        actions={
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setTimeout(() => setLoading(false), 500)
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh Reports
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
        {/* KPI metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsPanel label="Average Booking Value" value="$6,062" detail="+$320 vs last quarter" />
          <StatsPanel label="Occupancy Rate" value="82%" detail="18 active event days booked" />
          <StatsPanel label="Average Days to Book" value="11 Days" detail="Fast lead response conversion" />
          <StatsPanel label="Profit Margin" value="61.5%" detail="Stable operational expenses" />
        </div>

        {/* Breakdown grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trends */}
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-[#caa24c]" /> Booking Trends & Monthly Revenue
            </h3>
            <div className="space-y-4 pt-2 text-xs">
              {[
                { month: 'July 2026 (Current)', revenue: 48500, target: 50000, pct: 97 },
                { month: 'June 2026', revenue: 42000, target: 40000, pct: 100 },
                { month: 'May 2026', revenue: 38000, target: 40000, pct: 95 },
                { month: 'April 2026', revenue: 35000, target: 30000, pct: 100 }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between font-bold">
                    <span className="text-white">{item.month}</span>
                    <span className="font-mono text-zinc-400">${item.revenue.toLocaleString()} / ${item.target.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                    <div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Popular Event Types */}
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
              <Calendar size={16} className="text-[#caa24c]" /> Popular Event Bookings
            </h3>
            <div className="space-y-4 pt-2 text-xs">
              {[
                { type: 'Quinceañeras', count: 12, pct: 60 },
                { type: 'Wedding Receptions', count: 6, pct: 30 },
                { type: 'Private Celebrations', count: 2, pct: 10 }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between font-bold">
                    <span className="text-white">{item.type}</span>
                    <span className="font-mono text-zinc-400">{item.count} Booked ({item.pct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Operational Analytics row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Utility Cost Index</span>
            <h4 className="text-sm font-bold text-white mt-1">Energy & Water Usage</h4>
            <p className="text-xs text-zinc-400 font-mono pt-1">Avg Utility: $485.45 / mo</p>
            <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-2">
              <span>No utility spikes reported</span>
            </p>
          </div>

          <div className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Sales Conversion</span>
            <h4 className="text-sm font-bold text-white mt-1">Lead-to-Booking rate</h4>
            <p className="text-xs text-zinc-400 font-mono pt-1">Funnel Rate: 14.5% conversion</p>
            <p className="text-[10px] text-[#caa24c] font-semibold flex items-center gap-1 mt-2">
              <span>Best source: Google Search Ads</span>
            </p>
          </div>

          <div className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Audit Reports</span>
            <h4 className="text-sm font-bold text-white mt-1">Financial Statements</h4>
            <p className="text-xs text-zinc-500 pt-1">Export full bookkeeping ledger statements:</p>
            <button className="mt-2 w-full bg-[#caa24c]/10 hover:bg-[#caa24c]/20 border border-[#caa24c]/20 text-[#f1d27a] font-bold text-[9px] uppercase tracking-widest py-2 rounded transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <FileText size={12} /> Download PDF Statement
            </button>
          </div>
        </div>
      </div>
    </PortalPageFrame>
  )
}

function StatsPanel({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="luxor-glass-card rounded-xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[110px]">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="font-mono text-xl font-bold text-white mt-1.5">{value}</p>
      </div>
      <p className="text-[10px] text-zinc-550 font-medium leading-none mt-3">{detail}</p>
    </div>
  )
}
