import 'server-only'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'
import { isLuxorBillCategory } from '@/lib/luxorBillCategories'
import { generateLuxorExpenseOccurrences, getLuxorExpenseCategoryByName, isDateKey, luxorTodayDateKey } from '@/lib/luxorExpensesServer'
import { suggestsRecurringBill, utilityRecurringFrequency } from '@/lib/luxorRecurringBillSuggestion'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const AUTOMATION_ACTOR = 'utility-recurring-automation'

function normalizeProvider(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function scheduleCategory(bill: LuxorBill) {
  const suggested = bill.bill_category || (typeof bill.extracted_fields?.category_suggestion === 'string' ? bill.extracted_fields.category_suggestion : '')
  if (isLuxorBillCategory(suggested)) return suggested
  if (/\b(rent|lease)\b/i.test(`${bill.service || ''} ${bill.provider || ''}`)) return 'Rent' as const
  return 'Utilities' as const
}

function scheduleName(bill: LuxorBill) {
  const service = (bill.service || '').trim().replace(/\s+/g, ' ')
  const provider = (bill.provider || '').trim().replace(/\s+/g, ' ')
  if (service && provider && !service.toLocaleLowerCase('en-US').includes(provider.toLocaleLowerCase('en-US'))) return service
  if (service) return service
  if (provider) return `${provider} service`
  return 'Recurring utility'
}

function scheduleStartDate(bill: LuxorBill) {
  for (const candidate of [bill.due_date, bill.billing_period_end, bill.issue_date, bill.received_at?.slice(0, 10)]) {
    if (isDateKey(candidate)) return candidate
  }
  return luxorTodayDateKey()
}

async function findActiveTemplateForBill(bill: LuxorBill): Promise<LuxorExpenseTemplate | null> {
  const provider = (bill.provider || '').trim()
  if (!provider) return null
  const rows = await supabaseRestStrict<LuxorExpenseTemplate[]>(
    `luxor_expense_templates?select=*&is_active=eq.true&vendor_name=ilike.${encodeURIComponent(provider)}&order=created_at.desc&limit=5`,
  )
  const key = normalizeProvider(provider)
  return rows.find((row) => normalizeProvider(row.vendor_name) === key) || null
}

/** Creates a recurring cost schedule for obvious utilities on first emailed invoice; idempotent per vendor name. */
export async function ensureUtilityRecurringScheduleFromBill(bill: LuxorBill): Promise<{ created: boolean; templateId: string | null }> {
  if (!suggestsRecurringBill(bill)) return { created: false, templateId: null }
  const provider = (bill.provider || '').trim()
  if (!provider) return { created: false, templateId: null }

  const existing = await findActiveTemplateForBill(bill)
  if (existing) return { created: false, templateId: existing.id }

  const categoryName = scheduleCategory(bill)
  const category = await getLuxorExpenseCategoryByName(categoryName)
  if (!category?.is_active) return { created: false, templateId: null }

  const startDate = scheduleStartDate(bill)
  const [created] = await supabaseRestStrict<LuxorExpenseTemplate[]>('luxor_expense_templates?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: scheduleName(bill),
      category: categoryName,
      category_id: category.id,
      vendor_name: provider,
      vendor_id: bill.vendor_id || null,
      is_variable: true,
      expected_amount: null,
      frequency: utilityRecurringFrequency(bill),
      custom_interval: null,
      custom_unit: null,
      first_due_date: startDate,
      start_date: startDate,
      end_date: null,
      payment_method: null,
      notes: 'Created automatically from an emailed utility or subscription invoice.',
      is_active: true,
      created_by: AUTOMATION_ACTOR,
      updated_by: AUTOMATION_ACTOR,
    }),
  })
  if (!created) return { created: false, templateId: null }
  await generateLuxorExpenseOccurrences(new Date(), created.id).catch(() => undefined)
  return { created: true, templateId: created.id }
}

/** After bill approval, attach the invoice to the matching recurring profile when one exists. */
export async function linkApprovedUtilityBillToSchedule(bill: LuxorBill, actor: string) {
  if (!suggestsRecurringBill(bill)) return
  if (bill.archived_at || bill.duplicate_of_bill_id || bill.extraction_status !== 'ready' || !bill.payment_ready_at) return
  let template = await findActiveTemplateForBill(bill)
  if (!template) {
    const ensured = await ensureUtilityRecurringScheduleFromBill(bill)
    if (!ensured.templateId) return
    template = (await supabaseRestStrict<LuxorExpenseTemplate[]>(`luxor_expense_templates?select=*&id=eq.${encodeURIComponent(ensured.templateId)}&limit=1`))[0] || null
    if (!template) return
  }
  const fresh = await supabaseRestStrict<LuxorExpenseTemplate[]>(`luxor_expense_templates?select=id,updated_at,is_active&id=eq.${encodeURIComponent(template.id)}&limit=1`)
  const currentTemplate = fresh[0]
  const currentBill = (await supabaseRestStrict<LuxorBill[]>(`luxor_bills?select=id,updated_at&id=eq.${encodeURIComponent(bill.id)}&limit=1`))[0]
  if (!currentTemplate?.is_active || !currentBill) return
  const linkActor = actor.trim() || AUTOMATION_ACTOR
  await supabaseRestStrict('rpc/luxor_confirm_recurring_profile_bill', {
    method: 'POST',
    body: JSON.stringify({
      p_template_id: currentTemplate.id,
      p_bill_id: currentBill.id,
      p_template_updated_at: currentTemplate.updated_at,
      p_bill_updated_at: currentBill.updated_at,
      p_actor: linkActor,
    }),
  }).catch(() => undefined)
}
