import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { luxorTimestampIsKnown, luxorTimestampMs } from '@/lib/luxorTimestamp'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const OPERATIONS_VENDOR_FIELDS = ['id', 'created_at', 'updated_at', 'archived_at', 'vendor_type', 'name', 'email', 'phone', 'rating', 'coi_active'] as const

export async function POST(request: NextRequest) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const body = await request.json().catch(() => null) as { type?: unknown; id?: unknown; expectedUpdatedAt?: unknown; action?: unknown } | null
  if (!body || (body.type !== 'bill' && body.type !== 'vendor') || typeof body.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
    || typeof body.expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(body.expectedUpdatedAt)
    || (body.action !== 'archive' && body.action !== 'restore')) {
    return NextResponse.json({ error: 'Invalid archive request.' }, { status: 400 })
  }
  try {
    const table = body.type === 'bill' ? 'luxor_bills' : 'luxor_vendors'
    const priorMs = luxorTimestampMs(body.expectedUpdatedAt)!
    const now = new Date(Math.max(Date.now(), priorMs + 1)).toISOString()
    const state = body.action === 'archive' ? 'is.null' : 'not.is.null'
    const projection = body.type === 'vendor' ? OPERATIONS_VENDOR_FIELDS.join(',') : '*'
    const [record] = await supabaseRestStrict<Array<Record<string, unknown>>>(`${table}?id=eq.${encodeURIComponent(body.id)}&updated_at=eq.${encodeURIComponent(body.expectedUpdatedAt)}&archived_at=${state}&select=${projection}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ archived_at: body.action === 'archive' ? now : null, archive_changed_by: session.email, updated_at: now }),
    })
    if (!record) return NextResponse.json({ error: 'Record changed or is unavailable. Reload and try again.' }, { status: 409 })
    const responseRecord = body.type === 'vendor'
      ? Object.fromEntries(OPERATIONS_VENDOR_FIELDS.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]))
      : record
    return NextResponse.json({ record: responseRecord }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) {
      return NextResponse.json({ error: 'Archive is not stored yet. Nothing was changed, and the record stays in the list.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Archive state could not be changed. Please try again.' }, { status: 503 })
  }
}
