import { PlannerRoute } from '../../_components/PlannerRoute'

export default async function PlannerEventPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  return <PlannerRoute bookingId={bookingId}/>
}
