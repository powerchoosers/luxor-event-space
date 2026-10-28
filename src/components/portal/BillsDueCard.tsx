'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Receipt,
  AlertTriangle,
  Clock,
  Check,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

interface BillsDueCardProps {
  initialBills: LuxorBill[]
}

function formatDueDate(isoString: string) {
  try {
    const [y, m, d] = isoString.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
  } catch {
    return isoString
  }
}

function getDaysOverdueLabel(dueStr: string | null) {
  if (!dueStr) return 'Overdue'
  try {
    const [y, m, d] = dueStr.split('-').map(Number)
    const dueDate = new Date(y, m - 1, d)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Due today'
    return `${diffDays}d overdue`
  } catch {
    return 'Overdue'
  }
}

export function BillsDueCard({ initialBills }: BillsDueCardProps) {
  const [bills, setBills] = useState<LuxorBill[]>(initialBills)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [justPaidIds, setJustPaidIds] = useState<string[]>([])

  const handleTogglePaid = async (bill: LuxorBill) => {
    const isCurrentlyPaid = bill.status === 'paid'
    const newStatus = isCurrentlyPaid ? 'unpaid' : 'paid'
    setUpdatingId(bill.id)

    // Optimistic update
    setBills(prev =>
      prev.map(b => (b.id === bill.id ? { ...b, status: newStatus } : b))
    )
    if (newStatus === 'paid') {
      setJustPaidIds(prev => (prev.includes(bill.id) ? prev : [...prev, bill.id]))
    } else {
      setJustPaidIds(prev => prev.filter(id => id !== bill.id))
    }

    try {
      const res = await fetch('/api/operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bill',
          id: bill.id,
          status: newStatus,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to update bill status')
      }

      const updatedBill = await res.json()
      setBills(prev =>
        prev.map(b => (b.id === bill.id ? { ...b, ...updatedBill } : b))
      )
    } catch (err) {
      console.error('Error updating bill status:', err)
      // Revert optimism on error
      setBills(prev =>
        prev.map(b => (b.id === bill.id ? { ...b, status: bill.status } : b))
      )
      if (isCurrentlyPaid) {
        setJustPaidIds(prev => (prev.includes(bill.id) ? prev : [...prev, bill.id]))
      } else {
        setJustPaidIds(prev => prev.filter(id => id !== bill.id))
      }
      alert('Could not update bill status. Please try again.')
    } finally {
      setUpdatingId(null)
    }
  }

  // Partition bills into Overdue and Upcoming, excluding historic paid bills
  const { overdueBills, upcomingBills, paidSessionBills, overdueTotal, upcomingTotal } = useMemo(() => {
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const overdue: LuxorBill[] = []
    const upcoming: LuxorBill[] = []
    const sessionPaid: LuxorBill[] = []

    bills.forEach(bill => {
      // If bill was marked paid in this session, surface it in the session confirmation area
      if (justPaidIds.includes(bill.id)) {
        sessionPaid.push(bill)
        return
      }

      // Ignore historic already-paid bills from appearing in the "Due" widget
      if (bill.status === 'paid') return

      if (!bill.due_date) {
        upcoming.push(bill)
        return
      }

      const [y, m, d] = bill.due_date.split('-').map(Number)
      const dueDate = new Date(y, m - 1, d)
      const diffDays = Math.round((dueDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays < 0) {
        overdue.push(bill)
      } else if (diffDays <= 14) {
        upcoming.push(bill)
      }
    })

    // Sort overdue by oldest first
    overdue.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    // Sort upcoming by soonest first
    upcoming.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))

    const oTotal = overdue.reduce((sum, b) => sum + Number(b.amount || 0), 0)
    const uTotal = upcoming.reduce((sum, b) => sum + Number(b.amount || 0), 0)

    return {
      overdueBills: overdue,
      upcomingBills: upcoming,
      paidSessionBills: sessionPaid,
      overdueTotal: oTotal,
      upcomingTotal: uTotal,
    }
  }, [bills, justPaidIds])

  const hasAnyItems = overdueBills.length > 0 || upcomingBills.length > 0 || paidSessionBills.length > 0

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Receipt className="h-5 w-5 text-[#caa24c] shrink-0" strokeWidth={1.5} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] truncate">
              BILLS DUE
            </h3>
            {overdueBills.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 shrink-0">
                {overdueBills.length} Late
              </span>
            )}
          </div>
          <Link
            href="/portal/operations?tab=bills"
            className="text-xs font-bold text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center gap-1 shrink-0 ml-2"
          >
            View all <ChevronRight size={14} className="translate-y-[0.5px]" />
          </Link>
        </div>

        {/* Card Body */}
        <div className="space-y-3.5">
          {/* Overdue Section */}
          {overdueBills.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-black tracking-widest uppercase text-rose-600 dark:text-rose-400">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="stroke-[2.5]" />
                  Late / Overdue
                </span>
                <span className="tabular-nums font-bold">
                  ${overdueTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="space-y-2">
                {overdueBills.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] dark:bg-rose-500/[0.08] transition-all hover:border-rose-500/35"
                  >
                    <div className="flex flex-col min-w-0 pr-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[color:var(--portal-text)] truncate">
                          {bill.service}
                        </span>
                        <span className="shrink-0 text-[8.5px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                          {getDaysOverdueLabel(bill.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-[color:var(--portal-muted)] truncate">
                        {bill.provider && <span className="truncate">{bill.provider}</span>}
                        {bill.due_date && (
                          <>
                            <span className="opacity-50">·</span>
                            <span>Due {formatDueDate(bill.due_date)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        ${Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Mark as paid in database"
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-700 dark:text-emerald-300" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" strokeWidth={2.5} />
                        )}
                        <span>Mark Paid</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingBills.length > 0 && (
            <div className={`space-y-2 ${overdueBills.length > 0 ? 'pt-2.5 border-t border-[color:var(--portal-border)]/40' : ''}`}>
              <div className="flex items-center justify-between text-[10px] font-black tracking-widest uppercase text-[#caa24c]">
                <span className="flex items-center gap-1.5">
                  <Clock size={12} className="stroke-[2.5]" />
                  Upcoming Due
                </span>
                <span className="tabular-nums font-bold text-[color:var(--portal-muted)]">
                  ${upcomingTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="space-y-2">
                {upcomingBills.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 transition-all"
                  >
                    <div className="flex flex-col min-w-0 pr-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                          {bill.service}
                        </span>
                        <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] border border-[color:var(--portal-border)]">
                          {bill.due_date ? formatDueDate(bill.due_date) : 'Upcoming'}
                        </span>
                      </div>
                      {bill.provider && (
                        <span className="text-[10.5px] text-[color:var(--portal-muted)] truncate mt-0.5">
                          {bill.provider}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-bold text-[color:var(--portal-text)] tabular-nums">
                        ${Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Mark as paid"
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-700 dark:text-emerald-300" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" strokeWidth={2.5} />
                        )}
                        <span>Mark Paid</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty Upcoming Banner when no upcoming bills */}
          {overdueBills.length > 0 && upcomingBills.length === 0 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[color:var(--portal-border)]/50 bg-[color:var(--portal-soft)]/40 text-xs">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-xs text-[color:var(--portal-text)]">No other bills due soon</p>
                <p className="text-[10.5px] text-[color:var(--portal-muted)]">No additional payments due in the next 14 days.</p>
              </div>
            </div>
          )}

          {/* All Current Empty State when no overdue AND no upcoming */}
          {!hasAnyItems && (
            <div className="flex flex-col items-center justify-center py-6 text-center my-auto">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                <CheckCircle2 size={20} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-text)]">
                All Accounts Current
              </p>
              <p className="text-[11px] text-[color:var(--portal-muted)] mt-1 max-w-[220px]">
                No bills due today or in the next 14 days. Review past invoices in Operations.
              </p>
            </div>
          )}

          {/* Marked Paid In Current Session */}
          {paidSessionBills.length > 0 && (
            <div className="space-y-1.5 pt-2.5 border-t border-[color:var(--portal-border)]/40">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Marked Paid This Session
              </span>
              {paidSessionBills.map(bill => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[color:var(--portal-muted)] line-through truncate font-medium text-xs">
                      {bill.service}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                      Paid
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[color:var(--portal-muted)] tabular-nums text-xs">
                      ${Number(bill.amount).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTogglePaid(bill)}
                      disabled={updatingId === bill.id}
                      className="text-[10px] font-bold text-[color:var(--portal-muted)] hover:text-rose-500 underline cursor-pointer ml-1"
                    >
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="mt-5 pt-4 border-t border-[color:var(--portal-border)]/50">
        <Link
          href="/portal/operations?tab=bills"
          className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs"
        >
          View all bills <ChevronRight size={14} className="translate-y-[0.5px]" />
        </Link>
      </div>
    </div>
  )
}
