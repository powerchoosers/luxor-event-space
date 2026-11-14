import { redirect } from 'next/navigation'

export default function PaymentHistoryPage() {
  redirect('/portal/finances?view=payments')
}
