import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  getLuxorCreatedDocument,
  schemaUnavailable,
  updateLuxorCreatedDocument,
} from '@/lib/luxorDocumentCreatorServer'
import { isLuxorCreatedDocumentType } from '@/lib/luxorDocumentCreatorTypes'
import { luxorTimestampIsKnown } from '@/lib/luxorTimestamp'
import { SupabaseRestError } from '@/lib/supabaseRestServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  try {
    const document = await getLuxorCreatedDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    return NextResponse.json({ document }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Document could not be loaded.' }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as {
    expectedUpdatedAt?: unknown
    title?: unknown
    documentType?: unknown
    bodyJson?: unknown
    bodyHtml?: unknown
    isTemplate?: unknown
  } | null
  if (!body || typeof body.expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(body.expectedUpdatedAt)) {
    return NextResponse.json({ error: 'Invalid update request.' }, { status: 400 })
  }
  if (body.documentType !== undefined && !isLuxorCreatedDocumentType(body.documentType)) {
    return NextResponse.json({ error: 'Invalid document type.' }, { status: 400 })
  }
  try {
    const document = await updateLuxorCreatedDocument({
      id,
      expectedUpdatedAt: body.expectedUpdatedAt,
      title: typeof body.title === 'string' ? body.title : undefined,
      documentType: isLuxorCreatedDocumentType(body.documentType) ? body.documentType : undefined,
      bodyJson: body.bodyJson && typeof body.bodyJson === 'object' && !Array.isArray(body.bodyJson)
        ? body.bodyJson as Record<string, unknown>
        : undefined,
      bodyHtml: typeof body.bodyHtml === 'string' ? body.bodyHtml : undefined,
      isTemplate: typeof body.isTemplate === 'boolean' ? body.isTemplate : undefined,
      updatedBy: session.email,
    })
    return NextResponse.json({ document }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Created document PATCH failed', error)
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    if (error instanceof SupabaseRestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Document could not be saved.' }, { status: 503 })
  }
}