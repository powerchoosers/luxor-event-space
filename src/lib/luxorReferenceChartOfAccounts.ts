export type ChartAccountClassification = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export type ReferenceChartAccount = {
  name: string
  classification: ChartAccountClassification
  number?: string
}

const accounts: ReferenceChartAccount[] = [
  { name: 'Business Checking', classification: 'asset', number: '1000' },
  { name: 'Business Savings', classification: 'asset', number: '1010' },
  { name: 'Cash on Hand', classification: 'asset', number: '1020' },
  { name: 'Accounts Receivable', classification: 'asset', number: '1100' },
  { name: 'Equipment', classification: 'asset', number: '1500' },
  { name: 'Furniture & Fixtures', classification: 'asset', number: '1510' },
  { name: 'Other Assets', classification: 'asset', number: '1990' },
  { name: 'Accounts Payable', classification: 'liability', number: '2000' },
  { name: 'Credit Card Payables', classification: 'liability', number: '2100' },
  { name: 'Loans Payable', classification: 'liability', number: '2200' },
  { name: 'Sales Tax Payable', classification: 'liability', number: '2300' },
  { name: 'Refundable Security Deposits', classification: 'liability', number: '2400' },
  { name: 'Other Liabilities', classification: 'liability', number: '2990' },
  { name: 'Owner Contributions', classification: 'equity', number: '3000' },
  { name: 'Owner Distributions', classification: 'equity', number: '3100' },
  { name: 'Retained Earnings', classification: 'equity', number: '3200' },
  { name: 'Opening Balance Equity', classification: 'equity', number: '3900' },
  { name: 'Venue Rental Revenue', classification: 'income', number: '4000' },
  { name: 'Decor Package Revenue', classification: 'income', number: '4010' },
  { name: 'Add-On Service Revenue', classification: 'income', number: '4020' },
  { name: 'Ticket Sales Revenue', classification: 'income', number: '4030' },
  { name: 'Other Business Income', classification: 'income', number: '4990' },
  { name: 'Rent', classification: 'expense', number: '6000' },
  { name: 'Utilities', classification: 'expense', number: '6010' },
  { name: 'Insurance', classification: 'expense', number: '6020' },
  { name: 'Marketing & Advertising', classification: 'expense', number: '6030' },
  { name: 'Cleaning & Maintenance', classification: 'expense', number: '6040' },
  { name: 'Supplies', classification: 'expense', number: '6050' },
  { name: 'Payroll & Contract Labor', classification: 'expense', number: '6060' },
  { name: 'Software & Subscriptions', classification: 'expense', number: '6070' },
  { name: 'Event-Specific Expenses', classification: 'expense', number: '6080' },
  { name: 'Professional Services', classification: 'expense', number: '6090' },
  { name: 'Bank & Processing Fees', classification: 'expense', number: '6100' },
  { name: 'Other Operating Expenses', classification: 'expense', number: '6990' },
]

const classificationLabels: Record<ChartAccountClassification, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

export function getLuxorReferenceChartOfAccounts() {
  const order: ChartAccountClassification[] = ['asset', 'liability', 'equity', 'income', 'expense']
  return order.map((classification) => ({
    classification,
    label: classificationLabels[classification],
    accounts: accounts.filter((row) => row.classification === classification),
  }))
}

/** Suggest a reference expense account from a portal expense category name (informational only). */
export function suggestReferenceExpenseAccount(categoryName: string): string {
  const normalized = categoryName.trim().toLowerCase()
  if (!normalized) return 'Other Operating Expenses'
  const rules: Array<[RegExp, string]> = [
    [/rent|lease/i, 'Rent'],
    [/utilit|electric|gas|water/i, 'Utilities'],
    [/insur/i, 'Insurance'],
    [/market|advert|promo/i, 'Marketing & Advertising'],
    [/clean|mainten/i, 'Cleaning & Maintenance'],
    [/suppl/i, 'Supplies'],
    [/payroll|labor|staff|wage/i, 'Payroll & Contract Labor'],
    [/software|subscription|saas/i, 'Software & Subscriptions'],
    [/event|decor|floral|cater/i, 'Event-Specific Expenses'],
    [/legal|account|consult|profession/i, 'Professional Services'],
    [/bank|process|stripe|fee/i, 'Bank & Processing Fees'],
  ]
  for (const [pattern, account] of rules) {
    if (pattern.test(normalized)) return account
  }
  return 'Other Operating Expenses'
}
