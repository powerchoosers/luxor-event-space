import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan, normalizePermissions, type LuxorPortalMember, type PortalRole } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { createLuxorSupabaseAuthAdmin } from '@/lib/luxorSupabaseAuthServer'
import { safeProfileAvatarUrl } from '@/lib/luxorUserProfileServer'

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
  const [members, phones, profiles] = await Promise.all([
    supabaseRest('luxor_portal_members?select=*&order=created_at.asc'),
    supabaseRest('luxor_phone_numbers?select=id,phone_number,friendly_name,is_active&order=is_active.desc'),
    supabaseRest<Array<{ email: string; role_title: string | null; avatar_url: string | null }>>('luxor_user_preferences?select=email,role_title,avatar_url'),
  ])
  const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile]))
  return NextResponse.json({ members: (members as LuxorPortalMember[]).map((member) => ({ ...member, role_title: profileByEmail.get(member.email)?.role_title || '', avatar_url: safeProfileAvatarUrl(profileByEmail.get(member.email)?.avatar_url) })), phones })
}

export async function POST(request: NextRequest) {
  const actor = await requireTeamAccess()
  if (!actor) return NextResponse.json({ error: 'Team access is restricted to owners and authorized admins.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const email = cleanEmail(body.email)
  const recoveryEmail = cleanEmail(body.recoveryEmail)
  const displayName = String(body.displayName || '').trim()
  const roleTitle = String(body.roleTitle || '').trim()
  const avatarUrl = safeProfileAvatarUrl(body.avatarUrl)
  const role = body.role === 'admin' ? 'admin' : 'agent'
  if (!email || !email.endsWith('@luxoratlaspalmas.com') || !recoveryEmail || email === recoveryEmail || !displayName || displayName.length > 100 || !roleTitle || roleTitle.length > 120) {
    return NextResponse.json({ error: 'Enter a valid name, title, Luxor login address, and separate recovery email.' }, { status: 400 })
  }
  const existing = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?email=eq.${encodeURIComponent(email)}&select=*&limit=1`)
  if (existing[0]) return NextResponse.json({ error: 'That Luxor login address is already assigned.' }, { status: 409 })
  const permissions = normalizePermissions(body.permissions, role)
  const auth = createLuxorSupabaseAuthAdmin()
  const created = await auth.auth.admin.createUser({ email, email_confirm: true, app_metadata: { luxor_portal_role: role } })
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message || 'Unable to create the secure login identity.' }, { status: 400 })
  let member: LuxorPortalMember | undefined
  try {
    ;[member] = await supabaseRest<LuxorPortalMember[]>('luxor_portal_members?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ email, recovery_email: recoveryEmail, auth_user_id: created.data.user.id, display_name: displayName, role, status: 'pending', permissions, sender_email: cleanEmail(body.senderEmail), assigned_phone_number_id: cleanOptionalUuid(body.phoneNumberId), updated_at: new Date().toISOString() }) })
    await supabaseRest('luxor_user_preferences?on_conflict=email', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ email, display_name: displayName, role_title: roleTitle, avatar_url: avatarUrl, theme: 'light', notification_emails: 'booking@luxoratlaspalmas.com', updated_at: new Date().toISOString() }) })
  } catch (error) {
    await auth.auth.admin.deleteUser(created.data.user.id).catch(() => undefined)
    throw error
  }
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
  if (body.action === 'revoke_sessions') {
    const now = new Date().toISOString()
    const [member] = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?id=eq.${id}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sessions_revoked_at: now, updated_at: now }) })
    return NextResponse.json({ member })
  }
  const role: PortalRole = body.role === 'admin' ? 'admin' : 'agent'
  const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : 'pending'
  const recoveryEmail = cleanEmail(body.recoveryEmail) || current[0].recovery_email
  const roleTitle = String(body.roleTitle || '').trim()
  const avatarUrl = safeProfileAvatarUrl(body.avatarUrl)
  const nextEmail = cleanEmail(body.email) || current[0].email
  if (!nextEmail.endsWith('@luxoratlaspalmas.com')) return NextResponse.json({ error: 'The login must use the Luxor domain.' }, { status: 400 })
  if (nextEmail !== current[0].email) {
    if (!current[0].auth_user_id) return NextResponse.json({ error: 'This login identity needs administrator attention before its address can change.' }, { status: 409 })
    const authUpdate = await createLuxorSupabaseAuthAdmin().auth.admin.updateUserById(current[0].auth_user_id, { email: nextEmail, email_confirm: true })
    if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message }, { status: 400 })
    await supabaseRest(`luxor_user_preferences?email=eq.${encodeURIComponent(current[0].email)}`, { method: 'PATCH', body: JSON.stringify({ email: nextEmail }) })
  }
  const [member] = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?id=eq.${id}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ email: nextEmail, display_name: String(body.displayName || current[0].display_name).trim().slice(0, 100), recovery_email: recoveryEmail, role, status, permissions: normalizePermissions(body.permissions, role), sender_email: cleanEmail(body.senderEmail), assigned_phone_number_id: cleanOptionalUuid(body.phoneNumberId), updated_at: new Date().toISOString() }) })
  if (roleTitle && roleTitle.length <= 120) await supabaseRest('luxor_user_preferences?on_conflict=email', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ email: nextEmail, display_name: member.display_name, role_title: roleTitle, avatar_url: avatarUrl, updated_at: new Date().toISOString() }) })
  return NextResponse.json({ member })
}
