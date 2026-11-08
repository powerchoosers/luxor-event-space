import type { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'
import type { LuxorInventoryItem, LuxorMaintenanceTask } from '@/app/api/operations/route'

export type LuxorAttentionSignal = {
  id: string
  group: 'Bills' | 'Bill review' | 'Maintenance' | 'Supplies'
  title: string
  detail: string
  href: string
  tone: 'urgent' | 'review' | 'normal'
}

type AttentionData = {
  bills: LuxorBill[]
  billIntakes: LuxorBillIntake[]
  inventory: LuxorInventoryItem[]
  maintenanceTasks: LuxorMaintenanceTask[]
}

function billHref(id: string) {
  return `/portal/operations?tab=bills&bill=${encodeURIComponent(id)}`
}

function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
}

/** Derive attention only from persisted bill, intake, stock, and maintenance states. */
export function getLuxorAttentionSignals({ bills, billIntakes, inventory, maintenanceTasks }: AttentionData): LuxorAttentionSignal[] {
  const signals: LuxorAttentionSignal[] = []
  const today = todayKey()

  for (const bill of bills) {
    if (bill.archived_at) continue
    if (bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id) continue
    if (bill.status === 'overdue' || bill.status === 'unpaid') {
      const due = bill.due_date?.slice(0, 10) || ''
      const pastDue = validDay(due) && due < today
      const status = pastDue ? 'Past due' : 'Unpaid'
      const dueLabel = validDay(due) ? `Due ${due}` : 'No due date recorded'
      const currency = bill.currency?.toUpperCase() || 'USD'
      const amount = bill.amount_state === 'known' && Number.isFinite(Number(bill.amount))
        ? `${currency === 'USD' ? '$' : `${currency} `}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(bill.amount))}`
        : 'Amount not confirmed'
      signals.push({
        id: `bill:${bill.id}`,
        group: 'Bills',
        title: `${bill.provider}: ${bill.service}`,
        detail: `${status} · ${dueLabel} · ${amount}`,
        href: billHref(bill.id),
        tone: pastDue ? 'urgent' : 'normal',
      })
    }
  }

  for (const intake of billIntakes) {
    if (!['failed', 'needs_review', 'duplicate'].includes(intake.status)) continue
    signals.push({
      id: `intake:${intake.id}`,
      group: 'Bill review',
      title: intake.filename,
      detail: intake.status === 'failed' ? 'Bill analysis failed; review or retry.' : intake.status === 'duplicate' ? 'Possible duplicate bill; review before approval.' : 'Bill details need review before approval.',
      href: intake.bill_id ? billHref(intake.bill_id) : '/portal/operations?tab=bills',
      tone: 'review',
    })
  }

  for (const task of maintenanceTasks) {
    if (task.status !== 'pending') continue
    const due = task.due_date ? `Due ${task.due_date}` : 'No due date recorded'
    signals.push({
      id: `maintenance:${task.id}`,
      group: 'Maintenance',
      title: task.title,
      detail: `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority · ${due}`,
      href: '/portal/operations?tab=maintenance',
      tone: task.priority === 'urgent' || task.priority === 'high' ? 'urgent' : 'normal',
    })
  }

  for (const item of inventory) {
    if (item.category !== 'supplies' || !['Low', 'Out of Stock'].includes(item.status)) continue
    signals.push({
      id: `supply:${item.id}`,
      group: 'Supplies',
      title: item.name,
      detail: `${item.status} · ${item.count} ${item.unit} recorded`,
      href: '/portal/operations?tab=inventory',
      tone: item.status === 'Out of Stock' ? 'urgent' : 'review',
    })
  }

  const rank = { urgent: 0, review: 1, normal: 2 }
  return signals.sort((a, b) => rank[a.tone] - rank[b.tone] || a.group.localeCompare(b.group) || a.title.localeCompare(b.title))
}
