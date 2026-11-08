import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestCount, supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { isAccountingSetupId, validateAccountingSetup, type AccountingSetupRecord } from '@/lib/luxorAccountingSetup'

export const dynamic = 'force-dynamic'
const base = 'luxor_accounting_setup_records?select=*&order=created_at.desc,id.asc'
const noStore = { 'Cache-Control': 'no-store' }
// Shared service credentials cannot prove which portal user made a write.
// This is deliberately not configurable; identity binding must be implemented first.
const ACCOUNTING_SETUP_WRITES_HAVE_DATABASE_BOUND_IDENTITY = false

async function access(write: boolean) {
  const session = await getLuxorPortalSession()
  if (!session) return { error: NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401, headers: noStore }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances') || (write && !['owner', 'admin'].includes(member.role))) {
    return { error: NextResponse.json({ error: 'Owner or admin finance access is required to change accounting setup.' }, { status: 403, headers: noStore }) }
  }
  return { email: session.email }
}

async function record(id: string) {
  const rows = await supabaseRestStrict<AccountingSetupRecord[]>(`luxor_accounting_setup_records?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] || null
}

async function accountExists(details: Record<string, string>) {
  if (!details.account_id) return true
  const account = await record(details.account_id)
  return account?.kind === 'account' && account.status === 'confirmed'
}

type ExpenseCategory = { id: string; name: string; is_active: boolean }
async function expenseCategories() {
  const path = 'luxor_expense_categories?select=id,name,is_active&is_active=eq.true&order=name.asc,id.asc'
  const count = await supabaseRestCount(path)
  const rows: ExpenseCategory[] = []
  for (let offset = 0; offset < count; offset += 500) {
    const page = await supabaseRestStrict<ExpenseCategory[]>(`${path}&limit=500&offset=${offset}`)
    if (page.length < Math.min(500, count - offset)) throw new Error('Incomplete categories')
    rows.push(...page)
  }
  if (rows.length !== count || rows.some((row) => !row.id) || new Set(rows.map((row) => row.id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Categories changed')
  return rows
}

async function validMapping(details: Record<string, string>) {
  if (!details.source_id) return true
  const rows = await supabaseRestStrict<ExpenseCategory[]>(`luxor_expense_categories?select=id,name,is_active&id=eq.${encodeURIComponent(details.source_id)}&limit=1`)
  return Boolean(rows[0]?.is_active && rows[0].name === details.source_name)
}

function sameDetails(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

export async function GET() {
  const actor = await access(false)
  if (actor.error) return actor.error
  try {
    const count = await supabaseRestCount(base)
    const rows: AccountingSetupRecord[] = []
    for (let offset = 0; offset < count; offset += 500) {
      const page = await supabaseRestStrict<AccountingSetupRecord[]>(`${base}&limit=500&offset=${offset}`)
      if (page.length < Math.min(500, count - offset)) throw new Error('Incomplete setup history')
      rows.push(...page)
    }
    if (rows.length !== count || new Set(rows.map((row) => row.id)).size !== count || await supabaseRestCount(base) !== count) throw new Error('Setup history changed')
    const categories = await expenseCategories()
    return NextResponse.json({ records: rows, categories }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: 'Accounting setup is not available. Existing finances are unaffected.' }, { status: 503, headers: noStore })
  }
}

export async function POST(request: NextRequest) {
  if (!ACCOUNTING_SETUP_WRITES_HAVE_DATABASE_BOUND_IDENTITY) return NextResponse.json({ error: 'Accounting setup changes are unavailable until secure user identity is verified. No choice was saved.' }, { status: 503, headers: noStore })
  const actor = await access(true)
  if (actor.error) return actor.error
  try {
    const body = await request.json() as Record<string, unknown>
    if (!body || typeof body !== 'object' || !isAccountingSetupId(body.request_id)) return NextResponse.json({ error: 'A valid request ID is required.' }, { status: 400, headers: noStore })
    let proposal: { kind: AccountingSetupRecord['kind']; details: Record<string, string>; status: 'draft' | 'confirmed'; draft_id: string | null }
    if (body.action === 'draft') {
      try {
        const validated = validateAccountingSetup(body.kind, body.details)
        proposal = { ...validated, status: 'draft', draft_id: null }
      } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid setup details.' }, { status: 400, headers: noStore }) }
    } else if (body.action === 'confirm' && body.confirm === true && isAccountingSetupId(body.draft_id)) {
      const draft = await record(body.draft_id)
      if (!draft || draft.status !== 'draft') return NextResponse.json({ error: 'Draft not found.' }, { status: 404, headers: noStore })
      // Validate stored contents again before creating an immutable confirmation.
      const validated = validateAccountingSetup(draft.kind, draft.details)
      proposal = { ...validated, status: 'confirmed', draft_id: draft.id }
    } else return NextResponse.json({ error: 'Review and explicitly confirm a saved draft.' }, { status: 400, headers: noStore })
    const existing = await record(body.request_id)
    if (existing) {
      const same = existing.created_by === actor.email && existing.status === proposal.status && existing.kind === proposal.kind && existing.draft_id === proposal.draft_id && sameDetails(existing.details, proposal.details)
      return same ? NextResponse.json(existing, { headers: noStore }) : NextResponse.json({ error: 'Request ID already used.' }, { status: 409, headers: noStore })
    }
    if (!await accountExists(proposal.details)) return NextResponse.json({ error: 'Choose a confirmed account first.' }, { status: 400, headers: noStore })
    if (!await validMapping(proposal.details)) return NextResponse.json({ error: 'The expense category changed or is inactive. Refresh and save a new draft.' }, { status: 400, headers: noStore })
    const rows = await supabaseRestStrict<AccountingSetupRecord[]>('luxor_accounting_setup_records?select=*', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ id: body.request_id, ...proposal, created_by: actor.email }),
    })
    if (!rows[0] || rows[0].id !== body.request_id) throw new Error('Saved setup could not be verified')
    return NextResponse.json(rows[0], { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'This request or draft was already saved. Refresh to review it.' }, { status: 409, headers: noStore })
    return NextResponse.json({ error: 'Accounting setup could not be saved or verified. Refresh before retrying.' }, { status: 503, headers: noStore })
  }
}
