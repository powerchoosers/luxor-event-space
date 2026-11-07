import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { authorizeLuxorExpenseRequest, LuxorExpenseRequestError, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'
import type { LuxorExpenseCategory } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'

function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export async function GET() {
  try {
    await authorizeLuxorExpenseRequest()
    const categories = await supabaseRestStrict<LuxorExpenseCategory[]>('luxor_expense_categories?select=*&order=is_system.desc,name.asc,id.asc')
    return NextResponse.json(categories, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense categories could not be loaded:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, member } = await authorizeLuxorExpenseRequest()
    if (member.role !== 'owner' && member.role !== 'admin') throw new LuxorExpenseRequestError('Only administrators can manage expense categories.', 403)
    const body = bodyObject(await request.json())
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 100) : ''
    if (!name) throw new LuxorExpenseRequestError('Enter a category name.')
    const [created] = await supabaseRestStrict<LuxorExpenseCategory[]>('luxor_expense_categories?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, is_system: false, is_active: true, created_by: session.email, updated_by: session.email }),
    })
    if (!created) throw new Error('Expense category was not saved.')
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A category with that name already exists.' }, { status: 409 })
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense category could not be created:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
