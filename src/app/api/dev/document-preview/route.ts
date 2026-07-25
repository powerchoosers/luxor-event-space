import { NextRequest, NextResponse } from 'next/server'
import {
  buildLuxorContractPdf,
  buildLuxorGuestGuidePdf,
  type LuxorBooking,
} from '@/lib/luxorContractPdfServer'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const booking = {
    client_name: 'Sophia Martinez',
    email: 'sophia@example.com',
    phone: '(210) 555-0148',
    event_type: 'Quinceañera',
    event_date: '2026-10-17',
    start_time: '5:00 PM',
    end_time: '11:00 PM',
    guest_count: 160,
    package_name: 'Grand Celebration',
    contract_total: 8250,
    deposit_amount: 2500,
    balance_due: 5750,
    balance_due_date: '2026-09-17',
  } as LuxorBooking

  const kind = request.nextUrl.searchParams.get('kind')
  const pdf = kind === 'guide'
    ? await buildLuxorGuestGuidePdf(booking)
    : await buildLuxorContractPdf(booking, 'document-preview')

  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
  })
}
