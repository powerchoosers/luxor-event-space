'use client'

import React, { useEffect, useState } from 'react'
import {
  FileText,
  Search,
  DollarSign,
  TrendingUp,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  RefreshCw,
  Eye,
  Plus
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSelect
} from '@/components/portal/PortalUI'
import type { LuxorInvoice, LuxorBooking, LuxorPayment } from '@/lib/luxorInquiryTypes'

type BookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

type Tab = 'dashboard' | 'invoices' | 'payments' | 'expenses' | 'reports'

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [bookings, setBookings] = useState<BookingWithPayments[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

type LuxorBookingExpense = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number
  incurred_on: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
}

  // Add Expense form state
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState('Supplies')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenses, setExpenses] = useState<LuxorBookingExpense[]>([])

  const fetchFinanceData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [invRes, bookRes, expRes] = await Promise.all([
        fetch('/api/invoices'),
        fetch('/api/bookings'),
        fetch('/api/expenses')
      ])

      if (!invRes.ok || !bookRes.ok || !expRes.ok) throw new Error('Failed to load financial records.')

      const [invData, bookData, expData] = await Promise.all([
        invRes.json(),
        bookRes.json(),
        expRes.json()
      ])

      setInvoices(invData)
      setBookings(bookData)
      setExpenses(expData)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch financial metrics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFinanceData()
  }, [])

  const handleUpdateInvoiceStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        }),
      })

      if (!res.ok) throw new Error('Failed to update invoice status.')
      const updated = await res.json()
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)))
    } catch (err) {
      console.error(err)
      alert('Error updating status.')
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseAmount || !expenseDesc) return
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: expenseCategory,
          amount: Number(expenseAmount),
          description: expenseDesc,
          incurred_on: new Date().toISOString().split('T')[0],
          status: 'paid'
        })
      })

      if (!res.ok) throw new Error('Failed to save expense.')
      const newExp = await res.json()
      setExpenses((prev) => [newExp, ...prev])
      setExpenseDesc('')
      setExpenseAmount('')
      setIsAddingExpense(false)
    } catch (err) {
      console.error(err)
      alert('Error saving expense: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Financial Calculations
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid')
  const netRevenue = paidInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  const outstandingInvoices = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
  const outstandingAR = outstandingInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue')
  const overdueAR = overdueInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
  const monthlyProfit = Math.max(netRevenue - totalExpenses, 0)

  // Payments extraction
  interface RenderPayment {
    id: string
    amount: number
    status: string
    payment_method: string | null
    paid_at: string | null
    notes: string | null
  }

  const bookingPayments: RenderPayment[] = bookings.flatMap((b) => b.payments || []).map(p => ({
    id: p.id,
    amount: Number(p.amount),
    status: p.status,
    payment_method: p.payment_method,
    paid_at: p.paid_at,
    notes: p.notes
  }))

  const invoicePayments: RenderPayment[] = invoices.filter(i => i.status === 'paid').map(i => ({
    id: `inv-${i.id}`,
    amount: Number(i.total),
    status: 'paid',
    payment_method: 'Stripe',
    paid_at: i.paid_at || i.updated_at,
    notes: `Invoice: ${i.client_name}`
  }))

  const allPayments = bookingPayments.concat(invoicePayments)

  // Filter invoices for Invoices tab
  const filteredInvoices = invoices.filter((inv) => {
    return (
      inv.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.event_type && inv.event_type.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<DollarSign size={18} />}
        title="Finances"
        description="Luxor Event Space financial overview, bookkeeping ledgers, invoices, and expense tracking."
        actions={
          <button
            type="button"
            onClick={fetchFinanceData}
            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors"
          >
            <RefreshCw size={13} /> Refresh Ledger
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400 shrink-0">
          Telemetry Alert: {error}
        </div>
      )}

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        <PortalAnimatedTabs
          tabs={[
          { id: 'dashboard', label: 'Finances Dashboard', icon: <TrendingUp size={15} /> },
          { id: 'invoices', label: 'Invoices Ledger', icon: <FileText size={15} /> },
          { id: 'payments', label: 'Payments Log', icon: <CreditCard size={15} /> },
          { id: 'expenses', label: 'Expenses Tracking', icon: <TrendingDown size={15} /> },
          { id: 'reports', label: 'Financial Reports', icon: <Eye size={15} /> },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab as Tab); setSearchTerm('') }}
        />
      </div>

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden">
      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[140px]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Gross Paid Revenue</p>
                  <p className="text-3xl font-extrabold text-white mt-2 font-mono">${netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-4 font-semibold">
                  <ArrowUpRight size={16} /> <span>+{invoices.length} billing items</span>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[140px]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Operational Expenses</p>
                  <p className="text-3xl font-extrabold text-white mt-2 font-mono">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-rose-400 mt-4 font-semibold">
                  <ArrowDownRight size={16} /> <span>-{expenses.length} payments out</span>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[140px]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Monthly Net Profit</p>
                  <p className="text-3xl font-extrabold text-[#f1d27a] mt-2 font-mono">${monthlyProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#caa24c] mt-4 font-semibold">
                  <span>Profit margin: {netRevenue > 0 ? ((monthlyProfit / netRevenue) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            </div>

            {/* Invoicing summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Accounts Receivable</h3>
                <div className="space-y-3 font-mono">
                  <div className="flex justify-between text-xs pb-2 border-b border-zinc-900">
                    <span className="text-zinc-500 font-sans">Outstanding Invoice Value</span>
                    <span className="text-white font-bold">${outstandingAR.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs pb-2 border-b border-zinc-900">
                    <span className="text-zinc-500 font-sans">Overdue Receivables</span>
                    <span className="text-rose-400 font-bold">${overdueAR.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500 font-sans">Unpaid Retainer Deposits</span>
                    <span className="text-[#caa24c] font-bold">$2,500.00</span>
                  </div>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Tax Allocation Preview</h3>
                  <p className="text-xs text-zinc-500 mt-2">
                    Estimated 8.25% sales tax set aside:
                  </p>
                  <p className="text-xl font-mono font-bold text-white mt-2">${(netRevenue * 0.0825).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <p className="text-[10px] text-zinc-600 font-medium">calculated automatically based on paid invoices total.</p>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <PortalTableCard
            controls={
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="relative w-full md:w-96 group">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search invoices by client..."
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-lg pl-10 pr-4 py-2 text-xs text-zinc-350 outline-none focus:border-[#caa24c]/50 transition-all font-mono"
                  />
                </div>
              </div>
            }
            footer={
              <div className="text-[10px] uppercase font-bold text-zinc-550 tracking-widest">
                {filteredInvoices.length} matching invoices
              </div>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="980px">
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                    <th className="px-8 py-5">Invoice ID</th>
                    <th className="px-6 py-5">Client Portfolio</th>
                    <th className="px-6 py-5">Value (USD)</th>
                    <th className="px-6 py-5">Due Date</th>
                    <th className="px-6 py-5">Lifecycle Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-zinc-900/30">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-xs font-bold text-zinc-550 uppercase tracking-widest">Loading records...</td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-xs text-zinc-550">No invoices matching criteria.</td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-zinc-950/20 transition-colors">
                        <td className="px-8 py-5 font-mono text-xs text-zinc-400">#{inv.id.slice(0, 8)}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-white leading-none">{inv.client_name}</p>
                          <p className="text-[10px] text-zinc-500 mt-1">{inv.event_type || 'Quinceañera'}</p>
                        </td>
                        <td className="px-6 py-5 font-mono font-semibold text-zinc-300">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 font-mono text-xs text-zinc-450">{inv.due_date || 'TBD'}</td>
                        <td className="px-6 py-5">
                          <PortalStatusBadge status={inv.status} />
                        </td>
                        <td className="px-8 py-5 text-right">
                          <PortalSelect
                            value={inv.status}
                            onChange={(value) => handleUpdateInvoiceStatus(inv.id, value)}
                            options={[
                              { value: 'draft', label: 'Draft' },
                              { value: 'sent', label: 'Sent' },
                              { value: 'paid', label: 'Mark Paid' },
                              { value: 'overdue', label: 'Mark Overdue' },
                              { value: 'cancelled', label: 'Cancel' }
                            ]}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </PortalStickyTable>
            </div>
          </PortalTableCard>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <PortalTableCard
            controls={
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Historical Revenue Entries ({allPayments.length})</h3>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="900px">
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-zinc-550 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                    <th className="px-8 py-5">Transaction Ref</th>
                    <th className="px-6 py-5">Source Detail</th>
                    <th className="px-6 py-5">Payment Method</th>
                    <th className="px-6 py-5">Paid Date</th>
                    <th className="px-8 py-5 text-right">Settled Amount</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-zinc-900/30">
                  {allPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-xs text-zinc-500">No payment transaction records found.</td>
                    </tr>
                  ) : (
                    allPayments.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-zinc-950/20 transition-colors">
                        <td className="px-8 py-5 font-mono text-xs text-zinc-400">#{p.id?.slice(0, 10) || `TX-00${idx}`}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-white leading-none">{p.notes || 'Event Booking Retainer'}</p>
                          <p className="text-[9px] text-[#caa24c] font-bold uppercase tracking-widest mt-1">Settled</p>
                        </td>
                        <td className="px-6 py-5 text-xs text-zinc-450 font-medium">{p.payment_method || 'Bank Transfer'}</td>
                        <td className="px-6 py-5 font-mono text-xs text-zinc-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-8 py-5 text-right font-mono font-bold text-emerald-400">+${Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </PortalStickyTable>
            </div>
          </PortalTableCard>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Operations Expense Ledger</h3>
              <button
                type="button"
                onClick={() => setIsAddingExpense(!isAddingExpense)}
                className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/25 hover:bg-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
              >
                <Plus size={14} /> Log Operational Cost
              </button>
            </div>

            {isAddingExpense && (
              <form onSubmit={handleAddExpense} className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 max-w-md">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white">Log Operational Expense</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-500">Category</label>
                    <PortalSelect
                      value={expenseCategory}
                      onChange={setExpenseCategory}
                      options={[
                        { value: 'Rent', label: 'Rent / Venue Lease' },
                        { value: 'Maintenance', label: 'Maintenance / Repairs' },
                        { value: 'Utilities', label: 'Utilities (Electric/Water)' },
                        { value: 'Supplies', label: 'Cleaning & Hospitality Supplies' },
                        { value: 'Marketing', label: 'Marketing & Ad Spend' }
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-500">Cost (USD)</label>
                    <input
                      type="number"
                      required
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="120.00"
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-500">Description</label>
                    <input
                      type="text"
                      required
                      value={expenseDesc}
                      onChange={(e) => setExpenseDesc(e.target.value)}
                      placeholder="HVAC Air Filter replacement..."
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setIsAddingExpense(false)} className="px-3 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all">Save Cost</button>
                </div>
              </form>
            )}

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-550 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="px-8 py-5">Date</th>
                      <th className="px-6 py-5">Description</th>
                      <th className="px-6 py-5">Category</th>
                      <th className="px-8 py-5 text-right">Debit (USD)</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-zinc-950/20 transition-colors">
                        <td className="px-8 py-5 font-mono text-xs text-zinc-500">
                          {exp.incurred_on ? new Date(exp.incurred_on).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-5 font-bold text-white">
                          {exp.description || 'General Operational Expense'}
                        </td>
                        <td className="px-6 py-5 font-mono font-bold uppercase tracking-widest text-[9px] text-[#caa24c]/85">{exp.category}</td>
                        <td className="px-8 py-5 text-right font-mono font-bold text-rose-400">
                          -${Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
            <div className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Monthly Revenue Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Revenue Channels</h4>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Ballroom Rentals</span>
                      <span className="font-mono text-zinc-400">82% (${(netRevenue * 0.82).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-[#caa24c] w-[82%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Hospitality & Bar Packages</span>
                      <span className="font-mono text-zinc-400">12% (${(netRevenue * 0.12).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[12%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Audio/Visual Add-ons</span>
                      <span className="font-mono text-zinc-400">6% (${(netRevenue * 0.06).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-[6%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Expenses Breakdown</h4>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Venue Rent & Security</span>
                      <span className="font-mono text-zinc-400">78% (${(totalExpenses * 0.78).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 w-[78%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Maintenance & Cleaning</span>
                      <span className="font-mono text-zinc-400">12% (${(totalExpenses * 0.12).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[12%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-bold mb-1.5">
                      <span className="text-white">Marketing & Supplies</span>
                      <span className="font-mono text-zinc-400">10% (${(totalExpenses * 0.10).toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 w-[10%]" />
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}
      </PortalTabTransition>
    </PortalPageFrame>
  )
}
