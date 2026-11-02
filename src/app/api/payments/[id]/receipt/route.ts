import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPaymentReceiptEmailContext, getLuxorPaymentReceiptPdfContext } from '@/lib/luxorPaymentReceiptEmailServer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const { id } = await params
    const expectedFingerprint = request.nextUrl.searchParams.get('fingerprint')
    const expectedPdfSha256 = request.nextUrl.searchParams.get('pdfSha256')
    const emailContext = expectedFingerprint || expectedPdfSha256 ? await getLuxorPaymentReceiptEmailContext(id) : null
    const context = emailContext || await getLuxorPaymentReceiptPdfContext(id)
    if ((expectedFingerprint && expectedFingerprint !== emailContext?.fingerprint)
      || (expectedPdfSha256 && expectedPdfSha256 !== context.pdfSha256)) {
      return NextResponse.json({ error: 'The receipt changed after preview. Reopen the preview before sending.' }, { status: 409 })
    }
    const disposition = request.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    return new NextResponse(Buffer.from(context.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${context.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Luxor-Receipt-SHA256': context.pdfSha256,
        'X-Luxor-Receipt-Fingerprint': emailContext?.fingerprint || '',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt could not be created.'
    const status = message === 'Payment record not found.' ? 404
      : message.includes('confirmed paid transaction') || message.includes('client email') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
