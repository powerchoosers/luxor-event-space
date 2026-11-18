import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  getLuxorCreatedDocument,
  renderLuxorCreatedDocumentPdf,
  schemaUnavailable,
  signedPdfUrlForCreatedDocument,
} from '@/lib/luxorDocumentCreatorServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const refresh = request.nextUrl.searchParams.get('refresh') === '1'
  try {
    let document = await getLuxorCreatedDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    if (!document.pdf_storage_path || refresh) {
      document = await renderLuxorCreatedDocumentPdf(document)
    }
    const fileName = `Luxor-${document.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}.pdf`
    const signedUrl = await signedPdfUrlForCreatedDocument(document, fileName)
    return NextResponse.json({ signedUrl, document, documentId: document.id, version: document.version }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Created document PDF preview failed', error)
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'PDF preview is unavailable.' }, { status: 503 })
  }
}