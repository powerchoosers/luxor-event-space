import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { GET as invoices } from '@/app/api/invoices/route'
import { GET as bookings } from '@/app/api/bookings/route'
import { GET as expenses } from '@/app/api/expenses/route'
import { GET as payments } from '@/app/api/payments/route'
import { GET as installments } from '@/app/api/portal/payment-installments/route'
import { GET as refunds } from '@/app/api/payments/refunds/route'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const makeRequest = (path: string) => new NextRequest(new URL(path, request.url), { headers: request.headers })
  try {
    const [invoiceResponse, bookingResponse, expenseResponse, paymentResponse, installmentResponse, refundResponse] = await Promise.all([
      invoices(makeRequest('/api/invoices?strictMetrics=1')),
      bookings(makeRequest('/api/bookings?strictMetrics=1&financeRowsOnly=1')),
      expenses(makeRequest('/api/expenses?strictMetrics=1')),
      payments(makeRequest('/api/payments')),
      installments(makeRequest('/api/portal/payment-installments?strictMetrics=1')),
      refunds(makeRequest('/api/payments/refunds')),
    ])
    if (![invoiceResponse, bookingResponse, expenseResponse, paymentResponse, installmentResponse, refundResponse].every((response) => response.ok)) throw new Error('Financial records could not be loaded.')
    const [invoiceRows, bookingRows, expenseRows, paymentRows, installmentRows, refundRows] = await Promise.all([
      invoiceResponse.json(), bookingResponse.json(), expenseResponse.json(), paymentResponse.json(), installmentResponse.json(), refundResponse.json(),
    ])
    const rows = [invoiceRows, bookingRows, expenseRows, paymentRows, installmentRows, refundRows]
    if (!rows.every(Array.isArray)) throw new Error('Financial records could not be verified.')
    return NextResponse.json({ invoices: rows[0], bookings: rows[1], expenses: rows[2], payments: rows[3], installments: rows[4], refunds: rows[5] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Financial records could not be verified. Refresh to retry.' }, { status: 503 })
  }
}
