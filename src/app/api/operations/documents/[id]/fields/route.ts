import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorCreatedDocument, schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'
import { canEditCreatedDocumentFields, isLuxorCreatedDocumentFieldType } from '@/lib/luxorCreatedDocumentFieldTypes'
import {
  ensureDefaultLuxorCreatedDocumentSigners,
  listLuxorCreatedDocumentFields,
  listLuxorCreatedDocumentSigners,
  replaceLuxorCreatedDocumentFields,
  replaceLuxorCreatedDocumentSignerLabels,
  type UpsertFieldInput,
} from '@/lib/luxorCreatedDocumentFieldsServer'
import { SupabaseRestError } from '@/lib/supabaseRestServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  try {
    const document = await getLuxorCreatedDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    const [fields, signers] = await Promise.all([
      listLuxorCreatedDocumentFields(id),
      listLuxorCreatedDocumentSigners(id).then(async (rows) => (rows.length ? rows : ensureDefaultLuxorCreatedDocumentSigners(id))),
    ])
    return NextResponse.json({
      document,
      fields,
      signers,
      canEditFields: canEditCreatedDocumentFields(document.status, document.archived_at),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (schemaUnavailable(error)) return NextResponse.json({ error: 'Document fields are not stored yet.' }, { status: 409 })
    return NextResponse.json({ error: 'Fields could not be loaded.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as {
    fields?: unknown
    signers?: unknown
  } | null
  try {
    const document = await getLuxorCreatedDocument(id)
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    if (!canEditCreatedDocumentFields(document.status, document.archived_at)) {
      return NextResponse.json({ error: 'Fields are locked for this document.' }, { status: 409 })
    }
    await ensureDefaultLuxorCreatedDocumentSigners(id)
    let fields = await listLuxorCreatedDocumentFields(id)
    if (Array.isArray(body?.fields)) {
      const mapped: UpsertFieldInput[] = body.fields.flatMap((row) => {
        if (!row || typeof row !== 'object') return []
        const item = row as Record<string, unknown>
        if (!isLuxorCreatedDocumentFieldType(item.field_type)) return []
        return [{
          id: typeof item.id === 'string' ? item.id : undefined,
          field_type: item.field_type,
          role_key: String(item.role_key || ''),
          label: typeof item.label === 'string' ? item.label : '',
          required: Boolean(item.required),
          page_index: Number(item.page_index ?? 0),
          x: Number(item.x),
          y: Number(item.y),
          w: Number(item.w),
          h: Number(item.h),
          sort_order: Number(item.sort_order ?? 0),
        }]
      })
      fields = await replaceLuxorCreatedDocumentFields(id, mapped)
    }
    let signers = await listLuxorCreatedDocumentSigners(id)
    if (Array.isArray(body?.signers)) {
      signers = await replaceLuxorCreatedDocumentSignerLabels(
        id,
        body.signers.flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const item = row as Record<string, unknown>
          if (typeof item.id !== 'string' || typeof item.role_label !== 'string') return []
          return [{
            id: item.id,
            role_label: item.role_label,
            name: typeof item.name === 'string' ? item.name : undefined,
            email: typeof item.email === 'string' ? item.email : undefined,
          }]
        }),
      )
    }
    return NextResponse.json({ fields, signers }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Created document fields PUT failed', error)
    if (schemaUnavailable(error)) return NextResponse.json({ error: 'Document fields are not stored yet.' }, { status: 409 })
    if (error instanceof SupabaseRestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Fields could not be saved.' }, { status: 503 })
  }
}