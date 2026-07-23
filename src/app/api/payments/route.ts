import { NextRequest, NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

import { LuxorPayment } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get('bookingId')
    const inquiryId = searchParams.get('inquiryId')

    let path = 'luxor_payments?select=*&order=created_at.desc'
    if (bookingId) {
      path = `luxor_payments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc`
    } else if (inquiryId) {
      path = `luxor_payments?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`
    }

    const payments = await supabaseRest(path)
    return NextResponse.json(payments)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch payments.'
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
    const { booking_id, invoice_id, inquiry_id, amount, status, payment_method, notes, processor, processor_reference } = body
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {}

    if (!amount) {
      return NextResponse.json({ error: 'Amount is required.' }, { status: 400 })
    }

    const [created] = await supabaseRest<LuxorPayment[]>('luxor_payments?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: booking_id || null,
        invoice_id: invoice_id || null,
        inquiry_id: inquiry_id || null,
        amount: Number(amount),
        status: status || 'paid',
        payment_method: payment_method || 'Stripe',
        paid_at: new Date().toISOString(),
        notes: notes || null,
        processor: processor || null,
        processor_reference: processor_reference || null,
        metadata,
      }),
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save payment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
