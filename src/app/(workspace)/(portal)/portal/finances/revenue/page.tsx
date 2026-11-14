import { redirect } from 'next/navigation'

export default function RevenueDashboardPage() {
  redirect('/portal/finances?view=revenue')
}
