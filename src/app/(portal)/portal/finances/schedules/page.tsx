import { RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export default async function PaymentSchedulesPage() {
  const session = await getLuxorPortalSession()
  return <RevenueCollectionsView view="schedules" actorEmail={session?.email || null} />
}
