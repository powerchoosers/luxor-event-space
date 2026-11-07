import { RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export default async function RevenueDashboardPage() {
  const session = await getLuxorPortalSession()
  return <RevenueCollectionsView view="revenue" actorEmail={session?.email || null} />
}
