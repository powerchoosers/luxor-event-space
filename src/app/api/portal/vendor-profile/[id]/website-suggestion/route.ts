import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorVendor } from '@/lib/luxorInquiryTypes'
import { findProviderWebsite } from '@/lib/luxorProviderWebsiteServer'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
  if (!process.env.OPEN_ROUTER_API_KEY) return NextResponse.json({ error: 'Website lookup is not configured.' }, { status: 503 })
  try {
    const [vendor] = await supabaseRestStrict<LuxorVendor[]>(`luxor_vendors?id=eq.${id}&select=id,name,vendor_type,archived_at&limit=1`)
    if (!vendor || vendor.archived_at) return NextResponse.json({ error: 'Provider is unavailable.' }, { status: 404 })
    return NextResponse.json(await findProviderWebsite(vendor.name, vendor.vendor_type), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Website lookup could not be completed. Try again or enter the site yourself.' }, { status: 503 })
  }
}
