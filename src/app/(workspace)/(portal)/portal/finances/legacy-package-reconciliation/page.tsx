import { notFound, redirect } from 'next/navigation'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import LegacyPackageReconciliationClient from './LegacyPackageReconciliationClient'

export const dynamic = 'force-dynamic'

export default async function LegacyPackageReconciliationPage() {
  const session = await getLuxorPortalSession()
  if (!session) redirect('/portal/login')
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || member.role !== 'owner' || !memberCan(member, 'finances')) {
    notFound()
  }
  return <LegacyPackageReconciliationClient />
}
