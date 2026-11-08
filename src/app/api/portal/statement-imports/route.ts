import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestCount, supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { isAccountingSetupId, type AccountingSetupRecord } from '@/lib/luxorAccountingSetup'
import { prepareStatementImport } from '@/lib/luxorStatementImport'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
// Preview is read-only. Saving is blocked until the database can authenticate
// and revoke the actual user independently of the shared service credential.
const STATEMENT_IMPORTS_HAVE_DATABASE_BOUND_IDENTITY = false

async function authorize(write: boolean) {
  const session = await getLuxorPortalSession()
  if (!session) return { error: NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401, headers: noStore }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances') || (write && !['owner', 'admin'].includes(member.role))) return { error: NextResponse.json({ error: 'Finance access is required; saving imports requires an owner or admin.' }, { status: 403, headers: noStore }) }
  return { email: session.email }
}

async function account(id: string) {
  const rows = await supabaseRestStrict<AccountingSetupRecord[]>(`luxor_accounting_setup_records?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  const item = rows[0]
  return item?.status === 'confirmed' && item.kind === 'account' && ['asset', 'liability'].includes(item.details.classification) ? item : null
}

type ImportIdentity = { id: string; account_id: string; file_sha256: string; preview_sha256: string; imported_by: string }
async function findById(id: string) {
  const rows = await supabaseRestStrict<ImportIdentity[]>(`luxor_statement_imports?select=id,account_id,file_sha256,preview_sha256,imported_by&id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] || null
}
async function findDuplicate(accountId: string, hash: string) {
  const rows = await supabaseRestStrict<Array<{ id: string }>>(`luxor_statement_imports?select=id&account_id=eq.${encodeURIComponent(accountId)}&file_sha256=eq.${hash}&limit=1`)
  return rows[0] || null
}

export async function GET(request: NextRequest) {
  const actor = await authorize(false)
  if (actor.error) return actor.error
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (id !== null) {
      if (!isAccountingSetupId(id)) return NextResponse.json({ error: 'Invalid import ID.' }, { status: 400, headers: noStore })
      const rows = await supabaseRestStrict<unknown[]>(`luxor_statement_imports?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
      return rows[0] ? NextResponse.json({ statement: rows[0] }, { headers: noStore }) : NextResponse.json({ error: 'Statement not found.' }, { status: 404, headers: noStore })
    }
    const path = 'luxor_statement_imports?select=id,account_id,filename,period_start,period_end,imported_by,imported_at&order=imported_at.desc,id.asc'
    const [total, statements] = await Promise.all([supabaseRestCount(path), supabaseRestStrict<unknown[]>(`${path}&limit=100`)])
    return NextResponse.json({ statements, total, limit: 100 }, { headers: noStore })
  } catch { return NextResponse.json({ error: 'Statement imports are not available.' }, { status: 503, headers: noStore }) }
}

export async function POST(request: NextRequest) {
  const actor = await authorize(true)
  if (actor.error) return actor.error
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> }
  catch { return NextResponse.json({ error: 'Choose a valid CSV file.' }, { status: 400, headers: noStore }) }
  if (!body || typeof body !== 'object' || (body.action !== 'preview' && body.action !== 'import')) return NextResponse.json({ error: 'Choose preview or import.' }, { status: 400, headers: noStore })
  if (body.action === 'import' && !STATEMENT_IMPORTS_HAVE_DATABASE_BOUND_IDENTITY) return NextResponse.json({ error: 'Saving statements is unavailable until secure user identity is verified. No statement was saved.' }, { status: 503, headers: noStore })
  let data: ReturnType<typeof prepareStatementImport>
  try { data = prepareStatementImport(body) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid statement.' }, { status: 400, headers: noStore }) }
  try {
    if (!await account(data.accountId)) return NextResponse.json({ error: 'Choose a confirmed asset or liability account.' }, { status: 400, headers: noStore })
    if (body.action === 'preview') {
      const duplicate = await findDuplicate(data.accountId, data.fileHash)
      return NextResponse.json({ preview_sha256: data.previewHash, rows: data.rows, already_imported: Boolean(duplicate), duplicate_import_id: duplicate?.id || null }, { headers: noStore })
    }
    if (body.confirm !== true || body.preview_sha256 !== data.previewHash || !isAccountingSetupId(body.request_id)) return NextResponse.json({ error: 'Review the current preview and explicitly confirm the import.' }, { status: 400, headers: noStore })
    const prior = await findById(body.request_id)
    if (prior) {
      if (prior.account_id === data.accountId && prior.preview_sha256 === data.previewHash && prior.imported_by === actor.email) return NextResponse.json({ id: prior.id, replayed: true }, { headers: noStore })
      return NextResponse.json({ error: 'Import request ID was already used.' }, { status: 409, headers: noStore })
    }
    if (await findDuplicate(data.accountId, data.fileHash)) return NextResponse.json({ error: 'Identical CSV content was already imported for this account.' }, { status: 409, headers: noStore })
    const rows = await supabaseRestStrict<Array<{ id: string }>>('luxor_statement_imports?select=id', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id: body.request_id, account_id: data.accountId, file_sha256: data.fileHash, preview_sha256: data.previewHash, filename: data.filename, period_start: data.periodStart, period_end: data.periodEnd, choices: data.choices, rows: data.rows, imported_by: actor.email }),
    })
    if (!rows[0]?.id) throw new Error('Import could not be confirmed')
    return NextResponse.json({ id: rows[0].id }, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'This request or file was already imported. Refresh to review imports.' }, { status: 409, headers: noStore })
    return NextResponse.json({ error: 'Statement could not be verified or saved. Refresh before retrying.' }, { status: 503, headers: noStore })
  }
}
