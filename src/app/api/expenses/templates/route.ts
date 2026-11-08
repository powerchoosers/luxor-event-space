import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  generateLuxorExpenseOccurrences,
  getLuxorExpenseCategoryByName,
  isDateKey,
  LUXOR_EXPENSE_PAYMENT_METHODS,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
} from '@/lib/luxorExpensesServer'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function amount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  const cents = Math.round(parsed * 100)
  return Number.isFinite(parsed) && parsed > 0 && Number.isSafeInteger(cents) && Math.abs(parsed * 100 - cents) <= 1e-6 ? parsed : null
}

function validation(input: Record<string, unknown>) {
  const name = text(input.name, 200)
  const category = text(input.category, 100)
  const vendorName = text(input.vendor_name, 200) || null
  const isVariable = input.is_variable === true
  const expectedAmount = isVariable ? null : amount(input.expected_amount)
  const frequency = input.frequency
  const customInterval = input.custom_interval == null || input.custom_interval === '' ? null : Number(input.custom_interval)
  const customUnit = input.custom_unit == null || input.custom_unit === '' ? null : input.custom_unit
  const firstDueDate = input.first_due_date
  const startDate = input.start_date
  const endDate = input.end_date == null || input.end_date === '' ? null : input.end_date
  const paymentMethod = text(input.payment_method, 40) || null

  if (!name) throw new LuxorExpenseRequestError('Enter an expense name.')
  if (!category) throw new LuxorExpenseRequestError('Choose an expense category.')
  if (!['weekly','biweekly','monthly','quarterly','annually','custom'].includes(String(frequency))) throw new LuxorExpenseRequestError('Choose a supported recurrence frequency.')
  if (!isDateKey(firstDueDate) || !isDateKey(startDate)) throw new LuxorExpenseRequestError('Choose a valid first due date and start date.')
  if (endDate !== null && !isDateKey(endDate)) throw new LuxorExpenseRequestError('Choose a valid end date.')
  if (endDate && endDate < startDate) throw new LuxorExpenseRequestError('The end date must be on or after the start date.')
  if (!isVariable && expectedAmount === null) throw new LuxorExpenseRequestError('Enter the fixed expected amount.')
  if (isVariable && input.expected_amount != null && input.expected_amount !== '') throw new LuxorExpenseRequestError('Variable expenses must leave expected amount blank.')
  if (frequency === 'custom') {
    if (!Number.isInteger(customInterval) || Number(customInterval) < 1 || Number(customInterval) > 365
      || !['days','weeks','months','years'].includes(String(customUnit))) {
      throw new LuxorExpenseRequestError('Enter a valid custom interval and unit.')
    }
  } else if (customInterval !== null || customUnit !== null) {
    throw new LuxorExpenseRequestError('Custom interval details are only used for custom recurrence.')
  }
  if (paymentMethod && !LUXOR_EXPENSE_PAYMENT_METHODS.includes(paymentMethod as typeof LUXOR_EXPENSE_PAYMENT_METHODS[number])) {
    throw new LuxorExpenseRequestError('Choose a valid expected payment method.')
  }
  return {
    name,
    category,
    vendor_name: vendorName,
    is_variable: isVariable,
    expected_amount: expectedAmount,
    frequency,
    custom_interval: customInterval,
    custom_unit: customUnit,
    first_due_date: firstDueDate,
    start_date: startDate,
    end_date: endDate,
    payment_method: paymentMethod,
    notes: text(input.notes, 4000) || null,
  }
}

export async function GET() {
  try {
    await authorizeLuxorExpenseRequest()
    const templates = await supabaseRestStrict<LuxorExpenseTemplate[]>('luxor_expense_templates?select=*&order=is_active.desc,first_due_date.asc,name.asc,id.asc')
    return NextResponse.json(templates, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Recurring expenses could not be loaded:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const payload = record(await request.json())
    if (!payload) throw new LuxorExpenseRequestError('Invalid recurring expense template.')
    const fields = validation(payload)
    const category = await getLuxorExpenseCategoryByName(fields.category)
    if (!category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')
    const [created] = await supabaseRestStrict<LuxorExpenseTemplate[]>('luxor_expense_templates?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, category_id: category.id, created_by: session.email, updated_by: session.email }),
    })
    if (!created) throw new Error('Recurring expense template was not saved.')
    const generation = await generateLuxorExpenseOccurrences(new Date(), created.id)
    return NextResponse.json({ template: created, generated_count: generation.inserted }, { status: 201 })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Recurring expense template could not be saved:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
