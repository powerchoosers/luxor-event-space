'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Receipt, ChevronRight } from '@/lib/icons/phosphor-compat'
import BillDetailsPanel from '@/components/portal/BillDetailsPanel'
import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'
import { PortalModal } from '@/components/portal/PortalUI'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

function formatBillDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Due date not set'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim())
  if (!match) return `Due ${dateStr}`
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  if (Number.isNaN(date.getTime())) return `Due ${dateStr}`
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
  return `Due ${formatted}`
}

function formatBillAmount(bill: LuxorBill): string | null {
  if (bill.amount_state === 'unknown') return null
  if (bill.amount_state === 'variable') return 'Variable'
  const amount = Number(bill.amount)
  if (bill.amount_state !== 'known' || !Number.isFinite(amount) || amount < 0) return null
  return amount.toLocaleString('en-US', { style: 'currency', currency: bill.currency || 'USD' })
}

/** A reminder list only: the linked expense ledger is authoritative for balances. */
export function BillsDueCard({ initialBills }: { initialBills: LuxorBill[] }) {
  const router = useRouter()
  const [bills, setBills] = useState(initialBills)
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null)
  const [expenseId, setExpenseId] = useState<string | null>(null)
  const [importBillId, setImportBillId] = useState<string | null>(null)
  const [billRefresh, setBillRefresh] = useState(0)

  useEffect(() => {
    setBills(initialBills)
  }, [initialBills])

  const open = bills.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const rows = open.slice(0, 5)

  function handleBillChanged(updated: LuxorBill) {
    setBills((current) => current.map((item) => item.id === updated.id ? updated : item))
    router.refresh()
  }

  function handleExpenseClosed() {
    setExpenseId(null)
    setBillRefresh((value) => value + 1)
    router.refresh()
  }

  const selectedBill = bills.find((b) => b.id === selectedBillId) || null
  const todayIso = new Date().toISOString().slice(0, 10)

  return <div className="flex h-full flex-col justify-between">
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Receipt size={19} className="text-[#caa24c] shrink-0" strokeWidth={1.5} />
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Bills to review</h3>
          {open.length > 0 && (
            <span className="rounded-full bg-[#caa24c]/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#8f641e] dark:text-[#dfbd68]">
              {open.length}
            </span>
          )}
        </div>
        <Link href="/portal/finances?view=bill-review" className="inline-flex items-center gap-1 text-xs font-bold text-[#caa24c] transition-colors hover:text-[#b0883b]">
          View all <ChevronRight size={14} className="translate-y-[0.5px]" />
        </Link>
      </div>
      {rows.length ? (
        <div className="divide-y divide-[color:var(--portal-border)]/40">
          {rows.map((bill) => {
            const amountLabel = formatBillAmount(bill)
            const isOverdue = Boolean(bill.due_date && bill.due_date < todayIso)
            const isDueToday = Boolean(bill.due_date && bill.due_date === todayIso)
            return (
              <button
                key={bill.id}
                type="button"
                onClick={() => setSelectedBillId(bill.id)}
                className="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[color:var(--portal-soft)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[color:var(--portal-text)] group-hover:text-[#9a6e25] dark:group-hover:text-[#dfbd68] transition-colors">
                    {bill.provider}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[color:var(--portal-muted)] tabular-nums">
                    {bill.service} · {formatBillDueDate(bill.due_date)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {amountLabel && (
                    <span className="text-xs font-bold tabular-nums text-[color:var(--portal-text)]">
                      {amountLabel}
                    </span>
                  )}
                  {isOverdue ? (
                    <span className="rounded-md border border-red-200/70 bg-red-50/90 px-2 py-0.5 text-[10px] font-semibold text-[#b93c3c] dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                      Overdue
                    </span>
                  ) : isDueToday ? (
                    <span className="rounded-md border border-amber-200/70 bg-amber-50/90 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                      Due today
                    </span>
                  ) : null}
                  <ChevronRight size={15} className="shrink-0 text-[color:var(--portal-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[#caa24c]" />
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-[color:var(--portal-muted)]">No open bills to review.</p>
      )}
    </div>
    <div className="mt-4 pt-3 border-t border-[color:var(--portal-border)]/50 flex items-center justify-between gap-2">
      <p className="text-[11px] text-[color:var(--portal-muted)]">Select a bill to review details or record a linked expense payment.</p>
    </div>
    {selectedBillId ? (
      <BillDetailsPanel
        billId={selectedBillId}
        initialBill={selectedBill}
        refreshKey={billRefresh}
        onClose={() => setSelectedBillId(null)}
        onBillChanged={handleBillChanged}
        onOpenExpense={setExpenseId}
        onCreateExpense={setImportBillId}
      />
    ) : null}
    {importBillId ? <ExpenseManagement key={importBillId} view="business" embedded panelOnly initialBillId={importBillId} onBack={() => { setImportBillId(null); setBillRefresh((value) => value + 1); router.refresh() }} /> : null}
    <PortalModal isOpen={Boolean(expenseId)} onClose={handleExpenseClosed} title="Expense & payments" sidePanel headerBack animateClose maxWidth="max-w-[600px]">
      {expenseId ? <ExpenseManagement view="detail" expenseId={expenseId} embedded onBack={handleExpenseClosed} onOpenBill={(id) => { setExpenseId(null); setBillRefresh((value) => value + 1); setSelectedBillId(id) }} /> : null}
    </PortalModal>
  </div>
}
