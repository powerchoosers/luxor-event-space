import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { archiveLuxorCreatedDocument, schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'
import { luxorTimestampIsKnown } from '@/lib/luxorTimestamp'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { expectedUpdatedAt?: unknown; action?: unknown } | null
  if (!body || typeof body.expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(body.expectedUpdatedAt)
    || (body.action !== 'archive' && body.action !== 'restore')) {
    return NextResponse.json({ error: 'Invalid archive request.' }, { status: 400 })
  }
  try {
    const document = await archiveLuxorCreatedDocument({
      id,
      expectedUpdatedAt: body.expectedUpdatedAt,
      action: body.action,
      actorEmail: session.email,
    })
    return NextResponse.json({ document }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Documents are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Archive state could not be changed.' }, { status: 409 })
  }
}