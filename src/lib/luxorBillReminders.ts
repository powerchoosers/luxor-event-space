import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import { getBillBalance, type BillExpense } from '@/lib/luxorBillBalances'

export type BillReminderPreference = { bill_id: string; seven_days: boolean; three_days: boolean; due_day: boolean; overdue: boolean }
/** A live view, not a sent notification. One result per bill; no balance is guessed. */
export function billReminders(bills: LuxorBill[], expenses: BillExpense[] | null, preferences: BillReminderPreference[], today: string) {
  const prefs = new Map(preferences.map((item) => [item.bill_id, item]))
  const todayMs = Date.parse(today + 'T00:00:00Z')
  if (!Number.isFinite(todayMs)) return []
  return bills.flatMap((bill) => {
    const p = prefs.get(bill.id), due = bill.due_date
    if (!p || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || bill.status === 'paid' || bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id) return []
    const dueMs = Date.parse(due + 'T00:00:00Z')
    if (!Number.isFinite(dueMs) || new Date(dueMs).toISOString().slice(0,10) !== due) return []
    const balance = getBillBalance(bill, expenses)
    if (balance.remaining === null || balance.remaining <= 0) return []
    const days = Math.round((dueMs - todayMs) / 86400000)
    const enabled = days < 0 ? p.overdue : days === 0 ? p.due_day : (days <= 3 && p.three_days) || (days <= 7 && p.seven_days)
    if (!enabled) return []
    return [{ bill, remaining: balance.remaining, days }]
  }).sort((a,b) => a.days-b.days || a.bill.id.localeCompare(b.bill.id))
}
