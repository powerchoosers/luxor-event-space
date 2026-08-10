import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { downloadLuxorDocument, getLuxorDocument } from '@/lib/luxorDocumentsServer'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { id } = await params
    const document = await getLuxorDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    const pdf = await downloadLuxorDocument(document)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': document.content_type || 'application/pdf',
        'Content-Disposition': `inline; filename="${document.file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to open the document.' }, { status: 500 })
  }
}
