import 'server-only'

import { LUXOR_OWNER_CONFIRMED_LEGACY_TEST_INQUIRY_IDS } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

type BrochureClickSummary = { lead_count: number; click_count: number; latest_clicked_at: string | null }

export async function getBrochureClickSummary(start: string, end: string, inquiryId: string | null = null) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) !== '0000'
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  if (!validDate(start) || !validDate(end) || start > end
    || (inquiryId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId))) {
    throw new Error('Invalid brochure engagement range or lead')
  }
  const rows = await supabaseRest<BrochureClickSummary[]>('rpc/luxor_brochure_clicks', {
    method: 'POST',
    body: JSON.stringify({ p_start: start, p_end: end, p_inquiry_id: inquiryId, p_excluded_ids: [...LUXOR_OWNER_CONFIRMED_LEGACY_TEST_INQUIRY_IDS] }),
  })
  const summary = rows?.[0]
  if (!summary || !Number.isSafeInteger(summary.lead_count) || summary.lead_count < 0
    || !Number.isSafeInteger(summary.click_count) || summary.click_count < 0
    || (summary.latest_clicked_at !== null && typeof summary.latest_clicked_at !== 'string')) {
    throw new Error('Invalid brochure engagement response')
  }
  return summary
}
