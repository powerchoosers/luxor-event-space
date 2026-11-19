import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { downloadLuxorPrivatePdf } from '@/lib/luxorDocumentsServer'
import { getLuxorCreatedDocument, schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  try {
    const document = await getLuxorCreatedDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    if (!document.final_pdf_path) return NextResponse.json({ error: 'The completed PDF is not ready yet.' }, { status: 404 })
    const pdf = await downloadLuxorPrivatePdf(document.final_pdf_path)
    const filename = `${document.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}-completed.pdf`
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (schemaUnavailable(error)) return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    return NextResponse.json({ error: 'The completed PDF could not be downloaded.' }, { status: 503 })
  }
}
