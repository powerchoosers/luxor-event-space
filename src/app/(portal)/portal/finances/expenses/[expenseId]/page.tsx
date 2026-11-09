import { redirect } from 'next/navigation'

export default async function LegacyExpenseDetail({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  redirect(`/portal/finances?view=expense-detail&expense=${encodeURIComponent(expenseId)}`)
}
