import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, isLuxorProposalHistoryReady, isMissingLuxorProposalHistorySchema, listLuxorProposalHistory } from '@/lib/luxorInvoicesServer'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  if (!isLuxorProposalHistoryReady()) return NextResponse.json({ enabled: false, activities: [], sendAttempts: [] })
  const { id } = await params
  try {
    const invoice = await getInvoice(id)
    if (!invoice || invoice.invoice_kind !== 'event') return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 })
    const history = await listLuxorProposalHistory(id)
    if (!history) return NextResponse.json({ enabled: false, activities: [], sendAttempts: [] })
    return NextResponse.json({ enabled: true, ...history })
  } catch (error) {
    if (isMissingLuxorProposalHistorySchema(error)) return NextResponse.json({ enabled: false, activities: [], sendAttempts: [] })
    console.error('Proposal history could not be loaded:', error)
    return NextResponse.json({ error: 'Proposal history is temporarily unavailable.' }, { status: 503 })
  }
}
