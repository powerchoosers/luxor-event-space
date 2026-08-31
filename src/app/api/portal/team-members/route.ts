import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan, normalizePermissions, type LuxorPortalMember, type PortalRole } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'

function cleanEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function cleanOptionalUuid(value: unknown) {
  const id = typeof value === 'string' ? value.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null
}

async function requireTeamAccess() {
  const session = await getLuxorPortalSession()
  const member = session ? await getLuxorPortalMember(session.email) : null
  return memberCan(member, 'team_access') ? member : null
}

export async function GET() {
  const actor = await requireTeamAccess()
  if (!actor) return NextResponse.json({ error: 'Team access is restricted to owners and authorized admins.' }, { status: 403 })
  const [members, phones] = await Promise.all([
    supabaseRest('luxor_portal_members?select=*&order=created_at.asc'),
    supabaseRest('luxor_phone_numbers?select=id,phone_number,friendly_name,is_active&order=is_active.desc'),
  ])
  return NextResponse.json({ members, phones })
}

export async function POST(request: NextRequest) {
  const actor = await requireTeamAccess()
  if (!actor) return NextResponse.json({ error: 'Team access is restricted to owners and authorized admins.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const email = cleanEmail(body.email)
  const displayName = String(body.displayName || '').trim()
  const role = body.role === 'admin' ? 'admin' : 'agent'
  if (!email || !displayName || displayName.length > 100) return NextResponse.json({ error: 'Enter a valid name and email.' }, { status: 400 })
  const permissions = normalizePermissions(body.permissions, role)
  const [member] = await supabaseRest<LuxorPortalMember[]>('luxor_portal_members?on_conflict=email&select=*', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ email, display_name: displayName, role, status: 'pending', permissions, sender_email: cleanEmail(body.senderEmail), assigned_phone_number_id: cleanOptionalUuid(body.phoneNumberId), updated_at: new Date().toISOString() }) })
  return NextResponse.json({ member }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const actor = await requireTeamAccess()
  if (!actor) return NextResponse.json({ error: 'Team access is restricted to owners and authorized admins.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid team member.' }, { status: 400 })
  const current = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?id=eq.${id}&select=*&limit=1`)
  if (!current[0]) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 })
  if (current[0].role === 'owner') return NextResponse.json({ error: 'The owner account cannot be changed here.' }, { status: 400 })
  const role: PortalRole = body.role === 'admin' ? 'admin' : 'agent'
  const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : 'pending'
  const [member] = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?id=eq.${id}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ display_name: String(body.displayName || current[0].display_name).trim().slice(0, 100), role, status, permissions: normalizePermissions(body.permissions, role), sender_email: cleanEmail(body.senderEmail), assigned_phone_number_id: cleanOptionalUuid(body.phoneNumberId), updated_at: new Date().toISOString() }) })
  return NextResponse.json({ member })
}
