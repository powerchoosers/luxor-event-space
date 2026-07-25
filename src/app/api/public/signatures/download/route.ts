import { NextRequest, NextResponse } from 'next/server'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { getLuxorSignatureRequestByToken, recordLuxorSignatureEvent } from '@/lib/luxorSignaturesServer'
import { buildLuxorContractPdf } from '@/lib/luxorContractPdfServer'
import type { LuxorBooking } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const kind = request.nextUrl.searchParams.get('kind') || 'contract'
    if (process.env.NODE_ENV === 'development' && token === 'ux-layout-review') {
      const booking = {
        client_name: 'Lewis Patterson', email: 'lewis@example.com', phone: '(210) 555-0148', event_type: 'Baby shower',
        event_date: '2026-11-14', start_time: '17:00', end_time: '23:00', guest_count: 120,
        package_name: 'Signature Celebration', contract_total: 8250, deposit_required: 2500,
        final_payment_due_date: '2026-10-15',
      } as LuxorBooking
      const pdf = await buildLuxorContractPdf(booking, 'layout-review')
      return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } })
    }
    const signature = await getLuxorSignatureRequestByToken(token)
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    if (signature.status === 'void') {
      return NextResponse.json({ error: 'This signing link was cancelled.' }, { status: 410 })
    }
    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now() && signature.status !== 'signed') {
      return NextResponse.json({ error: 'This signing link has expired.' }, { status: 410 })
    }
    const isExecuted = kind === 'executed' && signature.executed_document_path
    const path = isExecuted ? signature.executed_document_path! : signature.contract_document_path
    if (!path) return NextResponse.json({ error: 'The PDF is not ready.' }, { status: 404 })
    const pdf = await downloadLuxorPrivatePdf(path)
    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: isExecuted ? 'executed_copy_downloaded' : 'contract_downloaded',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${isExecuted ? 'Luxor-Event-Agreement-Executed.pdf' : 'Luxor-Event-Agreement.pdf'}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to download the PDF.' }, { status: 500 })
  }
}
