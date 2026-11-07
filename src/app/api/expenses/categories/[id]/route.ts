import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { authorizeLuxorExpenseRequest, isExpenseUuid, LuxorExpenseRequestError, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'
import type { LuxorExpenseCategory } from '@/lib/luxorExpenseTypes'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session, member } = await authorizeLuxorExpenseRequest()
    if (member.role !== 'owner' && member.role !== 'admin') throw new LuxorExpenseRequestError('Only administrators can manage expense categories.', 403)
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid category.')
    const payload = await request.json().catch(() => null)
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null
    if (!body) throw new LuxorExpenseRequestError('Invalid expense category update.')
    const [current] = await supabaseRestStrict<LuxorExpenseCategory[]>(`luxor_expense_categories?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!current) throw new LuxorExpenseRequestError('Expense category not found.', 404)
    if (current.is_system) throw new LuxorExpenseRequestError('Built-in categories cannot be renamed or deactivated.', 409)

    const patch: Partial<LuxorExpenseCategory> = { updated_by: session.email }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') throw new LuxorExpenseRequestError('Choose an active or inactive category state.')
      patch.is_active = body.is_active
    }
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 100) : ''
      if (!name) throw new LuxorExpenseRequestError('Enter a category name.')
      patch.name = name
    }
    if (Object.keys(patch).length === 1) throw new LuxorExpenseRequestError('Choose a category name or active state to update.')

    const [saved] = await supabaseRestStrict<LuxorExpenseCategory[]>(
      `luxor_expense_categories?select=*&id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) },
    )
    if (!saved) throw new LuxorExpenseRequestError('Expense category not found.', 404)
    return NextResponse.json(saved)
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A category with that name already exists.' }, { status: 409 })
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense category could not be updated:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
