import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { isPhoneTextWorkflow, PHONE_TEXT_DEFAULTS, validatePhoneTextBody } from '@/lib/luxorPhoneTextWorkflow'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
type Row = { missed_call_text_body: string; missed_call_text_enabled: boolean; inbound_text_reply_body: string; inbound_text_reply_enabled: boolean; inbound_text_reply_cooldown_hours: number; updated_at: string }
const fields = 'missed_call_text_body,missed_call_text_enabled,inbound_text_reply_body,inbound_text_reply_enabled,inbound_text_reply_cooldown_hours,updated_at'
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'messages') || !memberCan(member, 'calls')) throw new CustomWorkflowServiceError('Calls and messages permissions are required.', 403)
  return session.email
}
function responseError(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  return NextResponse.json({ error: 'Phone automation settings are unavailable.' }, { status: 500, headers })
}
function present(row: Row, kind: 'missed_call' | 'inbound_acknowledgment') {
  return { body: kind === 'missed_call' ? row.missed_call_text_body : row.inbound_text_reply_body, enabled: kind === 'missed_call' ? row.missed_call_text_enabled : row.inbound_text_reply_enabled, cooldownHours: row.inbound_text_reply_cooldown_hours, revision: row.updated_at, defaultBody: PHONE_TEXT_DEFAULTS[kind] }
}
export async function GET(request: NextRequest) {
  try {
    await authorize()
    const kind = request.nextUrl.searchParams.get('kind') || ''
    if (!isPhoneTextWorkflow(kind)) return NextResponse.json({ error: 'Unknown phone automation.' }, { status: 400, headers })
    const [row] = await supabaseRestStrict<Row[]>(`luxor_phone_routing_settings?select=${fields}&id=eq.main&limit=1`)
    if (!row) return NextResponse.json({ error: 'Phone settings have not been configured.' }, { status: 404, headers })
    return NextResponse.json({ ...present(row, kind), canEdit: canControlLiveLuxorAutomations() }, { headers })
  } catch (error) { return responseError(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Live automation editing is unavailable in this preview.' }, { status: 409, headers })
    const input = await request.json() as { kind?: unknown; body?: unknown; enabled?: unknown; cooldownHours?: unknown; revision?: unknown }
    if (typeof input.kind !== 'string' || !isPhoneTextWorkflow(input.kind) || typeof input.enabled !== 'boolean' || typeof input.revision !== 'string' || !Number.isFinite(Date.parse(input.revision))) return NextResponse.json({ error: 'Reload the automation before saving.' }, { status: 400, headers })
    let body: string
    try { body = validatePhoneTextBody(input.body) } catch (error) {
      // Existing messages may predate the current copy rules. Allow a toggle
      // or cooldown change without silently rewriting that existing content.
      const [current] = await supabaseRestStrict<Row[]>(`luxor_phone_routing_settings?id=eq.main&select=${fields}&limit=1`)
      const existing = input.kind === 'missed_call' ? current?.missed_call_text_body : current?.inbound_text_reply_body
      if (current && current.updated_at !== input.revision) return NextResponse.json({ error: 'Phone settings changed. Reload before saving.' }, { status: 409, headers })
      if (!current || typeof input.body !== 'string' || input.body !== existing) return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid message.' }, { status: 400, headers })
      body = existing
    }
    if (input.kind === 'inbound_acknowledgment' && (!Number.isInteger(input.cooldownHours) || Number(input.cooldownHours) < 1 || Number(input.cooldownHours) > 168)) return NextResponse.json({ error: 'Cooldown must be a whole number of hours from 1 to 168.' }, { status: 400, headers })
    const updates = input.kind === 'missed_call' ? { missed_call_text_body: body, missed_call_text_enabled: input.enabled } : { inbound_text_reply_body: body, inbound_text_reply_enabled: input.enabled, inbound_text_reply_cooldown_hours: input.cooldownHours }
    const [row] = await supabaseRestStrict<Row[]>(`luxor_phone_routing_settings?id=eq.main&updated_at=eq.${encodeURIComponent(input.revision)}&select=${fields}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...updates, updated_by: actor.toLowerCase(), updated_at: new Date().toISOString() }) })
    if (!row) return NextResponse.json({ error: 'Phone settings changed. Reload before saving.' }, { status: 409, headers })
    return NextResponse.json(present(row, input.kind), { headers })
  } catch (error) { return responseError(error) }
}
