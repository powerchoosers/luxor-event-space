import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  getLuxorCreatedDocument,
  renderLuxorCreatedDocumentPdf,
  schemaUnavailable,
  signedPdfUrlForCreatedDocument,
} from '@/lib/luxorDocumentCreatorServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  try {
    const existing = await getLuxorCreatedDocument(id)
    if (!existing) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    const document = await renderLuxorCreatedDocumentPdf(existing)
    const fileName = `Luxor-${document.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}.pdf`
    const signedUrl = await signedPdfUrlForCreatedDocument(document, fileName)
    return NextResponse.json({ document, signedUrl }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'PDF could not be generated.' }, { status: 503 })
  }
}