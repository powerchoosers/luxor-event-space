import { isFunnelInquiryEligible, isFunnelRecordDeleted, hasFunnelTestMetadata } from './luxorFunnelEligibility'
import { funnelDateKey, isFunnelDateKey, type FunnelPeriod } from './luxorFunnelPeriods'
export type FunnelRow = { id: string; [key: string]: unknown }
export type FunnelAnalyticsData = { inquiries: FunnelRow[]; visits: FunnelRow[]; receipts: FunnelRow[]; proposals: FunnelRow[]; payments: FunnelRow[]; invoices: FunnelRow[]; bookings: FunnelRow[] }
export type FunnelMetric = 'newInquiries' | 'toursScheduled' | 'toursCompleted' | 'proposalsSent' | 'depositsReceived' | 'bookedEvents' | 'revenue' | 'conversionRate'
const str = (x: unknown) => typeof x === 'string' ? x : ''
const meta = (r: FunnelRow) => r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? r.metadata as Record<string, unknown> : {}
const unique = (rows: FunnelRow[]) => [...new Map(rows.map(r => [r.id, r])).values()]
const money = (v: unknown): number | null => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(v))) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 1e12 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001 ? n : null
}
// Audited received_date is a Chicago calendar date, not UTC midnight.
// Invalid supplied corrections fail closed rather than silently reverting to paid_at.
export function funnelPaymentDate(payment: FunnelRow): string | null {
  if (payment.received_date != null && payment.received_date !== '') return isFunnelDateKey(payment.received_date) ? payment.received_date : null
  if (typeof payment.paid_at !== 'string' || !Number.isFinite(Date.parse(payment.paid_at))) return null
  try { return funnelDateKey(payment.paid_at) } catch { return null }
}
const receiptLead = (r: FunnelRow): unknown => r.request_payload && typeof r.request_payload === 'object' && !Array.isArray(r.request_payload) ? (r.request_payload as Record<string, unknown>).inquiry_id : undefined
const validTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
export function buildFunnelAnalytics(period: FunnelPeriod, data: FunnelAnalyticsData) {
  const issues: string[] = []
  const inside = (v: unknown) => validTime(v) && Date.parse(str(v)) >= Date.parse(period.startAt) && Date.parse(str(v)) < Date.parse(period.endAt)
  const live = unique(data.inquiries).filter(isFunnelInquiryEligible)
  const leads = new Map(live.map(r => [r.id, r]))
  const eligible = (r: FunnelRow) => leads.has(str(r.inquiry_id)) && !isFunnelRecordDeleted(r) && !hasFunnelTestMetadata(r)
  const cohort = live.filter(r => inside(r.created_at)), cohortIds = new Set(cohort.map(r => r.id))
  const dailyLeads = period.days.map(date => ({ date, count: cohort.filter(r => funnelDateKey(str(r.created_at)) === date).length as number | null }))
  const metrics: Record<FunnelMetric, number | null> = { newInquiries: cohort.length, toursScheduled: 0, toursCompleted: 0, proposalsSent: 0, depositsReceived: 0, bookedEvents: 0, revenue: 0, conversionRate: null }
  const unavailable = (metric: FunnelMetric, message: string) => { metrics[metric] = null; if (!issues.includes(message)) issues.push(message) }
  if (live.some(r => !validTime(r.created_at))) { unavailable('newInquiries', 'Some leads have no valid original creation date.'); dailyLeads.forEach(d => { d.count = null }) }
  for (const visit of unique(data.visits).filter(eligible)) {
    const linkedReceipts = data.receipts.filter(r => r.visit_id === visit.id && r.visit_intent === 'new_visit')
    const badReceipt = linkedReceipts.some(r => (receiptLead(r) != null && receiptLead(r) !== visit.inquiry_id) || (r.inquiry_id != null && r.inquiry_id !== visit.inquiry_id))
    const receipts = linkedReceipts.filter(r => (receiptLead(r) == null || receiptLead(r) === visit.inquiry_id) && (r.inquiry_id == null || r.inquiry_id === visit.inquiry_id)).sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)))
    if (badReceipt || !receipts.length || !validTime(receipts[0].created_at)) unavailable('toursScheduled', 'Some visits lack original scheduling receipts; full scheduling totals cannot be verified.')
    else if (inside(receipts[0].created_at) && metrics.toursScheduled !== null) metrics.toursScheduled++
    if (visit.attendance_status === 'attended') {
      const date = str(visit.tour_date)
      if (!isFunnelDateKey(date)) unavailable('toursCompleted', 'An attended visit has no valid occurrence date.')
      else if (date >= period.startDate && date <= period.endDate && metrics.toursCompleted !== null) metrics.toursCompleted++
    }
  }
  if (live.some(r => !r.current_tour_visit_id && (r.preferred_tour_date || r.tour_attendance_status === 'attended'))) {
    unavailable('toursScheduled', 'Legacy tours without stable visit identity prevent complete scheduling totals.')
    unavailable('toursCompleted', 'Legacy tours without stable visit identity prevent complete attendance totals.')
  }
  const proposals = unique(data.proposals).filter(r => eligible(r) && r.channel === 'email' && ['sent', 'delivered'].includes(str(r.state)))
  if (proposals.some(r => !validTime(r.sent_at) || !r.proposal_family_id)) unavailable('proposalsSent', 'A successful proposal send lacks its timestamp or family identity.')
  else metrics.proposalsSent = new Set(proposals.filter(r => inside(r.sent_at)).map(r => r.proposal_family_id)).size
  if (data.invoices.some(r => eligible(r) && (r.proposal_sent_at || r.proposal_first_sent_at) && !proposals.some(p => p.invoice_id === r.id || (r.proposal_family_id && p.proposal_family_id === r.proposal_family_id)))) unavailable('proposalsSent', 'Legacy proposals lack verified successful send history; full totals cannot be verified.')
  // booked_at is assigned at tentative creation, not reliable confirmation.
  const bookings = unique(data.bookings).filter(r => eligible(r) && (['confirmed', 'completed', 'cancelled'].includes(str(r.status)) || meta(r).reservation_confirmed_at))
  const confirmation = (r: FunnelRow) => meta(r).reservation_confirmed_at
  if (bookings.some(r => !validTime(confirmation(r)))) unavailable('bookedEvents', 'Some bookings lack durable confirmation history; draft creation dates are not used.')
  else metrics.bookedEvents = bookings.filter(r => inside(confirmation(r))).length
  const missingCohort = bookings.some(r => cohortIds.has(str(r.inquiry_id)) && !validTime(confirmation(r)))
  if (missingCohort) issues.push('Some cohort bookings lack confirmation history; conversion cannot be verified.')
  const bookedCohort = missingCohort ? null : new Set(bookings.filter(r => cohortIds.has(str(r.inquiry_id)) && validTime(confirmation(r)) && Date.parse(str(confirmation(r))) < Date.parse(period.endAt)).map(r => r.inquiry_id)).size
  metrics.conversionRate = metrics.newInquiries === null || bookedCohort === null || cohort.length === 0 ? null : bookedCohort / cohort.length * 100
  const invoiceMap = new Map(data.invoices.map(r => [r.id, r])), bookingMap = new Map(data.bookings.map(r => [r.id, r])), seen = new Map<string, { fingerprint: string; relevant: boolean }>()
  for (const payment of unique(data.payments)) {
    const invoice = invoiceMap.get(str(payment.invoice_id))
    const inquiry = str(payment.inquiry_id) || str(bookingMap.get(str(payment.booking_id))?.inquiry_id) || str(invoice?.inquiry_id)
    if (!eligible({ ...payment, inquiry_id: inquiry }) || !['paid', 'refunded'].includes(str(payment.status))) continue
    const kind = str(meta(payment).payment_kind) || str(invoice?.invoice_kind)
    const identity = payment.processor && payment.processor_reference ? `${payment.processor}:${payment.processor_reference}` : payment.id
    const receiptDate = funnelPaymentDate(payment)
    const inPeriod = receiptDate !== null && receiptDate >= period.startDate && receiptDate <= period.endDate
    const fingerprint = JSON.stringify([inquiry, payment.paid_at, payment.received_date ?? null, money(payment.amount), kind, invoice?.invoice_kind || '', meta(payment).refundable_security_deposit ?? null, meta(payment).initial_booking_payment ?? null])
    const relevant = inPeriod || receiptDate === null, prior = seen.get(identity)
    if (prior) {
      if (prior.fingerprint !== fingerprint && (prior.relevant || relevant)) {
        unavailable('revenue', 'Conflicting records share a payment reference; revenue cannot be verified.')
        unavailable('depositsReceived', 'Conflicting records share a payment reference; deposit counts cannot be verified.')
      }
      continue
    }
    seen.set(identity, { fingerprint, relevant })
    if (kind === 'security_deposit' || invoice?.invoice_kind === 'security_deposit') continue
    if (receiptDate === null) { unavailable('revenue', 'A paid payment lacks a valid receipt date.'); if (kind === 'deposit') unavailable('depositsReceived', 'A deposit lacks a valid receipt date.'); continue }
    if (!inPeriod) continue
    if (!kind) unavailable('depositsReceived', 'A paid payment lacks verified deposit classification.')
    if (kind === 'deposit' && metrics.depositsReceived !== null) metrics.depositsReceived++
    const amount = money(payment.amount), rawSecurity = meta(payment).refundable_security_deposit, rawCredit = meta(payment).initial_booking_payment
    const security = rawSecurity == null ? 0 : money(rawSecurity), credit = rawCredit == null ? null : money(rawCredit)
    if (amount === null || security === null || security > amount || (rawCredit != null && (credit === null || credit > amount || credit + security > amount))) {
      unavailable('revenue', 'A paid payment has invalid or conflicting amount details.')
      continue
    }
    const eventAmount = kind === 'deposit' ? credit ?? amount - security : amount
    if (metrics.revenue !== null) metrics.revenue += eventAmount
  }
  if (metrics.revenue !== null) metrics.revenue = Math.round(metrics.revenue * 100) / 100
  return { period, metrics, dailyLeads, cohort: { created: cohort.length, bookedByPeriodEnd: bookedCohort }, issues, definitions: {
    toursScheduled: 'Distinct visits by original scheduling receipt date; reschedules are not new bookings.',
    toursCompleted: 'Attended visits by actual visit date, not the date attendance was recorded.',
    proposalsSent: 'Distinct proposal families successfully emailed in the period; repeated sends count once per family.',
    depositsReceived: 'Successful event-deposit transactions by audited received_date when saved, otherwise paid_at in Chicago; security deposits excluded.',
    bookedEvents: 'Bookings by durable reservation confirmation date, including later cancellations.',
    conversionRate: 'Leads created in this period with a verified booking confirmation before period end, divided by period-created leads.',
    revenue: 'Gross event receipts by audited received_date when saved, otherwise paid_at in Chicago, including later refunds and excluding security portions; not net refund accounting.',
    coverage: 'Undated legacy history can make a metric unavailable for every date range. Source reads are not a transactional snapshot.',
  } }
}
