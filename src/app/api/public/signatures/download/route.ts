import { NextRequest, NextResponse } from 'next/server'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { getLuxorSignatureRequestByToken, recordLuxorSignatureEvent } from '@/lib/luxorSignaturesServer'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const kind = request.nextUrl.searchParams.get('kind') || 'contract'
    const signature = await getLuxorSignatureRequestByToken(token)
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
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
