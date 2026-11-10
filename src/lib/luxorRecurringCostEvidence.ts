/** Evidence-based suggestions only; never creates obligations or links an event vendor. */
type Bill = { id: string; provider: string; service: string; frequency?: string | null; due_date: string | null; payment_ready_at?: string | null; extraction_status?: string; duplicate_of_bill_id?: string | null; archived_at?: string | null }
type Expense = { source_bill_id?: string | null; booking_id?: string | null; expense_type?: string; status: string; category: string; recurring_template_id?: string | null }
type Template = { name: string; vendor_name: string | null; is_active: boolean }
export type RecurringCostEvidence = { provider: string; name: string; frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually'; billCount: number; latestDueDate: string; category: string; billIds: string[] }
const norm = (text: string | null | undefined) => (text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
function cycle(value: string | null | undefined): RecurringCostEvidence['frequency'] | null {
  const key = norm(value).replace(/[- ]/g, '')
  if (key === 'weekly') return 'weekly'
  if (key === 'biweekly') return 'biweekly'
  if (key === 'monthly') return 'monthly'
  if (key === 'quarterly') return 'quarterly'
  if (key === 'annually' || key === 'annual' || key === 'yearly') return 'annually'
  return null
}
function day(value: string | null | undefined): string | null {
  const key = (value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const parsed = new Date(`${key}T00:00:00Z`)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === key ? key : null
}
function follows(a: string, b: string, frequency: RecurringCostEvidence['frequency']) {
  const first = new Date(`${a}T00:00:00Z`), second = new Date(`${b}T00:00:00Z`)
  const days = (second.valueOf() - first.valueOf()) / 86400000
  if (frequency === 'weekly' || frequency === 'biweekly') return days === (frequency === 'weekly' ? 7 : 14)
  const months = (second.getUTCFullYear() - first.getUTCFullYear()) * 12 + second.getUTCMonth() - first.getUTCMonth()
  const expected = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12
  const endOfMonth = (date: Date) => date.getUTCDate() === new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate()
  return months === expected && (first.getUTCDate() === second.getUTCDate() || (endOfMonth(first) && endOfMonth(second)))
}
export function recurringCostEvidence(bills: Bill[], expenses: Expense[], templates: Template[]): RecurringCostEvidence[] {
  const groups = new Map<string, { bills: Bill[]; category: string; frequency: RecurringCostEvidence['frequency'] }>()
  const byBill = new Map<string, Expense[]>()
  for (const expense of expenses) {
    if (!expense.source_bill_id || expense.status === 'cancelled') continue
    const matches = byBill.get(expense.source_bill_id) || []
    matches.push(expense); byBill.set(expense.source_bill_id, matches)
  }
  for (const bill of bills) {
    const frequency = cycle(bill.frequency), date = day(bill.due_date)
    if (!frequency || !date || !norm(bill.provider) || !norm(bill.service) || !bill.payment_ready_at || bill.extraction_status !== 'ready' || bill.duplicate_of_bill_id || bill.archived_at) continue
    const matches = byBill.get(bill.id) || []
    if (matches.length !== 1 || matches[0].booking_id || matches[0].expense_type !== 'business' || matches[0].recurring_template_id || !matches[0].category) continue
    const key = JSON.stringify([norm(bill.provider), norm(bill.service), frequency, norm(matches[0].category)])
    const group = groups.get(key) || { bills: [], category: matches[0].category, frequency }
    group.bills.push(bill); groups.set(key, group)
  }
  const result: RecurringCostEvidence[] = []
  for (const group of groups.values()) {
    const sorted = [...group.bills].sort((a, b) => (day(a.due_date) || '').localeCompare(day(b.due_date) || ''))
    if (sorted.length < 3 || sorted.some((bill, index) => index > 0 && !follows(day(sorted[index - 1].due_date)!, day(bill.due_date)!, group.frequency))) continue
    const last = sorted[sorted.length-1]
    if (templates.some((template) => norm(template.name) === norm(last.service) && norm(template.vendor_name) === norm(last.provider))) continue
    result.push({ provider: last.provider, name: last.service, frequency: group.frequency, billCount: sorted.length, latestDueDate: day(last.due_date)!, category: group.category, billIds: sorted.map((bill) => bill.id) })
  }
  return result
}
