import PlannerPresentationClient from './presentation-client'

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function PlannerReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PlannerPresentationClient token={token}/>
}
