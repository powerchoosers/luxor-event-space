import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'

export const PORTAL_PERMISSIONS = [
  'overview', 'leads', 'emails', 'calls', 'messages', 'calendar', 'events',
  'marketing', 'finances', 'operations', 'reports', 'settings', 'team_access',
  'email_identity', 'phone_assignment',
] as const

export type PortalPermission = (typeof PORTAL_PERMISSIONS)[number]
export type PortalRole = 'owner' | 'admin' | 'agent'
export type PortalMemberStatus = 'pending' | 'active' | 'suspended'

export type LuxorPortalMember = {
  id: string; email: string; display_name: string; role: PortalRole; status: PortalMemberStatus
  permissions: string[]; sender_email: string | null; assigned_phone_number_id: string | null
  recovery_email: string | null; auth_user_id: string | null; password_set_at: string | null
  password_reset_sent_at: string | null; sessions_revoked_at: string | null
  invited_at: string | null; last_signed_in_at: string | null; created_at: string
}

export const ROLE_DEFAULTS: Record<PortalRole, PortalPermission[]> = {
  owner: [...PORTAL_PERMISSIONS],
  admin: [...PORTAL_PERMISSIONS],
  agent: ['overview', 'leads', 'emails', 'calls', 'messages', 'calendar', 'events'],
}

export function normalizePermissions(value: unknown, role: PortalRole): PortalPermission[] {
  if (role === 'owner') return [...PORTAL_PERMISSIONS]
  const list = Array.isArray(value) ? value : ROLE_DEFAULTS[role]
  return PORTAL_PERMISSIONS.filter((permission) => list.includes(permission))
}

export async function getLuxorPortalMember(email: string) {
  const normalized = email.trim().toLowerCase()
  const rows = await supabaseRest<LuxorPortalMember[]>(`luxor_portal_members?email=eq.${encodeURIComponent(normalized)}&select=*&limit=1`)
  const member = rows[0]
  if (!member) return null
  return { ...member, permissions: normalizePermissions(member.permissions, member.role) }
}

export function memberCan(member: Pick<LuxorPortalMember, 'role' | 'permissions'> | null | undefined, permission: PortalPermission) {
  return Boolean(member && (member.role === 'owner' || member.permissions.includes(permission)))
}
