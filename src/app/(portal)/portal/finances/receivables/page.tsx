import { RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export default async function AccountsReceivablePage() {
  const session = await getLuxorPortalSession()
  return <RevenueCollectionsView view="receivables" actorEmail={session?.email || null} />
}
