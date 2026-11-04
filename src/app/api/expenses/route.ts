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
    const bookingId = typeof booking_id === 'string' ? booking_id.trim() : ''
    const cleanCategory = typeof category === 'string' ? category.trim() : ''
    const numericAmount = Number(amount)
    const expenseStatus = status ?? 'incurred'
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) {
      return NextResponse.json({ error: 'Choose a valid booking for this expense.' }, { status: 400 })
    }
    if (!cleanCategory || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Category and a positive amount are required.' }, { status: 400 })
    }
    if (!['planned', 'incurred', 'paid'].includes(expenseStatus)) {
      return NextResponse.json({ error: 'Choose planned, incurred, or paid status.' }, { status: 400 })
    }

    const [booking] = await supabaseRestStrict<Array<{ inquiry_id: string | null }>>(`luxor_bookings?select=inquiry_id&id=eq.${encodeURIComponent(bookingId)}&limit=1`)
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    if (booking.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)

    const [created] = await supabaseRest<LuxorBookingExpense[]>('luxor_booking_expenses?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: bookingId,
        category: cleanCategory,
        description: description || null,
        vendor_name: vendor_name || null,
        amount: numericAmount,
        incurred_on: incurred_on || new Date().toISOString().split('T')[0],
        status: expenseStatus,
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

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || body.status !== 'cancelled') {
      return NextResponse.json({ error: 'A valid expense and cancelled status are required.' }, { status: 400 })
    }

    const [current] = await supabaseRestStrict<LuxorBookingExpense[]>(`luxor_booking_expenses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!current) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
    if (current.status === 'cancelled') return NextResponse.json(current)
    if (current.booking_id) {
      const [booking] = await supabaseRestStrict<Array<{ inquiry_id: string | null }>>(`luxor_bookings?select=inquiry_id&id=eq.${encodeURIComponent(current.booking_id)}&limit=1`)
      if (booking?.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    }

    const updated = await supabaseRestStrict<LuxorBookingExpense[]>(
      `luxor_booking_expenses?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(current.status)}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    )
    if (updated.length !== 1) return NextResponse.json({ error: 'Expense changed while it was being removed. Refresh and try again.' }, { status: 409 })
    return NextResponse.json(updated[0])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove expense.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
