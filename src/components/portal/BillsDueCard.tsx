'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { DollarSign, Check, CheckCircle2, Loader2 } from 'lucide-react'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

interface BillsDueCardProps {
  initialBills: LuxorBill[]
}

export function BillsDueCard({ initialBills }: BillsDueCardProps) {
  const [bills, setBills] = useState<LuxorBill[]>(initialBills)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleTogglePaid = async (bill: LuxorBill) => {
    const newStatus = bill.status === 'paid' ? 'unpaid' : 'paid'
    setUpdatingId(bill.id)

    // Optimistic update
    setBills(prev =>
      prev.map(b => (b.id === bill.id ? { ...b, status: newStatus } : b))
    )

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
      alert('Could not update bill status. Please try again.')
    } finally {
      setUpdatingId(null)
    }
  }

  // Determine current date info
  const now = new Date()
  const todayDateStr = now.toISOString().split('T')[0]
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const overdueBills: LuxorBill[] = []
  const dueToday: LuxorBill[] = []
  const dueThisWeek: LuxorBill[] = []
  const dueNextWeek: LuxorBill[] = []

  bills.forEach(bill => {
    if (!bill.due_date) return
    const dueDate = new Date(bill.due_date + 'T00:00:00')
    const diffTime = dueDate.getTime() - todayMidnight.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    if (bill.status !== 'paid' && diffDays < 0) {
      overdueBills.push(bill)
    } else if (diffDays === 0) {
      dueToday.push(bill)
    } else if (diffDays > 0 && diffDays <= 7) {
      dueThisWeek.push(bill)
    } else if (diffDays > 7 && diffDays <= 14) {
      dueNextWeek.push(bill)
    }
  })

  // Also catch any recently marked paid bills that originated from overdue
  const paidOverdueBills = bills.filter(
    b => b.status === 'paid' && b.due_date && b.due_date < todayDateStr
  )

  return (
    <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl h-full">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <DollarSign className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">
              BILLS DUE
            </h3>
          </div>
          <Link
            href="/portal/operations?tab=bills"
            className="text-xs font-bold text-[#caa24c] hover:text-[#b0883b] transition-colors"
          >
            View all →
          </Link>
        </div>

        <div className="space-y-4">
          {/* Overdue Section */}
          {(overdueBills.length > 0 || paidOverdueBills.length > 0) && (
            <div>
              <p className="text-[9px] font-black tracking-widest text-[#b93c3c] mb-2 uppercase flex items-center justify-between">
                <span>LATE / OVERDUE</span>
                {overdueBills.length > 0 && (
                  <span className="text-[9px] font-bold text-red-500/80 lowercase">
                    {overdueBills.length} unpaid
                  </span>
                )}
              </p>
              <div className="space-y-2.5">
                {overdueBills.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between text-xs group py-0.5 rounded transition-colors"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-red-400 font-semibold truncate">
                        {bill.service}
                      </span>
                      {bill.provider && (
                        <span className="text-[10px] text-zinc-500 truncate">
                          {bill.provider}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-red-400 font-bold font-mono">
                        $
                        {Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer disabled:opacity-50"
                        title="Click to mark as paid in Supabase"
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>Mark Paid</span>
                      </button>
                    </div>
                  </div>
                ))}

                {paidOverdueBills.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between text-xs py-0.5 opacity-80"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <span className="text-[color:var(--portal-muted)] line-through truncate font-medium">
                        {bill.service}
                      </span>
                      <span className="text-emerald-500 font-bold text-[8px] tracking-wider px-1 bg-emerald-500/10 rounded">
                        PAID
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[color:var(--portal-muted)] font-mono font-normal">
                        $
                        {Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-zinc-800/60 text-emerald-400 border border-emerald-500/30 hover:bg-zinc-800 transition-all cursor-pointer"
                        title="Click to mark unpaid"
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>Paid</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Due Today */}
          <div>
            <p className="text-[9px] font-black tracking-widest text-[#b93c3c] mb-2 uppercase">
              DUE TODAY
            </p>
            {dueToday.length > 0 ? (
              <div className="space-y-2.5">
                {dueToday.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between text-xs py-0.5"
                  >
                    <span
                      className={`${
                        bill.status === 'paid'
                          ? 'text-[color:var(--portal-muted)]/50 line-through'
                          : 'text-[color:var(--portal-text)]'
                      } font-medium`}
                    >
                      {bill.service}{' '}
                      {bill.status === 'paid' && (
                        <span className="text-emerald-500 font-bold text-[8px] ml-1">
                          (PAID)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`${
                          bill.status === 'paid'
                            ? 'text-[color:var(--portal-muted)]/50 font-normal'
                            : 'text-[color:var(--portal-text)] font-semibold'
                        } font-mono`}
                      >
                        $
                        {Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          bill.status === 'paid'
                            ? 'bg-zinc-800/60 text-emerald-400 border border-emerald-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : bill.status === 'paid' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>{bill.status === 'paid' ? 'Paid' : 'Mark Paid'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[color:var(--portal-muted)] italic">
                No bills due today
              </p>
            )}
          </div>

          {/* Due This Week */}
          <div>
            <p className="text-[9px] font-black tracking-widest text-[#caa24c] mb-2 uppercase">
              DUE THIS WEEK
            </p>
            {dueThisWeek.length > 0 ? (
              <div className="space-y-2.5">
                {dueThisWeek.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between text-xs py-0.5"
                  >
                    <span
                      className={`${
                        bill.status === 'paid'
                          ? 'text-[color:var(--portal-muted)]/50 line-through'
                          : 'text-[color:var(--portal-text)]'
                      } font-medium`}
                    >
                      {bill.service}{' '}
                      {bill.status === 'paid' && (
                        <span className="text-emerald-500 font-bold text-[8px] ml-1">
                          (PAID)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`${
                          bill.status === 'paid'
                            ? 'text-[color:var(--portal-muted)]/50 font-normal'
                            : 'text-[color:var(--portal-text)] font-semibold'
                        } font-mono`}
                      >
                        $
                        {Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          bill.status === 'paid'
                            ? 'bg-zinc-800/60 text-emerald-400 border border-emerald-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : bill.status === 'paid' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>{bill.status === 'paid' ? 'Paid' : 'Mark Paid'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[color:var(--portal-muted)] italic">
                No bills due this week
              </p>
            )}
          </div>

          {/* Due Next Week */}
          <div>
            <p className="text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 mb-2 uppercase">
              DUE NEXT WEEK
            </p>
            {dueNextWeek.length > 0 ? (
              <div className="space-y-2.5">
                {dueNextWeek.map(bill => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between text-xs py-0.5"
                  >
                    <span
                      className={`${
                        bill.status === 'paid'
                          ? 'text-[color:var(--portal-muted)]/50 line-through'
                          : 'text-[color:var(--portal-text)]'
                      } font-medium`}
                    >
                      {bill.service}{' '}
                      {bill.status === 'paid' && (
                        <span className="text-emerald-500 font-bold text-[8px] ml-1">
                          (PAID)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`${
                          bill.status === 'paid'
                            ? 'text-[color:var(--portal-muted)]/50 font-normal'
                            : 'text-[color:var(--portal-text)] font-semibold'
                        } font-mono`}
                      >
                        $
                        {Number(bill.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => handleTogglePaid(bill)}
                        disabled={updatingId === bill.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          bill.status === 'paid'
                            ? 'bg-zinc-800/60 text-emerald-400 border border-emerald-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {updatingId === bill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : bill.status === 'paid' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Check className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>{bill.status === 'paid' ? 'Paid' : 'Mark Paid'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[color:var(--portal-muted)] italic">
                No bills due next week
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
