import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

function isReviewableBill(bill: LuxorBill): boolean {
  if (bill.archived_at || bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate') return false
  const classification = bill.extracted_fields?.classification
  if (typeof classification === 'string' && !['vendor_bill', 'invoice'].includes(classification)) return false
  return true
}

function isRecurringFrequency(value: string | null | undefined): boolean {
  const frequency = (value || '').trim().toLowerCase().replace(/[\s-]+/g, ' ')
  if (/^(weekly|biweekly|bi weekly|monthly|bimonthly|bi monthly|quarterly|semiannual|semi annual|semiannually|semi annually|annual|annually|yearly)$/.test(frequency)) return true
  return /^(?:(?:every|each|per) |once (?:a|per) )(?:week|(?:two|2) weeks|month|(?:two|2) months|quarter|(?:six|6) months|year)$/.test(frequency)
}

/** Suggestions are for review only. They never create a schedule or payment. */
export function suggestsRecurringBill(bill: LuxorBill): boolean {
  if (!isReviewableBill(bill)) return false
  const category = bill.bill_category || bill.extracted_fields?.category_suggestion
  if (typeof category === 'string' && /^(rent|utilities)$/i.test(category.trim())) return true
  if (isRecurringFrequency(bill.frequency)) return true
  return /\b(water|electric(?:ity)?|natural gas|internet|broadband|telecom(?:munications)?|phone|telephone|tv|television|cable|rent|lease|subscription)\b/i.test(`${bill.service || ''} ${bill.provider || ''}`)
}

/** Group display candidates by their recorded name, without linking records. */
export function groupUnlinkedRecurringBills(bills: LuxorBill[], recurringProviderNames: string[] = []) {
  const groups = new Map<string, { name: string; bills: LuxorBill[] }>()
  const keyFor = (bill: LuxorBill) => {
    const name = (bill.provider || '').trim().replace(/\s+/g, ' ')
    return name ? `name:${name.toLocaleLowerCase('en-US')}` : `unknown:${bill.id}`
  }
  const suggestedKeys = new Set(bills.filter((bill) => !bill.vendor_id && suggestsRecurringBill(bill)).map(keyFor))
  for (const name of recurringProviderNames) {
    const normalized = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    if (normalized) suggestedKeys.add(`name:${normalized}`)
  }
  for (const bill of bills) {
    if (bill.vendor_id || !isReviewableBill(bill) || !suggestedKeys.has(keyFor(bill))) continue
    const name = (bill.provider || '').trim().replace(/\s+/g, ' ')
    const key = keyFor(bill)
    const group = groups.get(key) || { name: name || 'Unknown provider', bills: [] }
    group.bills.push(bill)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group, bills: group.bills.sort((a, b) => String(b.received_at || b.created_at || '').localeCompare(String(a.received_at || a.created_at || ''))) }))
}

/** Display unlinked schedules alongside same-name bills without linking either record. */
export function groupUnlinkedRecurringProviders(bills: LuxorBill[], schedules: LuxorExpenseTemplate[], recurringProviderNames: string[] = []) {
  const active = schedules.filter((schedule) => schedule.is_active && !schedule.vendor_id)
  const scheduleNames = active.map((schedule) => schedule.vendor_name || '').filter(Boolean)
  const billGroups = groupUnlinkedRecurringBills(bills, [...recurringProviderNames, ...scheduleNames])
  const groups = new Map(billGroups.map((group) => [group.key, { ...group, schedules: [] as LuxorExpenseTemplate[] }]))
  for (const schedule of active) {
    const name = (schedule.vendor_name || '').trim().replace(/\s+/g, ' ')
    const key = name ? `name:${name.toLocaleLowerCase('en-US')}` : `schedule:${schedule.id}`
    const group = groups.get(key) || { key, name: name || 'Provider not set', bills: [], schedules: [] }
    group.schedules.push(schedule)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** A same-name group may be shown with a single saved provider, never linked automatically. */
export function uniqueSavedProviderForGroup(groupKey: string, vendors: Array<{ id: string; name: string; archived_at?: string | null }>) {
  if (!groupKey.startsWith('name:')) return null
  const matches = vendors.filter((vendor) => !vendor.archived_at && `name:${vendor.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}` === groupKey)
  return matches.length === 1 ? matches[0].id : null
}
