import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) {
      return NextResponse.json({ error: 'Active finance access is required to view refunds.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get('bookingId')
    const inquiryId = searchParams.get('inquiryId')
    const fields = 'id,source_payment_id,booking_id,invoice_id,inquiry_id,refund_kind,amount,currency,status,processor,processor_payment_intent_id,processor_refund_id,requested_at,completed_at,livemode,failure_code,metadata'
    let path = `luxor_payment_refunds?select=${fields}&order=requested_at.desc,id.asc`
    if (bookingId) path = `luxor_payment_refunds?select=${fields}&booking_id=eq.${encodeURIComponent(bookingId)}&order=requested_at.desc,id.asc`
    else if (inquiryId) path = `luxor_payment_refunds?select=${fields}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=requested_at.desc,id.asc`

    const expected = await supabaseRestCount(path)
    const refunds: LuxorPaymentRefundView[] = []
    for (let offset = 0; offset < expected; offset += 500) {
      const page = await supabaseRestStrict<LuxorPaymentRefundView[]>(`${path}&limit=500&offset=${offset}`)
      refunds.push(...page)
      if (page.length < Math.min(500, expected - offset)) throw new Error('Refund records could not be fully verified.')
    }
    if (refunds.length !== expected || new Set(refunds.map((refund) => refund.id)).size !== expected || await supabaseRestCount(path) !== expected) {
      throw new Error('Refund records changed while loading. Please refresh.')
    }
    return NextResponse.json(refunds)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch refund records.' }, { status: 500 })
  }
}
