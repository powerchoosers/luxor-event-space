import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { authorizeLuxorExpenseRequest, isExpenseUuid, LuxorExpenseRequestError, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'

export const dynamic = 'force-dynamic'

type Profile = { template_id: string; contact_name: string | null; phone: string | null; email: string | null; website: string | null; account_notes: string | null; updated_at: string; updated_by: string }
type Summary = { summary: string | null; source_bill_id: string | null; generated_at: string | null; updated_at: string }
const fields = ['contact_name', 'phone', 'email', 'website', 'account_notes'] as const
const limits = { contact_name: 200, phone: 60, email: 254, website: 2048, account_notes: 4000 }

async function ensureTemplate(id: string) {
  if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid recurring cost.')
  const rows = await supabaseRestStrict<Array<{ id: string }>>(`luxor_expense_templates?id=eq.${encodeURIComponent(id)}&select=id&limit=1`)
  if (!rows.length) throw new LuxorExpenseRequestError('Recurring cost not found.', 404)
}

async function readProfile(id: string) {
  const [row] = await supabaseRestStrict<Profile[]>(`luxor_recurring_cost_profiles?template_id=eq.${encodeURIComponent(id)}&select=template_id,contact_name,phone,email,website,account_notes,updated_at,updated_by&limit=1`)
  return row || { template_id: id, contact_name: null, phone: null, email: null, website: null, account_notes: null, updated_at: null, updated_by: null }
}

async function readSummary(id: string) {
  const [summary] = await supabaseRestStrict<Summary[]>('rpc/luxor_recurring_profile_valid_summary', { method: 'POST', body: JSON.stringify({ p_template_id: id }) })
  return summary || null
}

async function readSuggestedContacts(id: string) {
  const [result] = await supabaseRestStrict<Array<{ source_bill_id: string; extracted_fields: Record<string, unknown> | null }>>('rpc/luxor_recurring_profile_latest_bill', { method: 'POST', body: JSON.stringify({ p_template_id: id }) })
  if (!result?.extracted_fields) return null
  const safeText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max && !/[\r\n]/.test(value) ? value.trim() || null : null
  const rawEmail = safeText(result.extracted_fields.vendor_email, 254)
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null
  const rawPhone = safeText(result.extracted_fields.vendor_phone, 60)
  const phone = rawPhone && /^[+\d().\-\s]{7,60}$/.test(rawPhone) ? rawPhone : null
  const rawWebsite = safeText(result.extracted_fields.vendor_website, 2048)
  let website: string | null = null
  if (rawWebsite) try { const url = new URL(rawWebsite); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) website = url.href } catch { /* Invalid AI suggestions are ignored. */ }
  return phone || email || website ? { phone, email, website, source_bill_id: result.source_bill_id } : null
}

function responseError(error: unknown) {
  const result = toExpenseErrorResponse(error)
  return NextResponse.json({ error: result.message }, { status: result.status })
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    await ensureTemplate(id)
    const [profile, summary, suggested_contacts] = await Promise.all([readProfile(id), readSummary(id), readSuggestedContacts(id)])
    return NextResponse.json({ profile, summary, suggested_contacts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return responseError(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    await ensureTemplate(id)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'expected_updated_at')) throw new LuxorExpenseRequestError('Refresh the profile before saving.')
    if (body.expected_updated_at !== null && typeof body.expected_updated_at !== 'string') throw new LuxorExpenseRequestError('Invalid profile version.')
    const patch: Record<string, string | null> = {}
    for (const key of fields) {
      const value = body[key]
      if (value === undefined) continue
      if (value !== null && typeof value !== 'string') throw new LuxorExpenseRequestError(`Invalid ${key.replaceAll('_', ' ')}.`)
      const clean = typeof value === 'string' ? value.trim() : ''
      if (clean.length > limits[key] || (key !== 'account_notes' && /[\r\n]/.test(clean))) throw new LuxorExpenseRequestError(`Invalid ${key.replaceAll('_', ' ')}.`)
      patch[key] = clean || null
    }
    if (!Object.keys(patch).length) throw new LuxorExpenseRequestError('No profile changes to save.')
    if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) throw new LuxorExpenseRequestError('Enter a valid email address.')
    if (patch.website) {
      let url: URL
      try { url = new URL(patch.website) } catch { throw new LuxorExpenseRequestError('Enter a valid website address including https://.') }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new LuxorExpenseRequestError('Enter a valid website address.')
      patch.website = url.href
    }
    const previous = await readProfile(id)
    if (previous.updated_at !== body.expected_updated_at) throw new LuxorExpenseRequestError('This profile changed. Refresh and review it before saving.', 409)
    const updatedAt = new Date().toISOString()
    let saved: Profile | undefined
    if (previous.updated_at) {
      ;[saved] = await supabaseRestStrict<Profile[]>(`luxor_recurring_cost_profiles?template_id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(previous.updated_at)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: updatedAt, updated_by: session.email }) })
    } else {
      try {
        ;[saved] = await supabaseRestStrict<Profile[]>('luxor_recurring_cost_profiles?on_conflict=template_id&select=*', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ template_id: id, ...patch, updated_at: updatedAt, updated_by: session.email }) })
      } catch (error) { if (error instanceof SupabaseRestError && error.status === 409) throw new LuxorExpenseRequestError('This profile changed. Refresh and review it before saving.', 409); throw error }
    }
    if (!saved) throw new LuxorExpenseRequestError('This profile changed. Refresh and review it before saving.', 409)
    return NextResponse.json({ profile: saved }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return responseError(error) }
}
