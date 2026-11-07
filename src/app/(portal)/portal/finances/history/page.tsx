import { RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export default async function PaymentHistoryPage() {
  const session = await getLuxorPortalSession()
  return <RevenueCollectionsView view="history" actorEmail={session?.email || null} />
}
