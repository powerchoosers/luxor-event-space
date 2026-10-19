import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { LuxorInquiry, LuxorInvoice } from '@/lib/luxorInquiryTypes'
import { calculateLuxorProposal, type LuxorProposalSelection } from '@/lib/luxorProposalPricing'
import {
  getLuxorProposalPricingForInvoice,
  hasFrozenLegacyCustomTimeProposal,
  resolveLuxorOriginalProposalCreatedAt,
  resolveLuxorProposalPromotion,
  resolveLuxorSameDayBooking,
  assertLuxorWeekdayRentalSelection,
} from '@/lib/luxorProposalPricingServer'
import { buildLuxorProposalEmail } from '@/lib/luxorProposalEmailServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { proposalExpirationInstant, proposalValidThrough, luxorCalendarDate } from '@/lib/luxorProposalTerms'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const LUXOR_PERMANENT_TEST_LEAD_ID = '00b264d6-a3fb-4ea3-9142-415f76385c39'
export const LUXOR_TEST_PROPOSAL_RECIPIENT = 'luxoratlaspalmas@gmail.com'

export class LuxorTestProposalConflictError extends Error {
  readonly status = 409
}

type TestRun = { id: string; test_lead_id: string; status: string }
type Artifact = { id: string; status: string; details: Record<string, unknown> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function luxorTestProposalRequestFingerprint(input: {
  testRunId: string
  selection: LuxorProposalSelection
  description: string
  notes: string | null
}) {
  return createHash('sha256').update(stableJson({
    testRunId: input.testRunId,
    action: 'publish',
    selection: input.selection,
    description: input.description.trim(),
    notes: input.notes?.trim() || null,
  })).digest('hex')
}

/**
 * Build the same server-calculated proposal snapshot, email HTML, and PDF used
 * by the normal proposal flow. The only writes happen later through the
 * run-fenced test artifact RPC; this function only reads business rules.
 */
export async function prepareLuxorTestProposal(input: {
  testRunId: string
  selection: LuxorProposalSelection
  description: string
  notes: string | null
  action: 'save' | 'publish'
  expectedRevision: number
}) {
  const [run] = await supabaseRest<TestRun[]>(
    `luxor_test_runs?select=id,test_lead_id,status&id=eq.${encodeURIComponent(input.testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose an active permanent test lead run.')

  const [lead, artifacts, tourArtifacts] = await Promise.all([
    getLuxorInquiry(LUXOR_PERMANENT_TEST_LEAD_ID),
    supabaseRest<Artifact[]>(`luxor_test_run_artifacts?select=id,status,details&test_run_id=eq.${encodeURIComponent(run.id)}&artifact_type=eq.proposal&limit=1`),
    supabaseRest<Pick<Artifact, 'status' | 'details'>[]>(`luxor_test_run_artifacts?select=status,details&test_run_id=eq.${encodeURIComponent(run.id)}&artifact_type=eq.tour&limit=1`),
  ])
  if (!lead || lead.is_test !== true) throw new Error('The permanent test lead is unavailable.')
  if (tourArtifacts[0]?.status !== 'completed' || tourArtifacts[0]?.details?.tour_attendance_status === 'no_show') {
    throw new Error('Complete the simulated tour after an attended visit before saving or publishing a test proposal.')
  }
  const existing = artifacts[0] ?? null
  const requestFingerprint = input.action === 'publish'
    ? luxorTestProposalRequestFingerprint(input)
    : null
  if (existing?.status === 'sent') {
    if (input.action === 'publish' && existing.details.publish_request_fingerprint === requestFingerprint) {
      return {
        run,
        invoice: isRecord(existing.details.invoice) ? existing.details.invoice as unknown as LuxorInvoice : null,
        selection: existing.details.selection,
        email: null,
        pdfBase64: null,
        details: existing.details,
        recipient: LUXOR_TEST_PROPOSAL_RECIPIENT,
        requestFingerprint,
        replayed: true,
      }
    }
    throw new LuxorTestProposalConflictError('This test proposal has already been published with different content. Start a new test run to create another.')
  }
  if (existing && !['simulated', 'drafted'].includes(existing.status)) {
    throw new LuxorTestProposalConflictError('This test proposal cannot be edited in its current state.')
  }

  const storedInvoice = isRecord(existing?.details.invoice) ? existing.details.invoice as unknown as LuxorInvoice : null
  const pricing = await getLuxorProposalPricingForInvoice(storedInvoice)
  assertLuxorWeekdayRentalSelection(input.selection, pricing.config, true, hasFrozenLegacyCustomTimeProposal(storedInvoice))
  const promotion = await resolveLuxorProposalPromotion(input.selection, storedInvoice)
  const originalCreatedAt = await resolveLuxorOriginalProposalCreatedAt(storedInvoice)
  const sameDayBooking = await resolveLuxorSameDayBooking(input.selection, storedInvoice, originalCreatedAt)
  const calculation = calculateLuxorProposal(input.selection, pricing.config, { promotion, sameDayBooking })
  if (!calculation.valid) throw new Error(calculation.calculationErrors[0] || 'The production proposal calculator could not validate this selection.')
  if (calculation.total === null) throw new Error('The selected package requires owner pricing before it can be saved or published.')
  if (input.action === 'publish' && !calculation.publishable) {
    throw new Error(calculation.publicationErrors[0] || 'Complete the production publication requirements before publishing this test proposal.')
  }

  const createdOn = luxorCalendarDate(new Date(originalCreatedAt))
  const validThrough = proposalValidThrough(createdOn, promotion)
  const context = {
    ...calculation.context,
    pricing_config_version: pricing.version,
    original_proposal_created_at: originalCreatedAt,
    proposal_created_on: createdOn,
    valid_through: validThrough,
    calculation_errors: [],
    publication_errors: calculation.publicationErrors,
    pricing_snapshot: {
      ...calculation.snapshot,
      line_items: calculation.lineItems,
      subtotal: calculation.subtotal,
      discount_amount: calculation.discountAmount,
      tax_amount: calculation.taxAmount,
      final_event_price: calculation.total,
      refundable_security_deposit: calculation.refundable_security_deposit,
    },
  }
  const now = new Date().toISOString()
  const selectionRecord = input.selection as unknown as Record<string, unknown>
  const promotionDiscountType = promotion?.discount_type === 'fixed' || promotion?.discount_type === 'complimentary'
    ? 'fixed'
    : 'percent'
  const discountType = promotion ? promotionDiscountType
    : selectionRecord.discountType === 'fixed' || selectionRecord.discount_type === 'fixed' ? 'fixed' : 'percent'
  const discountValue = promotion?.discount_type === 'complimentary' ? 0
    : Number(promotion?.value ?? selectionRecord.discountValue ?? selectionRecord.discount_value ?? 0) || 0
  const sameDayCoverageAmount = Number(context.same_day_booking?.coverage_amount || 0)
  const calculatedSubtotal = Math.max(0, Math.round((calculation.total + sameDayCoverageAmount - calculation.taxAmount) * 100) / 100)
  const originalSubtotal = Math.round((calculatedSubtotal + calculation.discountAmount) * 100) / 100
  const invoice: LuxorInvoice = {
    id: typeof storedInvoice?.id === 'string' ? storedInvoice.id : randomUUID(),
    created_at: typeof storedInvoice?.created_at === 'string' ? storedInvoice.created_at : now,
    updated_at: now,
    inquiry_id: lead.id,
    client_name: lead.full_name,
    event_type: typeof context.event_type === 'string' ? context.event_type : lead.event_type || 'Event Booking',
    description: input.description.trim(),
    line_items: calculation.lineItems,
    subtotal: calculatedSubtotal,
    tax_rate: calculation.taxRate,
    total: calculation.total,
    original_subtotal: originalSubtotal,
    original_total: Math.round(originalSubtotal * (1 + calculation.taxRate) * 100) / 100,
    discount_percent: calculation.discountAmount > 0 && discountType === 'percent' ? discountValue : 0,
    discount_amount: calculation.discountAmount,
    discount_type: discountType,
    discount_value: discountValue,
    promotion_id: promotion?.id ?? null,
    promotion_snapshot: promotion ? { ...promotion, amount: calculation.discountAmount } : {},
    offer_expires_at: proposalExpirationInstant(validThrough),
    offer_status: 'active',
    status: input.action === 'publish' ? 'sent' : 'draft',
    due_date: validThrough,
    paid_at: null,
    notes: input.notes,
    invoice_kind: 'event',
    proposal_number: 1,
    proposal_sent_at: input.action === 'publish' ? now : null,
    proposal_context: context,
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  const reviewUrl = `${baseUrl}/portal/leads/${encodeURIComponent(lead.id)}?testRunId=${encodeURIComponent(run.id)}&createTestProposal=1`
  const testInquiry: LuxorInquiry = { ...lead, email: LUXOR_TEST_PROPOSAL_RECIPIENT }
  const email = input.action === 'publish'
    ? buildLuxorProposalEmail({ invoice, inquiry: testInquiry, reviewUrl, testOnly: true })
    : null
  const pdf = input.action === 'publish' ? await buildLuxorInvoicePdf(invoice, testInquiry) : null
  const details: Record<string, unknown> = {
    simulation_only: true,
    invoice,
    selection: input.selection,
    ...(requestFingerprint ? { publish_request_fingerprint: requestFingerprint } : {}),
  }
  if (email && pdf) {
    details.email = { subject: email.subject, html: email.html, recipient: LUXOR_TEST_PROPOSAL_RECIPIENT }
    details.pdf = { filename: `Luxor-Final-Proposal-${invoice.id.slice(0, 8)}.pdf`, base64: Buffer.from(pdf).toString('base64') }
  }

  return {
    run,
    invoice,
    selection: input.selection,
    email,
    pdfBase64: pdf ? Buffer.from(pdf).toString('base64') : null,
    details,
    recipient: LUXOR_TEST_PROPOSAL_RECIPIENT,
    requestFingerprint,
    replayed: false,
  }
}
