import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorBill, LuxorVendor } from '@/lib/luxorInquiryTypes'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getOperationsSession()) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
    const { id } = await context.params
    if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
    const body = await request.json() as { vendorId?: unknown; name?: unknown; expectedUpdatedAt?: unknown }
    if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return NextResponse.json({ error: 'Reload the bill before linking.' }, { status: 400 })
    if (!(typeof body.vendorId === 'string' && uuid.test(body.vendorId)) && !(typeof body.name === 'string' && body.name.trim() && body.name.trim().length <= 200)) return NextResponse.json({ error: 'Choose a company or provide a name.' }, { status: 400 })
    const result = await supabaseRest<{ bill: LuxorBill; vendor: LuxorVendor }>('rpc/luxor_link_bill_company', { method: 'POST', body: JSON.stringify({ p_bill_id: id, p_expected_updated_at: body.expectedUpdatedAt, p_vendor_id: typeof body.vendorId === 'string' && uuid.test(body.vendorId) ? body.vendorId : null, p_name: typeof body.name === 'string' ? body.name : null }) })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Company link failed.' }, { status: 500 })
  }
}
