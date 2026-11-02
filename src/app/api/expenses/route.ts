import { NextRequest, NextResponse } from 'next/server'
import { supabaseRest, supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'

export type LuxorBookingExpense = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number
  incurred_on: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get('bookingId')

    let path = 'luxor_booking_expenses?select=*&order=incurred_on.desc,created_at.desc,id.asc'
    if (bookingId) {
      path = `luxor_booking_expenses?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=incurred_on.desc,created_at.desc,id.asc`
    }

    if (searchParams.get('strictMetrics') === '1' && !bookingId) {
      const expected = await supabaseRestCount(path)
      const expenses: LuxorBookingExpense[] = []
      for (let offset = 0; offset < expected; offset += 500) {
        const page = await supabaseRestStrict<LuxorBookingExpense[]>(`${path}&limit=500&offset=${offset}`)
        expenses.push(...page)
        if (page.length < Math.min(500, expected - offset)) throw new Error('Expense records could not be fully verified.')
      }
      if (expenses.length !== expected || new Set(expenses.map((expense) => expense.id)).size !== expected || await supabaseRestCount(path) !== expected) {
        throw new Error('Expense records changed while loading. Please refresh.')
      }
      return NextResponse.json(expenses)
    }
    const expenses = await (searchParams.get('strictMetrics') === '1' ? supabaseRestStrict : supabaseRest)(path)
    return NextResponse.json(expenses)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch expenses.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { booking_id, category, description, vendor_name, amount, incurred_on, status, notes } = body

    if (booking_id) {
      const [booking] = await supabaseRest<Array<{ inquiry_id: string | null }>>(`luxor_bookings?select=inquiry_id&id=eq.${encodeURIComponent(String(booking_id))}&limit=1`)
      if (booking?.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    }

    if (!category || !amount) {
      return NextResponse.json({ error: 'Category and Amount are required.' }, { status: 400 })
    }

    const [created] = await supabaseRest<LuxorBookingExpense[]>('luxor_booking_expenses?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: booking_id || null,
        category,
        description: description || null,
        vendor_name: vendor_name || null,
        amount: Number(amount),
        incurred_on: incurred_on || new Date().toISOString().split('T')[0],
        status: status || 'paid',
        notes: notes || null,
        metadata: {},
      }),
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save expense.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
