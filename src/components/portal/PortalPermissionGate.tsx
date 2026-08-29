import { redirect } from 'next/navigation'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan, type PortalPermission } from '@/lib/luxorPortalAccess'

export async function PortalPermissionGate({ permission, children }: { permission: PortalPermission; children: React.ReactNode }) {
  const session = await getLuxorPortalSession()
  const member = session ? await getLuxorPortalMember(session.email) : null
  if (!memberCan(member, permission)) redirect('/portal')
  return children
}
