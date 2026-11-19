import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { createLuxorCreatedDocumentTemplateFromDocument, schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { title?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title : undefined
  try {
    const document = await createLuxorCreatedDocumentTemplateFromDocument({
      sourceId: id,
      createdBy: session.email,
      title,
    })
    return NextResponse.json({ document }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Save as template failed', error)
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Document tables are not stored yet.' }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Template could not be saved.'
    const status = /not found/i.test(message) ? 404 : /title/i.test(message) ? 400 : 503
    return NextResponse.json({ error: message }, { status })
  }
}