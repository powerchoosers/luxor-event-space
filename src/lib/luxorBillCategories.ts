// Values match the existing Expense Management category selector.
export const LUXOR_BILL_CATEGORIES = ['Rent', 'Maintenance', 'Utilities', 'Supplies', 'Marketing'] as const
export type LuxorBillCategory = typeof LUXOR_BILL_CATEGORIES[number]
export function isLuxorBillCategory(value: unknown): value is LuxorBillCategory {
  return typeof value === 'string' && (LUXOR_BILL_CATEGORIES as readonly string[]).includes(value)
}
