import { redirect } from 'next/navigation'

export default function BillsPage() {
  redirect('/portal/finances?view=bill-review')
}
