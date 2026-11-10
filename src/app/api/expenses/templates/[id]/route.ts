import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  generateLuxorExpenseOccurrences,
  getLuxorExpenseCategoryByName,
  isDateKey,
  isExpenseUuid,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
} from '@/lib/luxorExpensesServer'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function money(value: unknown) {
  const amount = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  const cents = Math.round(amount * 100)
  return Number.isFinite(amount) && amount > 0 && Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) <= 1e-6 ? amount : null
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid recurring expense.')
    const [current] = await supabaseRestStrict<LuxorExpenseTemplate[]>(`luxor_expense_templates?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!current) throw new LuxorExpenseRequestError('Recurring expense template not found.', 404)
    const body = objectBody(await request.json())
    if (!body) throw new LuxorExpenseRequestError('Invalid recurring expense update.')
    if (body.expected_updated_at !== undefined && body.expected_updated_at !== current.updated_at) throw new LuxorExpenseRequestError('This schedule changed. Refresh and review it before linking.', 409)

    const patch: Partial<LuxorExpenseTemplate> = { updated_by: session.email }
    if (body.vendor_id !== undefined) {
      const vendorId = body.vendor_id === '' ? null : body.vendor_id
      if (vendorId !== null && vendorId !== current.vendor_id) throw new LuxorExpenseRequestError('Recurring costs are managed separately from event vendors.')
      if (current.vendor_id && current.vendor_id !== vendorId && (body.confirm_provider_change !== true || body.expected_updated_at === undefined)) throw new LuxorExpenseRequestError('Review and confirm the provider change after refreshing this schedule.', 409)
      if (vendorId !== null) {
        if (!isExpenseUuid(vendorId)) throw new LuxorExpenseRequestError('Choose a valid provider.')
        const [provider] = await supabaseRestStrict<Array<{ id: string; name: string; archived_at: string | null }>>(`luxor_vendors?select=id,name,archived_at&id=eq.${encodeURIComponent(vendorId)}&limit=1`)
        if (!provider || provider.archived_at) throw new LuxorExpenseRequestError('Choose an active provider.')
        patch.vendor_id = provider.id
        patch.vendor_name = provider.name
      } else {
        patch.vendor_id = null
      }
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') throw new LuxorExpenseRequestError('Choose an active or inactive template state.')
      patch.is_active = body.is_active
    }
    const editable = ['name', 'category', 'vendor_name', 'expected_amount', 'is_variable', 'frequency', 'custom_interval', 'custom_unit', 'first_due_date', 'start_date', 'end_date', 'payment_method', 'notes']
    const hasTemplateFields = editable.some((key) => body[key] !== undefined)
    if (hasTemplateFields) {
      const merged: Record<string, unknown> = { ...current, ...body }
      const name = clean(merged.name, 200)
      const categoryName = clean(merged.category, 100)
      const isVariable = merged.is_variable === true
      const expectedAmount = isVariable ? null : money(merged.expected_amount)
      const frequency = merged.frequency
      const interval = merged.custom_interval === null || merged.custom_interval === '' ? null : Number(merged.custom_interval)
      const unit = merged.custom_unit === '' ? null : merged.custom_unit
      const firstDueDate = merged.first_due_date
      const startDate = merged.start_date
      const endDate = merged.end_date === '' ? null : merged.end_date
      const paymentMethod = clean(merged.payment_method, 40) || null
      if (!name || !categoryName) throw new LuxorExpenseRequestError('Enter an expense name and category.')
      if (!['weekly','biweekly','monthly','quarterly','annually','custom'].includes(String(frequency))) throw new LuxorExpenseRequestError('Choose a supported recurrence frequency.')
      if (!isDateKey(firstDueDate) || !isDateKey(startDate) || (endDate !== null && !isDateKey(endDate))) throw new LuxorExpenseRequestError('Choose valid recurrence dates.')
      if (endDate && typeof startDate === 'string' && endDate < startDate) throw new LuxorExpenseRequestError('The end date must be on or after the start date.')
      if (!isVariable && expectedAmount === null) throw new LuxorExpenseRequestError('Enter a positive expected amount for fixed expenses.')
      if (isVariable && merged.expected_amount !== null && merged.expected_amount !== '') throw new LuxorExpenseRequestError('Variable expenses must leave expected amount blank.')
      if (frequency === 'custom') {
        if (!Number.isInteger(interval) || Number(interval) < 1 || Number(interval) > 365 || !['days','weeks','months','years'].includes(String(unit))) throw new LuxorExpenseRequestError('Enter a valid custom interval and unit.')
      } else if (interval !== null || unit !== null) throw new LuxorExpenseRequestError('Custom interval details are only used for custom recurrence.')
      if (paymentMethod && !['Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other'].includes(paymentMethod)) throw new LuxorExpenseRequestError('Choose a valid payment method.')
      const category = await getLuxorExpenseCategoryByName(categoryName)
      if (!category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')
      Object.assign(patch, {
        name, category: category.name, category_id: category.id,
        vendor_name: clean(merged.vendor_name, 200) || null,
        is_variable: isVariable, expected_amount: expectedAmount,
        frequency, custom_interval: interval, custom_unit: unit,
        first_due_date: firstDueDate as string, start_date: startDate as string,
        end_date: endDate as string | null,
        payment_method: paymentMethod as LuxorExpenseTemplate['payment_method'],
        notes: clean(merged.notes, 4000) || null,
      })
      const effectiveVendorId = body.vendor_id === undefined ? current.vendor_id : patch.vendor_id
      if (effectiveVendorId) {
        const [provider] = await supabaseRestStrict<Array<{ name: string }>>(`luxor_vendors?select=name&id=eq.${encodeURIComponent(effectiveVendorId)}&limit=1`)
        if (provider) patch.vendor_name = provider.name
      }
    }
    if (Object.keys(patch).length === 1) throw new LuxorExpenseRequestError('Choose template details or active state to update.')

    const providerFence = body.vendor_id !== undefined ? current.vendor_id ? `&vendor_id=eq.${encodeURIComponent(current.vendor_id)}` : '&vendor_id=is.null' : ''
    const versionFence = body.expected_updated_at !== undefined ? `&updated_at=eq.${encodeURIComponent(current.updated_at)}` : ''
    const [saved] = await supabaseRestStrict<LuxorExpenseTemplate[]>(`luxor_expense_templates?select=*&id=eq.${encodeURIComponent(id)}${providerFence}${versionFence}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
    })
    if (!saved) throw new LuxorExpenseRequestError('This schedule changed. Refresh and review it before saving.', 409)
    const generation = saved.is_active && (hasTemplateFields || body.is_active === true) ? await generateLuxorExpenseOccurrences(new Date(), saved.id) : { inserted: 0 }
    return NextResponse.json({ template: saved, generated_count: generation.inserted }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '55000') return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A recurring expense already exists for that billing period.' }, { status: 409 })
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Recurring expense template could not be updated:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
