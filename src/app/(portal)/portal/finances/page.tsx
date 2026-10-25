'use client'

import React, { useEffect, useState, useMemo, useDeferredValue } from 'react'
import Link from 'next/link'
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
  PortalSelect,
  PortalButton,
  PortalTableSkeleton,
  PortalStaggerGroup,
  PortalStaggerCard
} from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
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

  // Financial Calculations (Memoized for high performance)
  const paidInvoices = useMemo(() => invoices.filter((inv) => inv.status === 'paid'), [invoices])
  const netRevenue = useMemo(() => paidInvoices.reduce((acc, inv) => acc + Number(inv.total), 0), [paidInvoices])

  const outstandingInvoices = useMemo(() => invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue'), [invoices])
  const outstandingAR = useMemo(() => outstandingInvoices.reduce((acc, inv) => acc + Number(inv.total), 0), [outstandingInvoices])

  const overdueInvoices = useMemo(() => invoices.filter((inv) => inv.status === 'overdue'), [invoices])
  const overdueAR = useMemo(() => overdueInvoices.reduce((acc, inv) => acc + Number(inv.total), 0), [overdueInvoices])
  const unpaidRetainers = useMemo(() => bookings.reduce((sum, booking) => sum + Math.max(Number(booking.deposit_required || 0) - Number(booking.paid_total || 0), 0), 0), [bookings])

  const totalExpenses = useMemo(() => expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0), [expenses])
  const monthlyProfit = useMemo(() => Math.max(netRevenue - totalExpenses, 0), [netRevenue, totalExpenses])

  // Payments extraction
  interface RenderPayment {
    id: string
    amount: number
    status: string
    payment_method: string | null
    paid_at: string | null
    notes: string | null
  }

  const bookingPayments: RenderPayment[] = useMemo(() => bookings.flatMap((b) => b.payments || []).map(p => ({
    id: p.id,
    amount: Number(p.amount),
    status: p.status,
    payment_method: p.payment_method,
    paid_at: p.paid_at,
    notes: p.notes
  })), [bookings])

  const invoicePayments: RenderPayment[] = invoices.filter(i => i.status === 'paid').map(i => ({
    id: `inv-${i.id}`,
    amount: Number(i.total),
    status: 'paid',
    payment_method: 'Recorded invoice payment',
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
        actions={
          <PortalButton onClick={fetchFinanceData}>
            <RefreshCw size={13} /> Refresh Ledger
          </PortalButton>
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
            <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 flex flex-col justify-between min-h-[154px] h-full">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Gross Paid Revenue</p>
                    <p className="text-3xl font-extrabold text-[color:var(--portal-text)] mt-2 tabular-nums tracking-tight">${netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700"
                        style={{ width: `${netRevenue + outstandingAR > 0 ? Math.max(8, Math.min(100, (netRevenue / (netRevenue + outstandingAR)) * 100)) : 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 mt-4 font-bold tabular-nums">
                    <ArrowUpRight size={16} /> <span>+{invoices.length} billing items</span>
                  </div>
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 flex flex-col justify-between min-h-[154px] h-full">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Operational Expenses</p>
                    <p className="text-3xl font-extrabold text-[color:var(--portal-text)] mt-2 tabular-nums tracking-tight">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-700"
                        style={{ width: `${netRevenue > 0 ? Math.max(6, Math.min(100, (totalExpenses / netRevenue) * 100)) : 20}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 mt-4 font-bold tabular-nums">
                    <ArrowDownRight size={16} /> <span>-{expenses.length} payments out</span>
                  </div>
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="relative rounded-2xl p-6 flex flex-row items-center justify-between gap-4 min-h-[154px] h-full">
                  <BorderBeam size={95} duration={10} borderWidth={1.2} />
                  <div className="min-w-0 flex-1 pr-2 flex flex-col justify-between h-full">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Monthly Net Profit</p>
                      <p className="text-3xl font-extrabold text-[#a37d2c] dark:text-[#f1d27a] mt-2 tabular-nums tracking-tight">${monthlyProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#a37d2c] dark:text-[#caa24c] mt-4 font-bold tabular-nums">
                      <span>Profit margin: {netRevenue > 0 ? ((monthlyProfit / netRevenue) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                  <div className="ml-auto shrink-0">
                    <AnimatedCircularProgressBar
                      value={netRevenue > 0 ? (monthlyProfit / netRevenue) * 100 : 0}
                      size={58}
                      strokeWidth={5}
                      gaugePrimaryColor="#caa24c"
                      subLabel="Margin"
                    />
                  </div>
                </MagicCard>
              </PortalStaggerCard>
            </PortalStaggerGroup>

            {/* Invoicing summary */}
            <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-6" staggerDelay={0.07}>
              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 space-y-4 h-full">
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Accounts Receivable</h3>
                  <div className="space-y-3.5">
                    <div className="space-y-1.5 pb-2.5 border-b border-[color:var(--portal-border)]/60">
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--portal-muted)] font-medium">Outstanding Invoice Value</span>
                        <span className="text-[color:var(--portal-text)] font-bold tabular-nums">${outstandingAR.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)]/50 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#b8892e] to-[#e2c16b]" style={{ width: `${outstandingAR > 0 ? 75 : 6}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1.5 pb-2.5 border-b border-[color:var(--portal-border)]/60">
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--portal-muted)] font-medium">Overdue Receivables</span>
                        <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">${overdueAR.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)]/50 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400" style={{ width: `${outstandingAR > 0 ? Math.max(4, Math.min(100, (overdueAR / outstandingAR) * 100)) : 4}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-[color:var(--portal-muted)] font-medium">Unpaid Retainer Deposits</span>
                      <span className="text-[#a37d2c] dark:text-[#caa24c] font-bold tabular-nums">${unpaidRetainers.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 space-y-4 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Tax Allocation Preview</h3>
                    <p className="text-xs text-[color:var(--portal-muted)] mt-2">
                      Estimated 8.25% sales tax set aside:
                    </p>
                    <p className="text-2xl tabular-nums font-extrabold tracking-tight text-[color:var(--portal-text)] mt-2">${(netRevenue * 0.0825).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#b8892e] to-[#e2c16b]" style={{ width: '8.25%' }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-[color:var(--portal-muted)] font-medium">Calculated automatically based on paid invoices total.</p>
                </MagicCard>
              </PortalStaggerCard>
            </PortalStaggerGroup>
          </div>
        </div>
      )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <PortalTableCard
            controls={
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="relative w-full md:w-96 group">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search invoices by client..."
                    className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-lg pl-10 pr-4 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 transition-all"
                  />
                </div>
              </div>
            }
            footer={
              <div className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-widest tabular-nums">
                {filteredInvoices.length} matching invoices
              </div>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="980px">
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                    <th className="px-8 py-5">Invoice ID</th>
                    <th className="px-6 py-5">Client Portfolio</th>
                    <th className="px-6 py-5">Value (USD)</th>
                    <th className="px-6 py-5">Due Date</th>
                    <th className="px-6 py-5">Lifecycle Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                  {loading ? (
                    <PortalTableSkeleton cols={6} rows={5} />
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-xs text-[color:var(--portal-muted)]">No invoices matching criteria.</td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{inv.id.slice(0, 8)}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-[color:var(--portal-text)] leading-none">{inv.client_name}</p>
                          <p className="text-[10px] text-[color:var(--portal-muted)] mt-1">{inv.event_type || 'Quinceañera'}</p>
                        </td>
                        <td className="px-6 py-5 tabular-nums font-bold text-[color:var(--portal-text)]">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{inv.due_date || 'TBD'}</td>
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
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)] tabular-nums">Historical Revenue Entries ({allPayments.length})</h3>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="900px">
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                    <th className="px-8 py-5">Transaction Ref</th>
                    <th className="px-6 py-5">Source Detail</th>
                    <th className="px-6 py-5">Payment Method</th>
                    <th className="px-6 py-5">Paid Date</th>
                    <th className="px-8 py-5 text-right">Settled Amount</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                  {allPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-xs text-[color:var(--portal-muted)]">No payment transaction records found.</td>
                    </tr>
                  ) : (
                    allPayments.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{p.id?.slice(0, 10) || `TX-00${idx}`}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-[color:var(--portal-text)] leading-none">{p.notes || 'Event Booking Retainer'}</p>
                          <p className="text-[9px] text-[#caa24c] font-bold uppercase tracking-widest mt-1">Settled</p>
                        </td>
                        <td className="px-6 py-5 text-xs text-[color:var(--portal-muted)] font-medium">{p.payment_method || 'Bank Transfer'}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-8 py-5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">+${Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Operations Expense Ledger</h3>
              <button
                type="button"
                onClick={() => setIsAddingExpense(!isAddingExpense)}
                className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/30 hover:bg-[#caa24c]/25 text-[#a37d2c] dark:text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
              >
                <Plus size={14} /> Log Operational Cost
              </button>
            </div>

            {isAddingExpense && (
              <form onSubmit={handleAddExpense} className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 max-w-md">
                <h4 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Log Operational Expense</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Category</label>
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
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Cost (USD)</label>
                    <input
                      type="number"
                      required
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="120.00"
                      className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Description</label>
                    <input
                      type="text"
                      required
                      value={expenseDesc}
                      onChange={(e) => setExpenseDesc(e.target.value)}
                      placeholder="HVAC Air Filter replacement..."
                      className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setIsAddingExpense(false)} className="px-3 py-2 border border-transparent text-xs font-bold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-[#caa24c] hover:bg-[#b58d3b] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all">Save Cost</button>
                </div>
              </form>
            )}

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                      <th className="px-8 py-5">Date</th>
                      <th className="px-6 py-5">Description</th>
                      <th className="px-6 py-5">Category</th>
                      <th className="px-8 py-5 text-right">Debit (USD)</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">
                          {exp.incurred_on ? new Date(exp.incurred_on).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-5 font-bold text-[color:var(--portal-text)]">
                          {exp.description || 'General Operational Expense'}
                        </td>
                        <td className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-[#a37d2c] dark:text-[#caa24c]">{exp.category}</td>
                        <td className="px-8 py-5 text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
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
            <MagicCard className="rounded-2xl p-6">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Live Business Reports</h3>
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-[color:var(--portal-muted)]">The previous category percentages were estimates presented as facts. The Business Reports page now calculates revenue, conversion, booking value, event types, expenses, and outstanding invoices from saved records.</p>
              <Link href="/portal/reports" className="mt-5 inline-flex rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/15 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a37d2c] dark:text-[#f1d27a]">Open live reports</Link>
            </MagicCard>
          </div>
        )}
      </PortalTabTransition>
    </PortalPageFrame>
  )
}
