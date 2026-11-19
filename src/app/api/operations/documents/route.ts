import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  createLuxorCreatedDocument,
  listLuxorCreatedDocuments,
  schemaUnavailable,
} from '@/lib/luxorDocumentCreatorServer'
import { isLuxorCreatedDocumentType, type LuxorCreatedDocumentLibrarySection } from '@/lib/luxorDocumentCreatorTypes'

const SECTIONS: LuxorCreatedDocumentLibrarySection[] = ['my_documents', 'out_for_signature', 'completed', 'templates', 'archived']

export async function GET(request: NextRequest) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const params = request.nextUrl.searchParams
  const section = params.get('section') as LuxorCreatedDocumentLibrarySection | null
  if (!section || !SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Invalid library section.' }, { status: 400 })
  }
  try {
    const documentType = params.get('type')
    const documents = await listLuxorCreatedDocuments({
      section,
      search: params.get('search') || undefined,
      documentType: documentType && isLuxorCreatedDocumentType(documentType) ? documentType : undefined,
      status: params.get('status') || undefined,
      updatedFrom: params.get('from') || undefined,
      updatedTo: params.get('to') || undefined,
    })
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ documents: [], unavailable: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Documents could not be loaded.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const body = await request.json().catch(() => null) as {
    title?: unknown
    documentType?: unknown
    bodyJson?: unknown
    bodyHtml?: unknown
    isTemplate?: unknown
    sourceTemplateId?: unknown
  } | null
  if (!body || typeof body.title !== 'string' || !body.title.trim()
    || !isLuxorCreatedDocumentType(body.documentType)
    || !body.bodyJson || typeof body.bodyJson !== 'object' || Array.isArray(body.bodyJson)) {
    return NextResponse.json({ error: 'Invalid document payload.' }, { status: 400 })
  }
  try {
    const document = await createLuxorCreatedDocument({
      title: body.title,
      documentType: body.documentType,
      bodyJson: body.bodyJson as Record<string, unknown>,
      bodyHtml: typeof body.bodyHtml === 'string' ? body.bodyHtml : '',
      isTemplate: body.isTemplate === true,
      createdBy: session.email,
      sourceTemplateId: typeof body.sourceTemplateId === 'string' ? body.sourceTemplateId : null,
    })
    return NextResponse.json({ document }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet. Ask Lewis to apply the migration.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Document could not be saved.' }, { status: 503 })
  }
}