type EmbeddedExpense = { id: string } | { id: string }[] | null

type BillWithEmbeddedExpense<TBill> = TBill & {
  id: string
  linked_expense: EmbeddedExpense
}

type LegacyExpense = { id: string; source_bill_id: string | null }

type BillExpenseLoaders<TBill extends { id: string }> = {
  embedded: () => Promise<Array<BillWithEmbeddedExpense<TBill>>>
  bills: () => Promise<TBill[]>
  expenses: (billIds: string[]) => Promise<LegacyExpense[]>
}

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

function isMissingBillExpenseRelationship(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === 'PGRST200'
    && typeof candidate.message === 'string'
    && candidate.message.includes('Could not find a relationship')
    && candidate.message.includes("'luxor_bills'")
    && candidate.message.includes("'luxor_booking_expenses'")
}

function normalizeEmbedded<TBill>(bills: Array<BillWithEmbeddedExpense<TBill>>) {
  return bills.map((bill) => {
    const { linked_expense, ...record } = bill
    if (Array.isArray(linked_expense) && linked_expense.length > 1) {
      throw new Error('A bill has multiple linked expenses; refusing to choose a payment history record.')
    }
    const linkedExpense = Array.isArray(linked_expense) ? linked_expense[0] : linked_expense
    return { ...record, linked_expense_id: linkedExpense?.id || null }
  })
}

/** Prefer a single embedded read, with the former strict queries only when PostgREST cannot resolve this relationship. */
export async function loadOperationsBillsWithExpenseLinks<TBill extends { id: string }>(loaders: BillExpenseLoaders<TBill>) {
  try {
    return normalizeEmbedded(await loaders.embedded())
  } catch (error) {
    if (!isMissingBillExpenseRelationship(error)) throw error

    const bills = await loaders.bills()
    const billIds = bills.map((bill) => bill.id).filter(isUuid)
    const expenses = billIds.length ? await loaders.expenses(billIds) : []
    const expenseByBill = new Map(expenses.flatMap((expense) => (
      expense.source_bill_id ? [[expense.source_bill_id, expense.id] as const] : []
    )))

    return bills.map((bill) => ({ ...bill, linked_expense_id: expenseByBill.get(bill.id) || null }))
  }
}
