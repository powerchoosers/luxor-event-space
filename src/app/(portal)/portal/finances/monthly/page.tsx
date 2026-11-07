import { RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export default async function MonthlyCollectionsPage() {
  const session = await getLuxorPortalSession()
  return <RevenueCollectionsView view="monthly" actorEmail={session?.email || null} />
}
