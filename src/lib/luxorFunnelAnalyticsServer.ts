import 'server-only'
import { supabaseRestStrict, supabaseRestCount } from './supabaseRestServer'
import { buildFunnelAnalytics, type FunnelRow, type FunnelAnalyticsData } from './luxorFunnelAnalytics'
import type { FunnelPeriod } from './luxorFunnelPeriods'
// Explicitly reviewed against Luxor production source columns. Do not download
// invoice content, public tokens, contact details or notification templates.
export const FUNNEL_SOURCE_FIELDS: Record<string, string> = {
  luxor_inquiries: 'id,created_at,is_test,metadata,archived_at,status,pipeline_stage,current_tour_visit_id,preferred_tour_date,tour_attendance_status',
  luxor_tour_visits: 'id,inquiry_id,tour_date,attendance_status',
  luxor_tour_schedule_receipts: 'revision_id,visit_id,visit_intent,created_at,receipt_inquiry_id:request_payload->>inquiry_id',
  luxor_proposal_send_attempts: 'id,inquiry_id,invoice_id,proposal_family_id,channel,state,sent_at',
  luxor_payments: 'id,inquiry_id,booking_id,invoice_id,status,paid_at,received_date,amount,processor,processor_reference,metadata',
  luxor_invoices: 'id,inquiry_id,invoice_kind,proposal_family_id,proposal_sent_at,proposal_first_sent_at',
  luxor_bookings: 'id,inquiry_id,status,metadata',
}
export async function loadFunnelRows(table: string): Promise<FunnelRow[]> {
  const fields = FUNNEL_SOURCE_FIELDS[table]
  if (!fields) throw new Error('Unrecognized funnel source')
  const rows: FunnelRow[] = [], key = table === 'luxor_tour_schedule_receipts' ? 'revision_id' : 'id'
  const path = `${table}?select=${fields}&order=${key}.asc`, expected = await supabaseRestCount(path)
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= 200000) throw new Error('Invalid or excessive source count')
  const identities = new Set<string>()
  for (let offset = 0; offset < expected;) {
    const page = await supabaseRestStrict<FunnelRow[]>(`${path}&limit=1000&offset=${offset}`)
    if (!Array.isArray(page) || !page.length) throw new Error('Incomplete source response')
    for (const row of page) {
      const id = row?.[key]
      if (typeof id !== 'string' || !id.trim() || identities.has(id)) throw new Error('Missing or duplicate source identity')
      identities.add(id)
    }
    rows.push(...page.map(row => table === 'luxor_tour_schedule_receipts' ? { ...row, request_payload: { inquiry_id: row.receipt_inquiry_id ?? null } } : row)); offset += page.length
    if (rows.length > expected) throw new Error('Source changed while loading')
  }
  if (rows.length !== expected || await supabaseRestCount(path) !== expected) throw new Error('Source changed while loading')
  return rows
}
const FUNNEL_SOURCES = {
  inquiries: 'luxor_inquiries',
  visits: 'luxor_tour_visits',
  receipts: 'luxor_tour_schedule_receipts',
  proposals: 'luxor_proposal_send_attempts',
  payments: 'luxor_payments',
  invoices: 'luxor_invoices',
  bookings: 'luxor_bookings',
} as const

export async function loadFunnelAnalyticsData(): Promise<FunnelAnalyticsData> {
  const pairs = await Promise.all(Object.entries(FUNNEL_SOURCES).map(async ([key, table]) => [key, await loadFunnelRows(table)]))
  return Object.fromEntries(pairs) as FunnelAnalyticsData
}

export async function getFunnelAnalytics(period: FunnelPeriod) {
  return buildFunnelAnalytics(period, await loadFunnelAnalyticsData())
}
