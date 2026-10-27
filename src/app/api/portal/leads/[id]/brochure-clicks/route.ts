import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getBrochureClickSummary } from '@/lib/luxorBrochureClicksServer'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid lead' }, { status: 400 })
  try {
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(await getBrochureClickSummary('1900-01-01', '9998-12-31', id))
  } catch {
    return NextResponse.json({ error: 'Unable to load brochure engagement' }, { status: 503 })
  }
}
