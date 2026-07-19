import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const { id } = await params
  const invoice = await getInvoice(id)
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  const pdf = await buildLuxorInvoicePdf(invoice, inquiry)
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Luxor-${invoice.status === 'draft' ? 'Proposal' : 'Invoice'}-${invoice.id.slice(0, 8)}.pdf"`,
    },
  })
}
