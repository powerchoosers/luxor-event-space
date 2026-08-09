import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const bookingId = request.nextUrl.searchParams.get('bookingId')
  const path = bookingId ? `luxor_payment_installments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=installment_order.asc` : 'luxor_payment_installments?select=*&order=due_at.asc'
  return NextResponse.json(await supabaseRest<LuxorPaymentInstallment[]>(path))
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json() as Partial<LuxorPaymentInstallment>
    if (!body.booking_id || !body.label || Number(body.amount) < 0) return NextResponse.json({ error: 'Booking, label, and amount are required.' }, { status: 400 })
    const allowedMethods = ['card', 'cash', 'check', 'ACH', 'Zelle']
    const method = body.payment_method && allowedMethods.includes(body.payment_method) ? body.payment_method : null
    const [installment] = await supabaseRest<LuxorPaymentInstallment[]>('luxor_payment_installments?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ booking_id: body.booking_id, invoice_id: body.invoice_id || null, inquiry_id: body.inquiry_id || null, label: String(body.label).trim().slice(0, 160), installment_order: Math.max(1, Number(body.installment_order) || 1), amount: Math.max(0, Number(body.amount) || 0), due_at: body.due_at || null, status: body.status || 'scheduled', payment_method: method, reference: body.reference || null, metadata: body.metadata || {} }) })
    return NextResponse.json(installment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Installment could not be saved.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json() as Partial<LuxorPaymentInstallment> & { id?: string }
    if (!body.id) return NextResponse.json({ error: 'Installment id is required.' }, { status: 400 })
    const updates: Record<string, unknown> = {}
    for (const field of ['label', 'amount', 'due_at', 'status', 'payment_method', 'reference', 'metadata', 'invoice_id']) if (body[field as keyof typeof body] !== undefined) updates[field] = body[field as keyof typeof body]
    if (body.status === 'paid') { updates.paid_at = new Date().toISOString() }
    const [installment] = await supabaseRest<LuxorPaymentInstallment[]>(`luxor_payment_installments?select=*&id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }) })
    return NextResponse.json(installment)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Installment could not be updated.' }, { status: 500 })
  }
}
