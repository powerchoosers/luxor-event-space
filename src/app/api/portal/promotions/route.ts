import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPromotion } from '@/lib/luxorInquiryTypes'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  return NextResponse.json(await supabaseRest<LuxorPromotion[]>('luxor_promotions?select=*&order=active.desc,name.asc'))
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json() as Partial<LuxorPromotion>
    const name = String(body.name || '').trim()
    const code = String(body.code || '').trim().toUpperCase()
    const discountType = body.discount_type === 'fixed' ? 'fixed' : 'percent'
    const value = Math.max(0, Number(body.value) || 0)
    if (!name || !code || value <= 0) return NextResponse.json({ error: 'Name, code, and a positive value are required.' }, { status: 400 })
    if (discountType === 'percent' && value > 100) return NextResponse.json({ error: 'Percentage promotions cannot exceed 100%.' }, { status: 400 })
    const [promotion] = await supabaseRest<LuxorPromotion[]>('luxor_promotions?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, code, discount_type: discountType, value, active: body.active !== false, metadata: body.metadata || {} }) })
    return NextResponse.json(promotion, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Promotion could not be saved.' }, { status: 500 })
  }
}
