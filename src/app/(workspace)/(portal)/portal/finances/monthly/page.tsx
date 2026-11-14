import { redirect } from 'next/navigation'

export default function MonthlyCollectionsPage() {
  redirect('/portal/finances?view=revenue#monthly-collections')
}
