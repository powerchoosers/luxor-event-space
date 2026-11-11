'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Receipt, ChevronRight } from '@/lib/icons/phosphor-compat'
import BillDetailsPanel from '@/components/portal/BillDetailsPanel'
import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'
import { PortalModal } from '@/components/portal/PortalUI'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

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

  return <div className="flex h-full flex-col">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Receipt size={19} className="text-[#a8792f] dark:text-[#caa24c]" />
        <h3 className="text-sm font-bold text-[color:var(--portal-text)]">Bills to review</h3>
      </div>
      <Link href="/portal/finances?view=bill-review" className="inline-flex items-center gap-1 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">
        View all <ChevronRight size={14} />
      </Link>
    </div>
    {rows.length ? (
      <div className="mt-3.5 space-y-1.5">
        {rows.map((bill) => (
          <button
            key={bill.id}
            type="button"
            onClick={() => setSelectedBillId(bill.id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[color:var(--portal-border)]/60 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{bill.provider}</span>
              <span className="mt-0.5 block truncate text-xs text-[color:var(--portal-muted)]">{bill.service} · {bill.due_date ? `Due ${bill.due_date}` : 'Due date not set'}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-muted)]" />
          </button>
        ))}
      </div>
    ) : (
      <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No open bills to review.</p>
    )}
    <p className="mt-4 text-xs text-[color:var(--portal-muted)]">Open a bill to review it or record a payment through its linked expense.</p>
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
