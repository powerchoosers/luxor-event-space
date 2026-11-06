import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBreakdown, isLuxorBreakdownId, listLuxorBreakdowns, LuxorBreakdownError, sendLuxorBreakdown } from '@/lib/luxorBreakdownsServer'
import { LuxorPromotionSelectionError } from '@/lib/luxorProposalPricingServer'
import { LuxorWeekdayRentalError } from '@/lib/luxorWeekdayRentalServer'
import type { LuxorProposalSelection } from '@/lib/luxorProposalPricing'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) {
      return NextResponse.json({ error: 'Leads access is not enabled for this portal account.' }, { status: 403 })
    }
    const id = request.nextUrl.searchParams.get('id')
    const inquiryId = request.nextUrl.searchParams.get('inquiryId')
    if (id) {
      if (!isLuxorBreakdownId(id)) return NextResponse.json({ error: 'Invalid breakdown id.' }, { status: 400 })
      const breakdown = await getLuxorBreakdown(id)
      return breakdown ? NextResponse.json({ breakdown }) : NextResponse.json({ error: 'Breakdown not found.' }, { status: 404 })
    }
    if (!isLuxorBreakdownId(inquiryId)) return NextResponse.json({ error: 'A valid lead is required.' }, { status: 400 })
    return NextResponse.json({ breakdowns: await listLuxorBreakdowns(inquiryId) })
  } catch (error) {
    console.error('[proposal-breakdowns] read failed', error)
    return NextResponse.json({ error: 'Breakdown history is unavailable. Please try again.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) {
      return NextResponse.json({ error: 'Leads access is not enabled for this portal account.' }, { status: 403 })
    }
    const body = await request.json().catch(() => null)
    if (!body || body.action !== 'send' || !isLuxorBreakdownId(body.requestId) || !isLuxorBreakdownId(body.inquiryId)
      || (body.leadEventId !== null && body.leadEventId !== undefined && !isLuxorBreakdownId(body.leadEventId))
      || (body.sourceInvoiceId !== null && body.sourceInvoiceId !== undefined && !isLuxorBreakdownId(body.sourceInvoiceId))
      || typeof body.recipientEmail !== 'string' || typeof body.expectedPricing !== 'string'
      || !body.selection || typeof body.selection !== 'object' || Array.isArray(body.selection)) {
      return NextResponse.json({ error: 'Provide a valid lead, event, recipient, pricing selection, and send request.' }, { status: 400 })
    }
    return NextResponse.json(await sendLuxorBreakdown({
      requestId: body.requestId, inquiryId: body.inquiryId, leadEventId: body.leadEventId || null, sourceInvoiceId: body.sourceInvoiceId || null,
      recipientEmail: body.recipientEmail, selection: body.selection as LuxorProposalSelection,
      expectedPricing: body.expectedPricing, actorEmail: session.email,
    }))
  } catch (error) {
    if (error instanceof LuxorBreakdownError) {
      return NextResponse.json({ error: error.message, ...(error.breakdown ? { breakdown: error.breakdown } : {}) }, { status: error.status })
    }
    if (error instanceof LuxorPromotionSelectionError || error instanceof LuxorWeekdayRentalError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[proposal-breakdowns] send failed', error)
    return NextResponse.json({ error: 'The breakdown could not be prepared or its delivery could not be confirmed. Check history before trying again.' }, { status: 503 })
  }
}
