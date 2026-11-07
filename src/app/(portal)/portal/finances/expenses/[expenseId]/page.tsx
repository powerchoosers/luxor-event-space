import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'

export default async function ExpenseDetailPage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  return <ExpenseManagement view="detail" expenseId={expenseId} />
}
