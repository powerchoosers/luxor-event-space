import { NextRequest, NextResponse } from 'next/server'
import { listInvoices, listInvoicesByInquiry, createInvoice, getInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorCatalogItem } from '@/lib/luxorServiceCatalog'
import { calculateLuxorProposal, type LuxorProposalSelection } from '@/lib/luxorProposalPricing'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'
import { calculateLuxorOfferPricing, clampLuxorDiscountPercent, luxorOfferSnapshot } from '@/lib/luxorOffer'
import { expireLuxorCheckoutForRepricing } from '@/lib/luxorStripeCheckoutServer'
import { getLuxorBooking, getLuxorBookingByInvoice, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getActiveLuxorSignatureRequestByBooking, getLatestLuxorSignatureRequestByBooking, getLuxorBookingContractFingerprint, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorLeadEventForInquiry } from '@/lib/luxorLeadEventsServer'
import type { LuxorInvoiceLineItem, LuxorInvoiceStatus, LuxorProposalContext } from '@/lib/luxorInquiryTypes'

const PRICING_CONFIGURATION_REQUIRED = 'Pricing configuration required — administrator review.'

type UnknownRecord = Record<string, unknown>

class ProposalPricingConfigurationError extends Error {
  constructor() {
    super(PRICING_CONFIGURATION_REQUIRED)
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? roundMoney(parsed) : null
}

function nonNegativeMoney(value: unknown) {
  const amount = numberValue(value)
  return amount === null ? null : Math.max(0, amount)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function recordFrom(value: unknown) {
  return isRecord(value) ? value : null
}

function proposalSelectionFrom(body: UnknownRecord): LuxorProposalSelection | null {
  const raw = body.proposal_selection ?? body.proposalSelection ?? body.selection
  return isRecord(raw) ? raw as LuxorProposalSelection : null
}

function declaredInvoiceKind(value: unknown): 'event' | 'deposit' | 'final_balance' | null {
  if (value === undefined || value === null || value === '') return 'event'
  return value === 'event' || value === 'deposit' || value === 'final_balance' ? value : null
}

function calculationHasErrors(calculation: UnknownRecord) {
  return calculation.valid === false || (Array.isArray(calculation.errors) && calculation.errors.length > 0)
}

function isRefundableSecurityDepositLine(item: LuxorInvoiceLineItem) {
  return item.paymentBucket === 'security_deposit' || item.category === 'Security Deposit' || /refundable\s+security\s+deposit/i.test(item.description)
}

function normaliseCalculatedLineItems(value: unknown): LuxorInvoiceLineItem[] {
  if (!Array.isArray(value)) throw new ProposalPricingConfigurationError()

  const pricingRoles = new Set<NonNullable<LuxorInvoiceLineItem['pricingRole']>>(['required', 'included', 'add_on', 'discount', 'tax', 'custom'])
  const paymentBuckets = new Set<NonNullable<LuxorInvoiceLineItem['paymentBucket']>>(['venue', 'event', 'security_deposit'])
  const lines = value.map((raw): LuxorInvoiceLineItem | null => {
    const line = recordFrom(raw)
    if (!line) return null
    const description = stringValue(line.description)
    const quantity = numberValue(line.quantity)
    const unitPrice = numberValue(line.unitPrice ?? line.unit_price)
    const total = numberValue(line.total ?? line.lineTotal ?? line.line_total)
    if (!description || quantity === null || quantity <= 0 || unitPrice === null || total === null) return null

    const rawPricingRole = line.pricingRole ?? line.pricing_role
    const pricingRole = typeof rawPricingRole === 'string' && pricingRoles.has(rawPricingRole as NonNullable<LuxorInvoiceLineItem['pricingRole']>)
      ? rawPricingRole as NonNullable<LuxorInvoiceLineItem['pricingRole']>
      : undefined
    const rawPaymentBucket = line.paymentBucket ?? line.payment_bucket
    const paymentBucket = typeof rawPaymentBucket === 'string' && paymentBuckets.has(rawPaymentBucket as NonNullable<LuxorInvoiceLineItem['paymentBucket']>)
      ? rawPaymentBucket as NonNullable<LuxorInvoiceLineItem['paymentBucket']>
      : undefined

    return {
      ...(stringValue(line.catalogId) ? { catalogId: stringValue(line.catalogId) as string } : {}),
      ...(stringValue(line.category) ? { category: stringValue(line.category) as string } : {}),
      ...(line.included === true ? { included: true } : {}),
      ...(pricingRole ? { pricingRole } : {}),
      ...(stringValue(line.pricingRuleId ?? line.pricing_rule_id) ? { pricingRuleId: stringValue(line.pricingRuleId ?? line.pricing_rule_id) as string } : {}),
      ...(paymentBucket ? { paymentBucket } : {}),
      ...(line.required === true ? { required: true } : {}),
      ...(stringValue(line.detail) ? { detail: stringValue(line.detail) as string } : {}),
      description,
      quantity,
      unitPrice,
      total,
    }
  }).filter((line): line is LuxorInvoiceLineItem => Boolean(line))

  if (!lines.length || lines.length !== value.length) throw new ProposalPricingConfigurationError()
  return lines.filter((line) => !isRefundableSecurityDepositLine(line))
}

function discountSelection(selection: LuxorProposalSelection, discountAmount: number) {
  const rawSelection = selection as unknown as UnknownRecord
  const explicitDiscount = recordFrom(rawSelection.discount)
  const type = explicitDiscount?.type === 'fixed' || rawSelection.discountType === 'fixed' || rawSelection.discount_type === 'fixed'
    ? 'fixed' as const
    : 'percent' as const
  const value = nonNegativeMoney(explicitDiscount?.value ?? rawSelection.discountValue ?? rawSelection.discount_value) ?? 0
  return discountAmount > 0 ? { type, value } : { type, value: 0 }
}

function paymentPlanSelection(selection: LuxorProposalSelection) {
  const rawSelection = selection as unknown as UnknownRecord
  const plan = recordFrom(rawSelection.paymentPlan ?? rawSelection.payment_plan)
  if (!plan) return undefined
  const mode = plan.mode === 'deposit_and_balance' || plan.mode === 'pay_in_full' ? plan.mode : null
  const bookingPaymentPercent = nonNegativeMoney(plan.booking_payment_percent ?? plan.bookingPaymentPercent)
  const finalPaymentDueDays = numberValue(plan.final_payment_due_days_before_event ?? plan.finalPaymentDueDaysBeforeEvent)
  if (!mode || bookingPaymentPercent === null || bookingPaymentPercent > 100 || finalPaymentDueDays === null ||
    !Number.isInteger(finalPaymentDueDays) || finalPaymentDueDays < 0 ||
    (mode === 'deposit_and_balance' && bookingPaymentPercent <= 0)) {
    throw new ProposalPricingConfigurationError()
  }
  return {
    mode,
    booking_payment_percent: bookingPaymentPercent,
    final_payment_due_days_before_event: finalPaymentDueDays,
  } as const
}

type ServerCalculatedProposal = {
  lineItems: LuxorInvoiceLineItem[]
  subtotal: number
  originalSubtotal: number
  originalTotal: number
  discountAmount: number
  taxRate: number
  total: number
  proposalContext: LuxorProposalContext
  discount: { type: 'percent' | 'fixed'; value: number }
}

type InvoiceRouteUpdates = Parameters<typeof updateInvoice>[1] & {
  event_type?: string | null
  description?: string | null
}

const INVOICE_STATUSES = new Set<LuxorInvoiceStatus>(['draft', 'sent', 'paid', 'overdue', 'cancelled'])

async function calculateServerProposal(selection: LuxorProposalSelection): Promise<ServerCalculatedProposal> {
  let pricingRecord: Awaited<ReturnType<typeof getDefaultLuxorProposalPricing>>
  let calculation: unknown
  try {
    pricingRecord = await getDefaultLuxorProposalPricing()
    calculation = calculateLuxorProposal(selection, pricingRecord.config)
  } catch {
    throw new ProposalPricingConfigurationError()
  }

  const record = recordFrom(calculation)
  if (!record || calculationHasErrors(record)) throw new ProposalPricingConfigurationError()

  const rawContext = recordFrom(record.proposalContext) || recordFrom(record.proposal_context) || recordFrom(record.context)
  const lineItems = normaliseCalculatedLineItems(record.lineItems ?? record.line_items)
  const total = nonNegativeMoney(record.total ?? rawContext?.final_event_price)
  const discountAmount = nonNegativeMoney(record.discountAmount ?? record.discount_amount ?? record.discount) ?? 0
  const taxAmount = nonNegativeMoney(record.taxAmount ?? record.tax_amount ?? record.tax) ?? 0
  const configuredTaxRate = nonNegativeMoney(record.taxRate ?? record.tax_rate ?? rawContext?.tax_rate)
  const taxRate = configuredTaxRate === null ? 0 : Math.min(1, configuredTaxRate > 1 ? configuredTaxRate / 100 : configuredTaxRate)
  const subtotal = nonNegativeMoney(record.netSubtotal ?? record.net_subtotal) ?? (total === null ? null : Math.max(0, roundMoney(total - taxAmount)))
  const originalSubtotal = nonNegativeMoney(record.originalSubtotal ?? record.original_subtotal ?? record.subtotal) ?? (subtotal === null ? null : roundMoney(subtotal + discountAmount))
  const originalTotal = nonNegativeMoney(record.originalTotal ?? record.original_total) ?? (originalSubtotal === null ? null : roundMoney(originalSubtotal * (1 + taxRate)))
  if (total === null || subtotal === null || originalSubtotal === null || originalTotal === null || !rawContext) {
    throw new ProposalPricingConfigurationError()
  }
  const lineItemsTotal = roundMoney(lineItems.reduce((sum, item) => sum + Number(item.total || 0), 0))
  if (Math.abs(lineItemsTotal - total) >= 0.005) throw new ProposalPricingConfigurationError()

  const finalEventPrice = nonNegativeMoney(rawContext.final_event_price) ?? total
  if (Math.abs(finalEventPrice - total) >= 0.005) throw new ProposalPricingConfigurationError()
  const refundableSecurityDeposit = nonNegativeMoney(rawContext.refundable_security_deposit)
  if (refundableSecurityDeposit === null) throw new ProposalPricingConfigurationError()

  const proposalContext: LuxorProposalContext = {
    ...rawContext,
    version: Math.max(1, Math.floor(numberValue(rawContext.version) ?? 1)),
    pricing_config_version: Math.max(1, Math.floor(Number(pricingRecord.version || 1))),
    pricing_selection: selection as unknown as Record<string, unknown>,
    ...(rawContext.payment_plan ? {} : { payment_plan: paymentPlanSelection(selection) }),
    final_event_price: total,
    refundable_security_deposit: refundableSecurityDeposit,
    calculation_errors: [],
    pricing_snapshot: {
      ...(recordFrom(record.snapshot) || {}),
      line_items: lineItems,
      subtotal: originalSubtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      final_event_price: total,
      refundable_security_deposit: refundableSecurityDeposit,
    },
  }

  return {
    lineItems,
    subtotal,
    originalSubtotal,
    originalTotal,
    discountAmount,
    taxRate,
    total,
    proposalContext,
    discount: discountSelection(selection, discountAmount),
  }
}

async function revisedProposalVersion(params: {
  supersedesInvoiceId: string | null
  inquiryId: string | null
}) {
  if (!params.supersedesInvoiceId) return { supersedesInvoiceId: null, proposalVersion: 1 }
  if (!params.inquiryId) return null

  const prior = await getInvoice(params.supersedesInvoiceId)
  if (!prior || prior.invoice_kind !== 'event' || prior.inquiry_id !== params.inquiryId || prior.proposal_accepted_at || prior.booking_id || prior.status === 'paid') return null

  const priorBooking = prior.booking_id
    ? await getLuxorBooking(prior.booking_id) || await getLuxorBookingByInvoice(prior.id)
    : await getLuxorBookingByInvoice(prior.id)
  if (priorBooking?.contract_status === 'signed') return null
  if (priorBooking) {
    const signature = await getLatestLuxorSignatureRequestByBooking(priorBooking.id)
    if (signature?.status === 'signed') return null
  }

  return {
    supersedesInvoiceId: prior.id,
    proposalVersion: Math.max(1, Math.floor(Number(prior.proposal_version || 1)) + 1),
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (inquiryId) {
      const invoices = await listInvoicesByInquiry(inquiryId)
      return NextResponse.json(invoices)
    }

    const invoices = await listInvoices(1000)
    return NextResponse.json(invoices)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch invoices.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as UnknownRecord
    const clientName = stringValue(body.client_name)
    const inquiryId = stringValue(body.inquiry_id)
    const leadEventId = stringValue(body.lead_event_id)
    const selection = proposalSelectionFrom(body)
    const requestedInvoiceKind = declaredInvoiceKind(body.invoice_kind)
    const explicitlyRequestsFinalProposal = body.invoice_kind === 'event' ||
      body.final_proposal === true ||
      body.is_final_proposal === true ||
      body.proposal_context !== undefined ||
      body.proposal_version !== undefined ||
      body.supersedes_invoice_id !== undefined

    if (!clientName) {
      return NextResponse.json({ error: 'client_name is required.' }, { status: 400 })
    }
    if (!requestedInvoiceKind) {
      return NextResponse.json({ error: 'invoice_kind must be event, deposit, or final_balance.' }, { status: 400 })
    }
    if (leadEventId && (!inquiryId || !await getLuxorLeadEventForInquiry(leadEventId, inquiryId))) {
      return NextResponse.json({ error: 'The selected event does not belong to this lead.' }, { status: 400 })
    }

    const offerExpiresAt = body.offer_expires_at ? new Date(String(body.offer_expires_at)) : null
    if (body.offer_expires_at && (!offerExpiresAt || Number.isNaN(offerExpiresAt.getTime()))) {
      return NextResponse.json({ error: 'Choose a valid offer expiration date and time.' }, { status: 400 })
    }
    if (offerExpiresAt && offerExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The offer expiration must be in the future.' }, { status: 400 })
    }
    if (offerExpiresAt && offerExpiresAt.getTime() < Date.now() + 30 * 60_000) {
      return NextResponse.json({ error: 'Set the offer expiration at least 30 minutes ahead so Stripe can safely create a checkout session.' }, { status: 400 })
    }

    if (selection) {
      if (requestedInvoiceKind !== 'event') {
        return NextResponse.json({ error: 'A proposal selection can only create a final event proposal.' }, { status: 400 })
      }
      const calculated = await calculateServerProposal(selection)
      const revision = await revisedProposalVersion({
        supersedesInvoiceId: stringValue(body.supersedes_invoice_id),
        inquiryId,
      })
      if (!revision) {
        return NextResponse.json({ error: 'A revised final proposal can only supersede an unsigned, unpaid proposal for this same lead.' }, { status: 409 })
      }

      const invoice = await createInvoice({
        client_name: clientName,
        event_type: stringValue(calculated.proposalContext.event_type) ?? stringValue(body.event_type),
        description: stringValue(body.description),
        line_items: calculated.lineItems,
        subtotal: calculated.subtotal,
        tax_rate: calculated.taxRate,
        total: calculated.total,
        original_subtotal: calculated.originalSubtotal,
        original_total: calculated.originalTotal,
        discount_percent: calculated.discount.type === 'percent' ? calculated.discount.value : 0,
        discount_amount: calculated.discountAmount,
        discount_type: calculated.discount.type,
        discount_value: calculated.discount.value,
        offer_expires_at: offerExpiresAt?.toISOString() || null,
        due_date: stringValue(body.due_date),
        inquiry_id: inquiryId,
        lead_event_id: leadEventId,
        notes: stringValue(body.notes),
        invoice_kind: 'event',
        proposal_context: calculated.proposalContext,
        supersedes_invoice_id: revision.supersedesInvoiceId,
        proposal_version: revision.proposalVersion,
      })

      if (invoice.inquiry_id) {
        try {
          const inquiry = await getLuxorInquiry(invoice.inquiry_id)
          if (inquiry) await queueInvoiceReminderTexts(invoice, { phone: inquiry.phone, name: inquiry.full_name })
        } catch (automationError) {
          console.error('Invoice created, but its text reminders could not be queued:', automationError)
        }
      }

      return NextResponse.json(invoice, { status: 201 })
    }

    if (explicitlyRequestsFinalProposal) {
      return NextResponse.json({ error: 'A proposal selection is required before a final event proposal can be created.' }, { status: 400 })
    }

    const { event_type, description, line_items, tax_rate, due_date, notes, discount_percent, offer_expires_at } = body
    if (!Array.isArray(line_items)) {
      return NextResponse.json({ error: 'line_items are required for a non-event invoice.' }, { status: 400 })
    }

    const normalizedItems = line_items.map((item) => {
      const rawItem = recordFrom(item) || {}
      const quantity = Math.max(1, Number(rawItem.quantity) || 1)
      const unitPrice = Math.max(0, Number(rawItem.unitPrice) || 0)
      return {
        id: typeof rawItem.id === 'string' && rawItem.id.trim() ? rawItem.id.trim().slice(0, 120) : crypto.randomUUID(),
        ...(typeof rawItem.catalogId === 'string' ? { catalogId: rawItem.catalogId } : {}),
        ...(typeof rawItem.category === 'string' ? { category: rawItem.category } : {}),
        ...(rawItem.included === true ? { included: true } : {}),
        description: String(rawItem.description || '').trim(),
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      }
    }).filter((item) => item.description)
    if (!normalizedItems.length) return NextResponse.json({ error: 'At least one line item is required.' }, { status: 400 })
    for (const item of normalizedItems) {
      const catalogItem = getLuxorCatalogItem(item.catalogId)
      if (catalogItem?.requiresCustomPrice && item.unitPrice <= 0) {
        return NextResponse.json({ error: `${item.description} needs an agreed price before the proposal can be created.` }, { status: 400 })
      }
      if (catalogItem?.minimumCharge && item.total + 0.005 < catalogItem.minimumCharge) {
        return NextResponse.json({ error: `${item.description} has a ${catalogItem.minimumCharge.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} minimum.` }, { status: 400 })
      }
    }
    const normalizedTaxRate = Math.min(1, Math.max(0, Number(tax_rate) || 0))
    const discountPercent = clampLuxorDiscountPercent(discount_percent)
    const pricing = calculateLuxorOfferPricing({ lineItems: normalizedItems, taxRate: normalizedTaxRate, discountPercent })

    const invoice = await createInvoice({
      client_name: clientName,
      event_type: typeof event_type === 'string' ? event_type : null,
      description: typeof description === 'string' ? description : null,
      line_items: normalizedItems,
      subtotal: pricing.subtotal,
      tax_rate: normalizedTaxRate,
      total: pricing.total,
      original_subtotal: pricing.originalSubtotal,
      original_total: pricing.originalTotal,
      discount_percent: pricing.discountPercent,
      discount_amount: pricing.discountAmount,
      offer_expires_at: offerExpiresAt?.toISOString() || null,
      due_date: typeof due_date === 'string' ? due_date : null,
      inquiry_id: inquiryId,
      lead_event_id: leadEventId,
      notes: typeof notes === 'string' ? notes : null,
      invoice_kind: requestedInvoiceKind,
    })

    if (invoice.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(invoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(invoice, { phone: inquiry.phone, name: inquiry.full_name })
        }
      } catch (automationError) {
        console.error('Invoice created, but its text reminders could not be queued:', automationError)
      }
    }

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    if (error instanceof ProposalPricingConfigurationError) {
      return NextResponse.json({ error: PRICING_CONFIGURATION_REQUIRED }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to create invoice.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as UnknownRecord
    const id = stringValue(body.id)

    if (!id) {
      return NextResponse.json({ error: 'Invoice id is required.' }, { status: 400 })
    }

    const existing = await getInvoice(id)
    if (!existing) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    if (existing.status === 'paid') return NextResponse.json({ error: 'A paid invoice cannot be repriced.' }, { status: 409 })

    const isEventInvoice = existing.invoice_kind === 'event'
    if (isEventInvoice && (existing.status === 'sent' || Boolean(existing.price_locked_at))) {
      return NextResponse.json({ error: 'This final proposal is already published. Create a revised proposal instead of changing this version.' }, { status: 409 })
    }

    const selection = proposalSelectionFrom(body)
    const attemptsManualEventPricing = body.line_items !== undefined ||
      body.tax_rate !== undefined ||
      body.discount_percent !== undefined ||
      body.discount_type !== undefined ||
      body.discount_value !== undefined ||
      body.subtotal !== undefined ||
      body.total !== undefined ||
      body.original_subtotal !== undefined ||
      body.original_total !== undefined ||
      body.proposal_context !== undefined

    if (isEventInvoice && !selection && attemptsManualEventPricing) {
      return NextResponse.json({ error: 'A proposal selection is required to recalculate an event proposal. Create a revised proposal after it has been published.' }, { status: 400 })
    }
    if (selection && !isEventInvoice) {
      return NextResponse.json({ error: 'A proposal selection can only recalculate an unlocked event proposal.' }, { status: 409 })
    }

    const updates: InvoiceRouteUpdates = {}
    if (typeof body.status === 'string' && INVOICE_STATUSES.has(body.status as LuxorInvoiceStatus)) updates.status = body.status as LuxorInvoiceStatus
    if (body.paid_at === null || typeof body.paid_at === 'string') updates.paid_at = body.paid_at
    if (body.due_date === null || typeof body.due_date === 'string') updates.due_date = body.due_date
    if (body.notes === null || typeof body.notes === 'string') updates.notes = body.notes
    if (body.event_type === null || typeof body.event_type === 'string') updates.event_type = body.event_type
    if (body.description === null || typeof body.description === 'string') updates.description = body.description
    if (body.offer_expires_at === null || typeof body.offer_expires_at === 'string') updates.offer_expires_at = body.offer_expires_at

    let offerTermsChanged = selection !== null || body.offer_expires_at !== undefined
    if (selection) {
      const calculated = await calculateServerProposal(selection)
      updates.line_items = calculated.lineItems
      updates.tax_rate = calculated.taxRate
      updates.subtotal = calculated.subtotal
      updates.total = calculated.total
      updates.original_subtotal = calculated.originalSubtotal
      updates.original_total = calculated.originalTotal
      updates.discount_percent = calculated.discount.type === 'percent' ? calculated.discount.value : 0
      updates.discount_amount = calculated.discountAmount
      updates.discount_type = calculated.discount.type
      updates.discount_value = calculated.discount.value
      updates.proposal_context = calculated.proposalContext
    } else {
      const legacyPricingChanged = Array.isArray(body.line_items) || body.tax_rate !== undefined || body.discount_percent !== undefined
      const nextItems = Array.isArray(body.line_items) ? body.line_items as LuxorInvoiceLineItem[] : existing.line_items
      const nextTaxRate = body.tax_rate === undefined ? Number(existing.tax_rate || 0) : Math.min(1, Math.max(0, Number(body.tax_rate) || 0))
      const nextDiscountPercent = body.discount_percent === undefined ? Number(existing.discount_percent || 0) : clampLuxorDiscountPercent(body.discount_percent)
      if (legacyPricingChanged) {
        const pricing = calculateLuxorOfferPricing({ lineItems: nextItems, taxRate: nextTaxRate, discountPercent: nextDiscountPercent })
        updates.line_items = nextItems
        updates.tax_rate = nextTaxRate
        updates.subtotal = pricing.subtotal
        updates.total = pricing.total
        updates.original_subtotal = pricing.originalSubtotal
        updates.original_total = pricing.originalTotal
        updates.discount_percent = pricing.discountPercent
        updates.discount_amount = pricing.discountAmount
        offerTermsChanged = true
      }
    }

    if (updates.offer_expires_at) {
      const expiry = new Date(String(updates.offer_expires_at))
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now() + 30 * 60_000) {
        return NextResponse.json({ error: 'Set the offer expiration at least 30 minutes ahead.' }, { status: 400 })
      }
      updates.offer_expires_at = expiry.toISOString()
    }

    if (offerTermsChanged && existing.stripe_checkout_session_id) {
      await expireLuxorCheckoutForRepricing(existing)
    }

    const updatedInvoice = await updateInvoice(id, updates)
    if (updatedInvoice && offerTermsChanged) {
      const booking = await getLuxorBookingByInvoice(updatedInvoice.id)
      if (booking) {
        const refreshedBooking = await updateLuxorBooking(booking.id, {
          contract_total: Number(updatedInvoice.total || 0),
          metadata: {
            ...booking.metadata,
            proposalLineItems: updatedInvoice.line_items,
            proposalTaxRate: Number(updatedInvoice.tax_rate || 0),
            proposalOffer: luxorOfferSnapshot(updatedInvoice),
          },
        }) || booking
        const activeAgreement = await getActiveLuxorSignatureRequestByBooking(refreshedBooking.id)
        if (activeAgreement && activeAgreement.metadata?.bookingFingerprint !== getLuxorBookingContractFingerprint(refreshedBooking)) {
          const invalidatedAt = new Date().toISOString()
          await updateLuxorSignatureRequest(activeAgreement.id, {
            status: 'void',
            expires_at: invalidatedAt,
            metadata: {
              ...(activeAgreement.metadata || {}),
              invalidatedAt,
              invalidatedReason: 'Proposal financial terms changed before signature.',
            },
          })
          await recordLuxorSignatureEvent({
            signatureRequestId: activeAgreement.id,
            eventType: 'invalidated',
            metadata: { reason: 'Proposal financial terms changed before signature.' },
          })
          await updateLuxorBooking(refreshedBooking.id, { contract_status: 'void' })
          if (refreshedBooking.inquiry_id) {
            await createNote(refreshedBooking.inquiry_id, 'Unsigned agreement invalidated because proposal financial terms changed. Send a new agreement before the client signs.', 'status_change', session.email)
          }
        }
      }
    }
    if (updatedInvoice?.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(updatedInvoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(updatedInvoice, { phone: inquiry.phone, name: inquiry.full_name })
        }
      } catch (automationError) {
        console.error('Invoice updated, but its text reminders could not be queued:', automationError)
      }
    }
    return NextResponse.json(updatedInvoice)
  } catch (error) {
    if (error instanceof ProposalPricingConfigurationError) {
      return NextResponse.json({ error: PRICING_CONFIGURATION_REQUIRED }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to update invoice.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
