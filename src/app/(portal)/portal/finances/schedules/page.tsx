import { redirect } from 'next/navigation'

export default async function LegacyPaymentSchedulesPage({ searchParams }: { searchParams: Promise<{ bookingId?: string; client?: string }> }) {
  const params = await searchParams
  const query = new URLSearchParams({ view: 'receivables' })
  if (params.bookingId) query.set('bookingId', params.bookingId)
  redirect(`/portal/finances?${query.toString()}`)
}
