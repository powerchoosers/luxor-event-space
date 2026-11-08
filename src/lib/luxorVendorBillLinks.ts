import type { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'

/** Keep suggested/unmatched company names out of a vendor profile until there is an explicit vendor link. */
export function getVendorBillHistory(vendorId: string, bills: LuxorBill[], intakes: LuxorBillIntake[]) {
  const linkedBills = bills.filter((bill) => bill.vendor_id === vendorId)
    .sort((a, b) => String(b.received_at || b.created_at).localeCompare(String(a.received_at || a.created_at)))
  const ids = new Set(linkedBills.map((bill) => bill.id))
  const linkedIntakes = intakes.filter((intake) => Boolean((intake.bill_id && ids.has(intake.bill_id)) || (intake.duplicate_of_bill_id && ids.has(intake.duplicate_of_bill_id))))
  return { bills: linkedBills, intakes: linkedIntakes }
}

/** Only an explicit owner link establishes a vendor for financial attribution. */
export function confirmedVendorBills(bills: LuxorBill[]) { return bills.filter((bill) => bill.vendor_link_method === 'owner') }
