import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { downloadLuxorDocument, getLuxorDocumentByInvoice } from '@/lib/luxorDocumentsServer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const { id } = await params
  const invoice = await getInvoice(id)
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  const savedDocument = await getLuxorDocumentByInvoice(invoice.id, 'proposal')
    ?? await getLuxorDocumentByInvoice(invoice.id, 'invoice')
  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  const pdf = savedDocument ? await downloadLuxorDocument(savedDocument) : await buildLuxorInvoicePdf(invoice, inquiry)
  const disposition = request.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
  const fileName = savedDocument?.file_name ?? `Luxor-${invoice.status === 'draft' ? 'Proposal' : 'Invoice'}-${invoice.id.slice(0, 8)}.pdf`
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${fileName}"`,
    },
  })
}
