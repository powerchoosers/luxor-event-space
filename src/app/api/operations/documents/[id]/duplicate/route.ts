import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { duplicateLuxorCreatedDocument, schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  try {
    const document = await duplicateLuxorCreatedDocument({ sourceId: id, createdBy: session.email })
    return NextResponse.json({ document }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Document could not be duplicated.' }, { status: 503 })
  }
}