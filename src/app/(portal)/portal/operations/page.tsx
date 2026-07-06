'use client'

import React, { useState } from 'react'
import {
  Wrench,
  DollarSign,
  Package,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Building,
  Users,
  Eye,
  FileText,
  Upload,
  Calendar,
  Sparkles,
  Zap,
  TrendingUp,
  Droplet,
  Trash2,
  Clock,
  Plus
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead
} from '@/components/portal/PortalUI'

type SubTab =
  | 'dashboard'
  | 'bills'
  | 'maintenance'
  | 'inventory'
  | 'vendors'
  | 'utilities'
  | 'cleaning'
  | 'staff'

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<SubTab>('dashboard')

  // State for interactive features
  const [readinessTasks, setReadinessTasks] = useState([
    { id: '1', label: 'Utilities Active', checked: true },
    { id: '2', label: 'Venue Cleaned', checked: true },
    { id: '3', label: 'Bathrooms Stocked', checked: true },
    { id: '4', label: 'Chairs Counted', checked: true },
    { id: '5', label: 'Tables Set', checked: true },
    { id: '6', label: 'HVAC Working', checked: true },
    { id: '7', label: 'Exit Sign Inspection Needed', checked: false, critical: true },
    { id: '8', label: 'Inventory Count Pending', checked: false }
  ])

  const [maintenanceTasks, setMaintenanceTasks] = useState([
    { id: 'm1', title: 'Replace Restroom Soap Dispenser', status: 'open', priority: 'medium', assignedTo: 'Marco G.' },
    { id: 'm2', title: 'HVAC Filter Annual Inspection', status: 'open', priority: 'high', assignedTo: 'Air-Pros LLC' },
    { id: 'm3', title: 'Restock Paper Towels - Pantry', status: 'completed', priority: 'low', assignedTo: 'Maria S.' },
    { id: 'm4', title: 'Emergency Exit Signs Diagnostic', status: 'open', priority: 'high', assignedTo: 'Elena Concierge' }
  ])

  const [furnitureCounts, setFurnitureCounts] = useState([
    { name: 'Ghost Chairs', count: 240, target: 250, unit: 'pcs' },
    { name: 'Round Tables', count: 20, target: 20, unit: 'pcs' },
    { name: 'Cocktail Tables', count: 12, target: 15, unit: 'pcs' },
    { name: 'Gold Easels', count: 4, target: 4, unit: 'pcs' }
  ])

  const [suppliesCounts, setSuppliesCounts] = useState([
    { name: 'Toilet Paper', count: 12, target: 30, unit: 'rolls', status: 'Low' },
    { name: 'Liquid Hand Soap', count: 4, target: 10, unit: 'bottles', status: 'Low' },
    { name: 'Heavy Duty Trash Bags', count: 45, target: 50, unit: 'bags', status: 'Good' },
    { name: 'Mop Heads', count: 3, target: 5, unit: 'pcs', status: 'Good' }
  ])

  const handleToggleReadinessTask = (id: string) => {
    setReadinessTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t))
    )
  }

  // Calculate readiness score
  const completedCount = readinessTasks.filter((t) => t.checked).length
  const readinessScore = Math.round((completedCount / readinessTasks.length) * 100)

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Wrench size={18} />}
        title="Venue Operations"
        description="Core logistics command: Monitor maintenance, track facility bills, manage supply counts, and verify venue event readiness."
      />

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        {[
          { id: 'dashboard', label: 'Operations Dashboard', icon: <Activity size={15} /> },
          { id: 'bills', label: 'Bills & Payments', icon: <DollarSign size={15} /> },
          { id: 'maintenance', label: 'Maintenance Log', icon: <Wrench size={15} /> },
          { id: 'inventory', label: 'Inventory counts', icon: <Package size={15} /> },
          { id: 'vendors', label: 'Preferred Vendors', icon: <Users size={15} /> },
          { id: 'utilities', label: 'Utility Sensors', icon: <Zap size={15} /> },
          { id: 'cleaning', label: 'Cleaning checklists', icon: <Sparkles size={15} /> },
          { id: 'staff', label: 'Staff Rota (Future)', icon: <Clock size={15} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as SubTab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#caa24c]/10 border border-[#caa24c]/25 text-[#f1d27a]'
                : 'border border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-zinc-950/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top row metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatsCard label="Readiness Score" value={`${readinessScore}%`} subtitle="Venue Status Score" tone={readinessScore > 90 ? 'green' : 'gold'} />
              <StatsCard label="Bills Due" value="$4,289.99" subtitle="Due this week" tone="gold" />
              <StatsCard label="Maintenance" value={String(maintenanceTasks.filter(t => t.status === 'open').length)} subtitle="Unresolved issues" tone="blue" />
              <StatsCard label="Supply Alerts" value={String(suppliesCounts.filter(s => s.status === 'Low').length)} subtitle="Low stock items" tone="gold" />
              <StatsCard label="Sensors Status" value="Active" subtitle="Utilities Online" tone="green" />
            </div>

            {/* Event Day Readiness Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Readiness Details */}
              <div className="luxor-glass-card rounded-2xl p-6 lg:col-span-2 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" /> Venue Readiness Checklists
                  </h3>
                  <span className="text-[10px] font-mono text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded">
                    Score: {readinessScore}%
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Interactive checklist required before hosting any event at the Luxor space. Complete all steps to guarantee guest satisfaction.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {readinessTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                      <input
                        type="checkbox"
                        checked={task.checked}
                        onChange={() => handleToggleReadinessTask(task.id)}
                        className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer"
                      />
                      <span className={`text-xs font-semibold ${task.checked ? 'line-through text-zinc-650' : 'text-zinc-200'}`}>
                        {task.label}
                      </span>
                      {!task.checked && task.critical && (
                        <span className="ml-auto text-[8px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">Exit Sign</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Maintenance & Inventory side alert widgets */}
              <div className="space-y-6 lg:col-span-1">
                {/* Today's Maintenance list */}
                <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Critical Facility Tasks</h3>
                  <div className="space-y-3 text-xs">
                    {maintenanceTasks.filter(t => t.status === 'open').slice(0, 3).map(task => (
                      <div key={task.id} className="flex items-start gap-3 border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0">
                        <AlertTriangle size={14} className={task.priority === 'high' ? 'text-rose-400 mt-0.5' : 'text-blue-400 mt-0.5'} />
                        <div>
                          <p className="font-bold text-zinc-300">{task.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Assigned to: {task.assignedTo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BILLS & PAYMENTS TAB */}
        {activeTab === 'bills' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Facility Operational Bills</h3>
              <span className="text-[10px] font-mono text-zinc-550 border border-zinc-900 bg-zinc-950 px-3 py-1 rounded">Next due: Rent on Jul 15</span>
            </div>

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-550 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="px-8 py-5">Recurring Service</th>
                      <th className="px-6 py-5">Billing Frequency</th>
                      <th className="px-6 py-5">Provider / Account</th>
                      <th className="px-8 py-5 text-right font-mono">Monthly Cost</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {[
                      { service: 'Venue Base Rent', frequency: 'Monthly', provider: 'Palmas Estates LLC', amount: 4200 },
                      { service: 'Electric Utility', frequency: 'Monthly (Sensor variable)', provider: 'TXU Energy', amount: 375 },
                      { service: 'Water & Gas Utility', frequency: 'Monthly (Sensor variable)', provider: 'City Water Dept', amount: 110 },
                      { service: 'Fiber Internet & Security Uplink', frequency: 'Monthly', provider: 'AT&T Business', amount: 89.99 },
                      { service: 'Facility Liability Insurance', frequency: 'Annually (Amortized)', provider: 'Nationwide Business', amount: 1200 },
                      { service: 'Software System: HoneyBook API', frequency: 'Monthly', provider: 'HoneyBook Inc.', amount: 49 },
                      { service: 'Software System: Zoho Mail', frequency: 'Monthly', provider: 'Zoho Workspace', amount: 12 }
                    ].map((bill, idx) => (
                      <tr key={idx} className="hover:bg-zinc-955/20 transition-colors">
                        <td className="px-8 py-5 font-bold text-white">{bill.service}</td>
                        <td className="px-6 py-5 font-mono text-xs text-zinc-500">{bill.frequency}</td>
                        <td className="px-6 py-5 text-zinc-350">{bill.provider}</td>
                        <td className="px-8 py-5 text-right font-mono font-bold text-zinc-300">${bill.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

        {/* MAINTENANCE LOG TAB */}
        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Facility Maintenance Task Log</h3>
              <button
                type="button"
                className="flex items-center gap-2 bg-[#caa24c]/10 hover:bg-[#caa24c]/20 border border-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
              >
                <Plus size={14} /> New Maintenance Ticket
              </button>
            </div>

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="px-8 py-5">Task Details</th>
                      <th className="px-6 py-5">Priority</th>
                      <th className="px-6 py-5">Assigned Technician</th>
                      <th className="px-8 py-5 text-right">Lifecycle Status</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {maintenanceTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-zinc-955/20 transition-colors">
                        <td className="px-8 py-5">
                          <p className="text-xs font-bold text-white leading-none">{task.title}</p>
                          <p className="text-[9px] text-zinc-550 mt-1">Ticket ID: #{task.id}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            task.priority === 'high' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                          }`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-zinc-350">{task.assignedTo}</td>
                        <td className="px-8 py-5 text-right">
                          <span className={`text-[9px] font-bold uppercase tracking-wider border rounded-md px-2 py-0.5 ${
                            task.status === 'open' ? 'border-amber-500/25 bg-amber-500/10 text-amber-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Furniture Inventory */}
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                <Building size={16} /> Furniture Inventory Ledger
              </h3>
              <div className="space-y-4">
                {furnitureCounts.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Asset verification logged</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-sm font-bold text-white">{item.count}</span>
                      <span className="text-xs text-zinc-500"> / {item.target} {item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cleaning & Hospitality Supplies */}
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                <Package size={16} /> Hospitality Supplies Stock
              </h3>
              <div className="space-y-4">
                {suppliesCounts.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Audit: weekly auto-replenish</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                        item.status === 'Low' ? 'border-rose-500/25 bg-rose-500/10 text-rose-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {item.status}
                      </span>
                      <span className="font-mono text-sm font-bold text-white">{item.count} <span className="text-xs text-zinc-500">{item.unit}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PREFERRED VENDORS TAB */}
        {activeTab === 'vendors' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { type: 'DJs & Music', name: 'Dallas Sound Masters', email: 'booking@dallassound.com', phone: '214-555-0102', rating: '5.0 ⭐', insured: true },
              { type: 'Fine Caterers', name: 'Palace Fine Catering', email: 'sales@palacecatering.net', phone: '972-555-0188', rating: '4.9 ⭐', insured: true },
              { type: 'Security Crew', name: 'Atlas Executive Security', email: 'ops@atlasguard.com', phone: '817-555-9000', rating: '4.8 ⭐', insured: true },
              { type: 'Florist Services', name: 'Golden Rose Florist', email: 'info@goldenroseflorals.com', phone: '214-555-1212', rating: '4.7 ⭐', insured: true },
              { type: 'Rentals & Decor', name: 'Grand Gala Rentals', email: 'support@grandgalarentals.com', phone: '972-555-6677', rating: '5.0 ⭐', insured: true },
              { type: 'Valet Service', name: 'Prestige Valet Co.', email: 'valet@prestigedallas.com', phone: '214-555-4300', rating: '4.9 ⭐', insured: true }
            ].map((v, idx) => (
              <div key={idx} className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{v.type}</span>
                    <h4 className="text-sm font-serif text-white mt-1">{v.name}</h4>
                  </div>
                  <span className="text-[10px] font-bold text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded">{v.rating}</span>
                </div>
                <div className="space-y-1 text-xs text-zinc-400">
                  <p className="truncate">Email: {v.email}</p>
                  <p>Phone: {v.phone}</p>
                </div>
                <div className="pt-2 border-t border-zinc-900 flex justify-between items-center text-[10px]">
                  <span className="text-emerald-400 font-bold">COI Active / Verified</span>
                  <span className="text-zinc-550 font-mono">Contract locked</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* UTILITY SENSORS TAB */}
        {activeTab === 'utilities' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                <Zap size={16} /> Electrical Smart Sensor (TXU)
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                  <span className="text-zinc-500">Current load</span>
                  <span className="text-white font-mono font-bold">14.5 kWh</span>
                </div>
                <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                  <span className="text-zinc-500">Previous Bill Total</span>
                  <span className="text-white font-mono font-bold">$387.45</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-500">Alert Threshold Status</span>
                  <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">Optimal</span>
                </div>
              </div>
            </div>

            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                <Droplet size={16} /> Water Sensor (City SmartSensor)
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                  <span className="text-zinc-500">Current usage rate</span>
                  <span className="text-white font-mono font-bold">1.2 GPM</span>
                </div>
                <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                  <span className="text-zinc-500">Previous Bill Total</span>
                  <span className="text-white font-mono font-bold">$105.80</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-500">Spike anomaly monitor</span>
                  <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">No Leaks Detected</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CLEANING TAB */}
        {activeTab === 'cleaning' && (
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-6 max-w-2xl">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Post-Event Cleaning Audit Checklist</h3>
            <div className="space-y-3">
              {[
                'Main lobby mirror buffed and dusted',
                'Bathrooms deep sanitized and soap dispenses refilled',
                'Ballroom flooring vacuumed and damp mopped',
                'Commercial kitchen counters scrubbed and trash bags replaced',
                'Round tables wiped down and stacked/aligned',
                'Outer entrance foyer and parking lot debris checkout'
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                  <input
                    type="checkbox"
                    defaultChecked={idx < 4}
                    className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-zinc-300">{item}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Audit Photo upload</p>
              <div className="border border-dashed border-zinc-900 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-zinc-950/20 transition-all">
                <Upload className="text-zinc-650 mb-2" size={24} />
                <p className="text-xs font-bold text-zinc-400">Upload Before / After Photos</p>
                <p className="text-[9px] text-zinc-600 mt-1">Accepts PNG or JPEG up to 10MB</p>
              </div>
            </div>
          </div>
        )}

        {/* STAFF TAB (FUTURE) */}
        {activeTab === 'staff' && (
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-center max-w-lg">
            <Users size={36} className="text-[#caa24c] mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Employee Scheduling & Rota Portal</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Staff availability management, timesheet submission approvals, and payroll ledger integration will be deployed in Version 2.0.
            </p>
          </div>
        )}
      </div>
    </PortalPageFrame>
  )
}

function StatsCard({
  label,
  value,
  subtitle,
  tone = 'blue'
}: {
  label: string
  value: string
  subtitle: string
  tone?: 'blue' | 'purple' | 'cyan' | 'gold' | 'green'
}) {
  const styles = {
    blue: 'border-blue-500/10 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/10 bg-purple-500/5 text-purple-400',
    cyan: 'border-cyan-500/10 bg-cyan-500/5 text-cyan-400',
    gold: 'border-[#caa24c]/10 bg-[#caa24c]/5 text-[#f1d27a]',
    green: 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400'
  }

  return (
    <div className="luxor-glass-card rounded-xl p-4 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[110px]">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="font-mono text-xl font-bold text-white mt-1.5">{value}</p>
      </div>
      <p className="text-[10px] text-zinc-500 font-medium leading-none mt-3">{subtitle}</p>
    </div>
  )
}
