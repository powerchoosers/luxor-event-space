import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { readMarketingOverviewPages } from './luxorMarketingOverview'

export async function listLuxorBookedAttributionInquiryIds() {
  const [bookingRows, paymentRows] = await Promise.all([
    readMarketingOverviewPages(
      (offset, limit) => supabaseRest<Array<{ inquiry_id: string | null }>>(
        `luxor_bookings?select=inquiry_id&status=neq.cancelled&inquiry_id=not.is.null&limit=${limit}&offset=${offset}`,
      ),
      { pageSize: 1000, maxRows: 10_000 },
    ),
    readMarketingOverviewPages(
      (offset, limit) => supabaseRest<Array<{ inquiry_id: string | null; status: string; metadata: Record<string, unknown> | null }>>(
        `luxor_payments?select=inquiry_id,status,metadata&status=eq.paid&inquiry_id=not.is.null&limit=${limit}&offset=${offset}`,
      ),
      { pageSize: 1000, maxRows: 10_000 },
    ),
  ])

  const inquiryIds = new Set<string>()
  for (const row of bookingRows) {
    if (row.inquiry_id) inquiryIds.add(row.inquiry_id)
  }
  for (const row of paymentRows) {
    if (!row.inquiry_id) continue
    const kind = typeof row.metadata?.payment_kind === 'string' ? row.metadata.payment_kind : ''
    if (kind === 'deposit' || row.metadata?.initial_booking_payment) inquiryIds.add(row.inquiry_id)
  }
  return [...inquiryIds]
}