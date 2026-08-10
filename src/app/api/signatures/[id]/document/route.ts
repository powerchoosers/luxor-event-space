import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { getLuxorSignatureRequestById } from '@/lib/luxorSignaturesServer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { id } = await params
    const signature = await getLuxorSignatureRequestById(id)
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    const kind = request.nextUrl.searchParams.get('kind') === 'executed' ? 'executed' : 'contract'
    const path = kind === 'executed' && signature.executed_document_path
      ? signature.executed_document_path
      : signature.contract_document_path
    if (!path) return NextResponse.json({ error: 'That PDF is not available yet.' }, { status: 404 })
    const pdf = await downloadLuxorPrivatePdf(path)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Luxor-${kind === 'executed' ? 'Executed-Agreement' : 'Agreement'}-${signature.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to open the contract PDF.' }, { status: 500 })
  }
}
