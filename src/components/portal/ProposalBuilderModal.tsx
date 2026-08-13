'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Eye,
  FileText,
  Handshake,
  Mail,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { LuxorInvoiceLineItem, LuxorProposalContext, LuxorProposalPaymentPlan } from '@/lib/luxorInquiryTypes'
import { PortalCloseButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { ProposalPackageItemsPanel } from '@/components/portal/ProposalPackageItemsPanel'
import { ProposalPaymentSchedule } from '@/components/portal/ProposalPaymentSchedule'

type ProposalSubmitAction = 'save' | 'email'

type ProposalPackageId = 'rent_only' | 'bronze' | 'silver' | 'gold'

export type ProposalBuilderContext = Partial<LuxorProposalContext> & {
  package_id?: string
  package_name?: string
  pricing_selection?: Record<string, unknown>
}

export type ProposalServiceOption = {
  id: string
  name: string
  category: string
  detail?: string
  exclusiveGroup?: 'decor' | 'catering' | 'photo_booth' | 'bar'
  quantityLabel?: string
}

type CalculatedPackage = {
  id: string
  name: string
  description?: string
  finalEventPrice?: number
  refundableSecurityDeposit?: number
  amountDueToBook?: number
  subtotal?: number
  discountAmount?: number
  taxAmount?: number
  taxRate?: number
  lineItems?: LuxorInvoiceLineItem[]
  warnings?: string[]
  errors?: string[]
}

export type ProposalPricingCalculation = {
  context?: Partial<LuxorProposalContext>
  packages?: CalculatedPackage[]
  lineItems?: LuxorInvoiceLineItem[]
  warnings?: string[]
  calculationErrors?: string[]
  publicationErrors?: string[]
  requirements?: {
    paymentPlan?: boolean
  }
  errors?: string[]
  [key: string]: unknown
}

type ProposalBuilderModalProps = {
  isOpen: boolean
  onClose: () => void
  isEditing?: boolean
  clientName: string
  clientEmail?: string | null
  eventType?: string | null
  eventDate?: string | null
  /** Optional event controls keep the builder usable before a lead field has been saved. */
  onEventDateChange?: (value: string) => void
  eventGuestCount?: number | string | null
  onEventGuestCountChange?: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  dueDate: string
  onDueDateChange: (value: string) => void
  offerExpiryTime: string
  onOfferExpiryTimeChange: (value: string) => void
  /** Legacy controlled discount values remain supported while the parent migrates to the explicit type/value pair. */
  discountPercent: string
  onDiscountPercentChange: (value: string) => void
  discountType?: 'percent' | 'fixed'
  onDiscountTypeChange?: (value: 'percent' | 'fixed') => void
  discountValue?: string
  onDiscountValueChange?: (value: string) => void
  items: LuxorInvoiceLineItem[]
  onItemsChange: (items: LuxorInvoiceLineItem[]) => void
  proposalContext?: ProposalBuilderContext | null
  onProposalContextChange?: (context: ProposalBuilderContext) => void
  selectedPackageId?: string | null
  onSelectedPackageIdChange?: (packageId: string) => void
  availableServices?: ProposalServiceOption[]
  onCalculationChange?: (calculation: ProposalPricingCalculation | null) => void
  pricingEndpoint?: string
  notes: string
  onNotesChange: (value: string) => void
  /** An owner must explicitly configure the tax treatment for each final proposal. */
  taxRate: string
  onTaxRateChange: (value: string) => void
  submitting: boolean
  onSubmit: (action: ProposalSubmitAction) => void
}

const PACKAGE_OPTIONS: Array<{
  id: ProposalPackageId
  name: string
  eyebrow: string
  description: string
  inclusions: readonly string[]
}> = [
  {
    id: 'rent_only',
    name: 'Rental Only',
    eyebrow: 'Venue access',
    description: 'A clear venue foundation with the required event services calculated for this guest count.',
    inclusions: ['Venue rental', 'Security', 'Cleaning', 'Tables & chairs setup'],
  },
  {
    id: 'bronze',
    name: 'Bronze - Essentials',
    eyebrow: 'Essentials',
    description: 'A polished starting point for a hosted celebration.',
    inclusions: ['Everything in Rental Only', 'Essential Decor', 'Buffet catering', 'DJ'],
  },
  {
    id: 'silver',
    name: 'Silver - Premier',
    eyebrow: 'Premier',
    description: 'A fuller celebration package with the selected experience details.',
    inclusions: ['Everything in Bronze', 'Full Decor & Planning', 'Signature Photo Booth', '8 event hours + 4 setup/breakdown hours'],
  },
  {
    id: 'gold',
    name: 'Gold - All-Inclusive',
    eyebrow: 'All inclusive',
    description: 'The most complete Luxor experience, calculated from the event itself.',
    inclusions: ['Everything in Silver', 'Bartender service', '8 event hours + 4 setup/breakdown hours'],
  },
]

/**
 * The pricing engine owns the package base. These IDs are used only to keep
 * a former optional selection from being carried into a new package and
 * charged a second time when an owner switches packages.
 */
const PACKAGE_INCLUDED_SERVICE_IDS: Record<ProposalPackageId, readonly string[]> = {
  rent_only: [],
  bronze: ['essential_decor', 'buffet_catering', 'dj'],
  silver: ['full_decor', 'buffet_catering', 'dj', 'photo_booth_signature'],
  gold: ['full_decor', 'buffet_catering', 'dj', 'photo_booth_signature', 'bartender_service'],
}

/**
 * These are replacements for an included service, not independent add-ons.
 * The configuration deliberately does not have replacement pricing rules, so
 * do not let the UI create a misleading double-charge.
 */
const PACKAGE_UNAVAILABLE_ADD_ON_IDS: Record<ProposalPackageId, readonly string[]> = {
  rent_only: [],
  bronze: ['full_decor', 'plated_catering'],
  silver: ['essential_decor', 'plated_catering', 'photo_booth_signature', 'photo_booth_celebration', 'photo_booth_forever'],
  gold: ['essential_decor', 'plated_catering', 'photo_booth_signature', 'photo_booth_celebration', 'photo_booth_forever'],
}

const DEFAULT_SERVICE_LIBRARY: ProposalServiceOption[] = [
  { id: 'essential_decor', name: 'Essential decor', category: 'Decor', detail: 'Decor package selected for the event.', exclusiveGroup: 'decor' },
  { id: 'full_decor', name: 'Full decor', category: 'Decor', detail: 'Full decor collection selected for the event.', exclusiveGroup: 'decor' },
  { id: 'buffet_catering', name: 'Buffet catering', category: 'Catering', detail: 'Calculated from the expected guest count.', exclusiveGroup: 'catering' },
  { id: 'plated_catering', name: 'Plated catering', category: 'Catering', detail: 'Calculated from the expected guest count.', exclusiveGroup: 'catering' },
  { id: 'dj', name: 'DJ', category: 'Entertainment', detail: 'Professional DJ service.' },
  { id: 'photo_booth_signature', name: 'Signature photo booth', category: 'Photo booth', detail: 'Signature photo booth experience.', exclusiveGroup: 'photo_booth' },
  { id: 'photo_booth_celebration', name: 'Celebration photo booth', category: 'Photo booth', detail: 'Celebration photo booth experience.', exclusiveGroup: 'photo_booth' },
  { id: 'photo_booth_forever', name: 'Forever photo booth', category: 'Photo booth', detail: 'Forever photo booth experience.', exclusiveGroup: 'photo_booth' },
  { id: 'bartender_service', name: 'Bartender service', category: 'Bar', detail: 'Bartender service tier determined by guest count.', exclusiveGroup: 'bar' },
  { id: 'byob_signature', name: 'Signature BYOB bar', category: 'Bar', detail: 'Signature BYOB package with the applicable minimum.', exclusiveGroup: 'bar' },
  { id: 'byob_premium', name: 'Premium BYOB bar', category: 'Bar', detail: 'Premium BYOB package with the applicable minimum.', exclusiveGroup: 'bar' },
  { id: 'byob_non_alcoholic', name: 'Non-alcoholic bar', category: 'Bar', detail: 'Non-alcoholic package with the applicable minimum.', exclusiveGroup: 'bar' },
]

const STEPS = [
  { id: 'details', label: 'Details', icon: ClipboardList },
  { id: 'compare', label: 'Compare packages', icon: ReceiptText },
  { id: 'services', label: 'Services & items', icon: PackageCheck },
  { id: 'review', label: 'Selected proposal', icon: FileText },
  { id: 'payment', label: 'Payment plan', icon: Handshake },
] as const

const formatMoney = (value: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: value && value % 1 !== 0 ? 2 : 0,
}).format(value || 0)

function formatEventDate(value?: string | null) {
  if (!value) return 'Not set'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numberValue)) return numberValue
  }
  return undefined
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizePackageId(value?: string | null) {
  const normalized = (value || '').toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'rentonly' || normalized === 'rentalonly' || normalized === 'venue') return 'rent_only'
  if (normalized === 'bronze' || normalized === 'essentials' || normalized === 'bronzeessentials') return 'bronze'
  if (normalized === 'silver' || normalized === 'premier' || normalized === 'silverpremier') return 'silver'
  if (normalized === 'gold' || normalized === 'allinclusive' || normalized === 'goldallinclusive') return 'gold'
  return value || ''
}

function enginePackageId(value?: string | null) {
  const normalized = normalizePackageId(value)
  return normalized === 'rent_only' ? 'rental_only' : normalized
}

function arrayFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  return record ? Object.values(record) : []
}

function uniqueMessages(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))]
}

function normalizeLineItem(value: unknown): LuxorInvoiceLineItem | null {
  const record = asRecord(value)
  if (!record) return null
  const description = asString(record.description) || asString(record.name)
  if (!description) return null
  const quantity = asNumber(record.quantity, record.qty) ?? 1
  const unitPrice = asNumber(record.unitPrice, record.unit_price, record.price) ?? 0
  const total = asNumber(record.total, record.line_total, record.amount) ?? quantity * unitPrice
  return {
    id: asString(record.id),
    catalogId: asString(record.catalogId) || asString(record.catalog_id),
    category: asString(record.category),
    included: Boolean(record.included),
    pricingRole: ['required', 'included', 'add_on', 'discount', 'tax', 'custom'].includes(String(record.pricingRole || record.pricing_role))
      ? String(record.pricingRole || record.pricing_role) as LuxorInvoiceLineItem['pricingRole']
      : undefined,
    paymentBucket: ['venue', 'event', 'security_deposit'].includes(String(record.paymentBucket || record.payment_bucket))
      ? String(record.paymentBucket || record.payment_bucket) as LuxorInvoiceLineItem['paymentBucket']
      : undefined,
    required: Boolean(record.required),
    detail: asString(record.detail),
    description,
    quantity,
    unitPrice,
    total,
  }
}

function normalizeCalculation(payload: unknown): ProposalPricingCalculation | null {
  const root = asRecord(payload)
  if (!root) return null
  const record = asRecord(root.calculation) || asRecord(root.data) || root
  const context = asRecord(record.context) || asRecord(record.proposal_context)
  const sourcePackages = arrayFromUnknown(record.packages || record.package_comparisons || record.packageComparisons || record.package_options || record.packageOptions || record.comparisons)
  const packages = sourcePackages.map((value, index): CalculatedPackage | null => {
    const packageRecord = asRecord(value)
    if (!packageRecord) return null
    const id = asString(packageRecord.id) || asString(packageRecord.package_id) || PACKAGE_OPTIONS[index]?.id
    if (!id) return null
    const sourceLines = packageRecord.line_items || packageRecord.lineItems || packageRecord.items
    return {
      id,
      name: asString(packageRecord.name) || asString(packageRecord.package_name) || PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(id))?.name || id,
      description: asString(packageRecord.description),
      finalEventPrice: asNumber(packageRecord.final_event_price, packageRecord.finalEventPrice, packageRecord.total, packageRecord.event_total),
      refundableSecurityDeposit: asNumber(packageRecord.refundable_security_deposit, packageRecord.refundableSecurityDeposit, packageRecord.security_deposit),
      amountDueToBook: asNumber(packageRecord.amount_due_to_book, packageRecord.amountDueToBook, packageRecord.due_now),
      subtotal: asNumber(packageRecord.subtotal),
      discountAmount: asNumber(packageRecord.discount_amount, packageRecord.discountAmount),
      taxAmount: asNumber(packageRecord.tax_amount, packageRecord.taxAmount),
      taxRate: asNumber(packageRecord.tax_rate, packageRecord.taxRate),
      lineItems: arrayFromUnknown(sourceLines).map(normalizeLineItem).filter((item): item is LuxorInvoiceLineItem => Boolean(item)),
      warnings: arrayFromUnknown(packageRecord.warnings).filter((warning): warning is string => typeof warning === 'string'),
      errors: arrayFromUnknown(packageRecord.errors).filter((error): error is string => typeof error === 'string'),
    }
  }).filter((value): value is CalculatedPackage => Boolean(value))

  return {
    ...record,
    context: context as Partial<LuxorProposalContext> | undefined,
    packages,
    lineItems: arrayFromUnknown(record.line_items || record.lineItems || record.items).map(normalizeLineItem).filter((item): item is LuxorInvoiceLineItem => Boolean(item)),
    warnings: arrayFromUnknown(record.warnings).filter((warning): warning is string => typeof warning === 'string'),
    errors: arrayFromUnknown(record.errors).filter((error): error is string => typeof error === 'string'),
  }
}

function selectedServiceIdsFrom(context: ProposalBuilderContext, items: LuxorInvoiceLineItem[]) {
  const selection = context.pricing_selection || {}
  // An intentionally empty add-on list is meaningful: do not infer add-ons from
  // calculated package line items, or reopening a proposal can accidentally add
  // every included service as an upgrade.
  for (const candidate of [selection.service_ids, selection.services, selection.add_ons, selection.addOns]) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === 'string' && Boolean(value))
    }
  }
  return items.map((item) => item.catalogId).filter((id): id is string => Boolean(id))
}

function getPaymentPlan(context: ProposalBuilderContext): LuxorProposalPaymentPlan | null {
  const plan = asRecord(context.payment_plan)
  const mode = plan?.mode === 'pay_in_full' || plan?.mode === 'deposit_and_balance'
    ? plan.mode
    : null
  const bookingPaymentPercent = asNumber(plan?.booking_payment_percent)
  const finalPaymentDays = asNumber(plan?.final_payment_due_days_before_event)
  if (!mode || bookingPaymentPercent === undefined || bookingPaymentPercent < 0 || bookingPaymentPercent > 100 ||
    finalPaymentDays === undefined || !Number.isInteger(finalPaymentDays) || finalPaymentDays < 0 ||
    (mode === 'deposit_and_balance' && bookingPaymentPercent <= 0)) return null
  return {
    mode,
    booking_payment_percent: bookingPaymentPercent,
    final_payment_due_days_before_event: finalPaymentDays,
  }
}

export function ProposalBuilderModal({
  isOpen,
  onClose,
  isEditing = false,
  clientName,
  clientEmail,
  eventType,
  eventDate,
  onEventDateChange,
  eventGuestCount,
  onEventGuestCountChange,
  description,
  onDescriptionChange,
  dueDate,
  onDueDateChange,
  offerExpiryTime,
  onOfferExpiryTimeChange,
  discountPercent,
  onDiscountPercentChange,
  discountType = 'percent',
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  items,
  onItemsChange,
  proposalContext,
  onProposalContextChange,
  selectedPackageId,
  onSelectedPackageIdChange,
  availableServices = DEFAULT_SERVICE_LIBRARY,
  onCalculationChange,
  pricingEndpoint = '/api/proposal-pricing',
  notes,
  onNotesChange,
  taxRate,
  onTaxRateChange,
  submitting,
  onSubmit,
}: ProposalBuilderModalProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [furthestUnlockedStep, setFurthestUnlockedStep] = useState(0)
  const [localContext, setLocalContext] = useState<ProposalBuilderContext>(() => proposalContext || {})
  const [pricingStatus, setPricingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [calculation, setCalculation] = useState<ProposalPricingCalculation | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const calculationCallbackRef = useRef(onCalculationChange)
  const contextKey = JSON.stringify(proposalContext || {})

  useEffect(() => {
    calculationCallbackRef.current = onCalculationChange
  }, [onCalculationChange])

  useEffect(() => {
    if (!proposalContext) return
    setLocalContext((current) => ({ ...current, ...proposalContext }))
  }, [contextKey, proposalContext])

  useEffect(() => {
    if (isOpen) return
    setStepIndex(0)
    setFurthestUnlockedStep(0)
    setValidationMessage(null)
  }, [isOpen])

  const effectiveContext = localContext
  const selectedPackage = normalizePackageId(selectedPackageId || effectiveContext.package_id)
  const eventDateValue = effectiveContext.event_date || eventDate || ''
  const guestCount = asNumber(effectiveContext.expected_guest_count, eventGuestCount) || 0
  const rentalPeriod = effectiveContext.rental_period || 'evening'
  const selectedServiceIds = useMemo(() => selectedServiceIdsFrom(effectiveContext, items), [effectiveContext, items])
  const selectedServiceIdSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds])
  const selectedPackageOption = PACKAGE_OPTIONS.find((option) => option.id === selectedPackage)
  const packageIncludedServiceIds = selectedPackageOption ? PACKAGE_INCLUDED_SERVICE_IDS[selectedPackageOption.id] : []
  const packageUnavailableAddOnIds = selectedPackageOption ? PACKAGE_UNAVAILABLE_ADD_ON_IDS[selectedPackageOption.id] : []
  const ineligibleServiceIds = useMemo(() => new Set([
    ...packageIncludedServiceIds,
    ...packageUnavailableAddOnIds,
  ]), [packageIncludedServiceIds, packageUnavailableAddOnIds])
  const optionalServices = useMemo(() => selectedPackageOption
    ? availableServices.filter((service) => !ineligibleServiceIds.has(service.id))
    : [], [availableServices, ineligibleServiceIds, selectedPackageOption])
  const paymentPlan = getPaymentPlan(effectiveContext)
  const adjustmentValue = discountValue ?? discountPercent
  const pricingSelection = asRecord(effectiveContext.pricing_selection)
  const discountApproved = Boolean(
    pricingSelection?.discount_approved
    ?? pricingSelection?.discountApproved
    ?? pricingSelection?.approved,
  )

  const updateProposalContext = (patch: Partial<ProposalBuilderContext>) => {
    const next = { ...effectiveContext, ...patch }
    setLocalContext(next)
    onProposalContextChange?.(next)
  }

  const setEventDate = (value: string) => {
    updateProposalContext({ event_date: value })
    onEventDateChange?.(value)
  }

  const setGuestCount = (value: string) => {
    const parsed = Math.max(0, Math.min(200, Number(value) || 0))
    updateProposalContext({ expected_guest_count: parsed })
    onEventGuestCountChange?.(String(parsed || ''))
  }

  const selectPackage = (packageId: string) => {
    const packageOption = PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(packageId))
    const canonicalId = packageOption?.id || packageId
    const excludedServiceIds = new Set(packageOption
      ? [...PACKAGE_INCLUDED_SERVICE_IDS[packageOption.id], ...PACKAGE_UNAVAILABLE_ADD_ON_IDS[packageOption.id]]
      : [])
    const nextServiceIds = selectedServiceIds.filter((id) => !excludedServiceIds.has(id))
    const nextItems = items.filter((item) => (
      item.pricingRole !== 'add_on'
      || !item.catalogId
      || !excludedServiceIds.has(item.catalogId)
    ))
    onSelectedPackageIdChange?.(canonicalId)
    updateProposalContext({
      package_id: canonicalId,
      package_name: packageOption?.name,
      pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        service_ids: nextServiceIds,
      },
    })
    // Package base items come back from the server calculator. Keep only
    // optional selections that remain valid for the newly selected package.
    onItemsChange(nextItems)
  }

  const updateServiceSelection = (serviceId: string) => {
    const service = availableServices.find((candidate) => candidate.id === serviceId)
    if (!service || !selectedPackageOption || ineligibleServiceIds.has(serviceId)) return

    const libraryById = new Map(availableServices.map((candidate) => [candidate.id, candidate]))
    const isSelected = selectedServiceIdSet.has(serviceId)
    const idsWithoutExclusiveGroup = selectedServiceIds.filter((id) => {
      const current = libraryById.get(id)
      return !service.exclusiveGroup || current?.exclusiveGroup !== service.exclusiveGroup
    })
    const nextServiceIds = isSelected
      ? selectedServiceIds.filter((id) => id !== serviceId)
      : [...idsWithoutExclusiveGroup, serviceId]

    const nextItemsWithoutExclusiveGroup = items.filter((item) => {
      if (!item.catalogId) return true
      const current = libraryById.get(item.catalogId)
      return !service.exclusiveGroup || current?.exclusiveGroup !== service.exclusiveGroup
    })
    const nextItems = isSelected
      ? nextItemsWithoutExclusiveGroup.filter((item) => item.catalogId !== serviceId)
      : [
          ...nextItemsWithoutExclusiveGroup,
          {
            id: `proposal-${service.id}`,
            catalogId: service.id,
            category: service.category,
            pricingRole: 'add_on' as const,
            detail: service.detail,
            description: service.name,
            quantity: 1,
            unitPrice: 0,
            total: 0,
          },
        ]

    updateProposalContext({
      pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        service_ids: nextServiceIds,
      },
    })
    onItemsChange(nextItems)
  }

  const pricingRequest = useMemo(() => ({
    selection: {
      packageId: enginePackageId(selectedPackage) || null,
      eventDate: eventDateValue || null,
      guestCount: guestCount || null,
      eventType: eventType || effectiveContext.event_type || null,
      rentalPeriod,
      addOns: selectedServiceIds,
      discountType,
      discountValue: Math.max(0, Number(adjustmentValue) || 0),
      discountApproved: Math.max(0, Number(adjustmentValue) || 0) <= 0 || discountApproved,
      taxRate: taxRate.trim() === '' ? null : Math.max(0, Number(taxRate) || 0),
      paymentPlan: effectiveContext.payment_plan || null,
    },
    event_date: eventDateValue || null,
    expected_guest_count: guestCount || null,
    event_type: eventType || effectiveContext.event_type || null,
    rental_period: rentalPeriod,
    package_id: selectedPackage || null,
    pricing_selection: {
      ...(effectiveContext.pricing_selection || {}),
      service_ids: selectedServiceIds,
    },
    selected_services: selectedServiceIds,
    line_items: items.map((item) => ({
      catalogId: item.catalogId,
      quantity: item.quantity,
      included: item.included,
      pricingRole: item.pricingRole,
    })),
    discount: {
      type: discountType,
      value: Math.max(0, Number(adjustmentValue) || 0),
    },
    tax_rate: taxRate.trim() === '' ? null : Math.max(0, Number(taxRate) || 0),
  }), [adjustmentValue, discountApproved, discountType, effectiveContext.event_type, effectiveContext.payment_plan, effectiveContext.pricing_selection, eventDateValue, eventType, guestCount, items, rentalPeriod, selectedPackage, selectedServiceIds, taxRate])
  const pricingRequestKey = JSON.stringify(pricingRequest)

  useEffect(() => {
    if (!isOpen || !eventDateValue || !guestCount) {
      setPricingStatus('idle')
      setPricingError(null)
      setCalculation(null)
      calculationCallbackRef.current?.(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPricingStatus('loading')
      setPricingError(null)
      try {
        const response = await fetch(pricingEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal,
          body: pricingRequestKey,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Final pricing could not be calculated.')
        const nextCalculation = normalizeCalculation(payload)
        if (!nextCalculation) throw new Error('Pricing response was not recognized.')
        setCalculation(nextCalculation)
        setPricingStatus('ready')
        calculationCallbackRef.current?.(nextCalculation)
      } catch (error) {
        if (controller.signal.aborted) return
        setCalculation(null)
        calculationCallbackRef.current?.(null)
        setPricingStatus('error')
        setPricingError(error instanceof Error ? error.message : 'Final pricing could not be calculated.')
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [eventDateValue, guestCount, isOpen, pricingEndpoint, pricingRequestKey])

  const calculatedPackages = useMemo(() => calculation?.packages || [], [calculation])
  const packageCards = useMemo(() => PACKAGE_OPTIONS.map((option) => {
    const calculated = calculatedPackages.find((candidate) => normalizePackageId(candidate.id) === option.id)
    return { ...option, ...(calculated || {}), id: calculated?.id || option.id }
  }), [calculatedPackages])
  const selectedCalculatedPackage = calculatedPackages.find((candidate) => normalizePackageId(candidate.id) === normalizePackageId(selectedPackage))
  const selectedContext = calculation?.context || effectiveContext
  const finalEventPrice = selectedCalculatedPackage?.finalEventPrice ?? asNumber(selectedContext.final_event_price)
  const refundableSecurityDeposit = selectedCalculatedPackage?.refundableSecurityDeposit ?? asNumber(selectedContext.refundable_security_deposit)
  const finalLineItems = selectedCalculatedPackage?.lineItems?.length
    ? selectedCalculatedPackage.lineItems
    : calculation?.lineItems?.length
      ? calculation.lineItems
      : []
  const proposalSubtotal = selectedCalculatedPackage?.subtotal ?? asNumber(selectedContext.subtotal)
  const proposalDiscountAmount = selectedCalculatedPackage?.discountAmount ?? asNumber(selectedContext.discount_amount, selectedContext.discountAmount)
  const proposalTaxAmount = selectedCalculatedPackage?.taxAmount ?? asNumber(selectedContext.tax_amount, selectedContext.taxAmount)
  const proposalTaxRate = selectedCalculatedPackage?.taxRate ?? asNumber(selectedContext.tax_rate, selectedContext.taxRate)
  const venueServicesTotal = asNumber(selectedContext.venue_services_total)
  const eventServicesTotal = asNumber(selectedContext.event_services_total)
  const eventAccess = asString(selectedContext.event_access)
  const pricingWarnings = uniqueMessages([
    ...(calculation?.warnings || []),
    ...(selectedCalculatedPackage?.warnings || []),
    ...(selectedContext.calculation_warnings || []),
  ])
  const allPricingErrors = uniqueMessages([
    ...(calculation?.errors || []),
    ...(selectedCalculatedPackage?.errors || []),
    ...(selectedContext.calculation_errors || []),
  ])
  // The server separates missing payment terms from broken rate rules. This
  // preserves a useful package comparison while keeping publication blocked
  // until Step 5 has explicit, owner-approved payment terms.
  const structuredCalculationErrors = Array.isArray(calculation?.calculationErrors)
    ? uniqueMessages(calculation.calculationErrors)
    : null
  const structuredPublicationErrors = Array.isArray(calculation?.publicationErrors)
    ? uniqueMessages(calculation.publicationErrors)
    : null
  const pricingErrors = structuredCalculationErrors ?? allPricingErrors
  const savedPublicationErrors = uniqueMessages(selectedContext.publication_errors || [])
  const publicationErrors = structuredPublicationErrors ?? savedPublicationErrors
  const pricingRequirements = asRecord(calculation?.requirements)
  const paymentPlanRequired = pricingRequirements?.paymentPlan === true || publicationErrors.length > 0
  const hasFinalPrice = pricingStatus === 'ready' && typeof finalEventPrice === 'number' && finalEventPrice >= 0
  const canPublish = Boolean(selectedPackage && eventDateValue && guestCount > 0 && hasFinalPrice && pricingErrors.length === 0 && !paymentPlanRequired)

  const advance = () => {
    if (stepIndex === 0 && (!eventDateValue || guestCount < 1 || guestCount > 200)) {
      setValidationMessage('Add the event date and an expected guest count from 1 to 200 before continuing.')
      return
    }
    if (stepIndex === 1 && !selectedPackage) {
      setValidationMessage('Choose one package before continuing to its prefilled services and items.')
      return
    }
    setValidationMessage(null)
    setStepIndex((current) => {
      const next = Math.min(current + 1, STEPS.length - 1)
      setFurthestUnlockedStep((furthest) => Math.max(furthest, next))
      return next
    })
  }

  const retreat = () => {
    setValidationMessage(null)
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const updatePaymentPlan = (patch: Partial<LuxorProposalPaymentPlan>) => {
    const current = paymentPlan || {
      mode: 'deposit_and_balance' as const,
      booking_payment_percent: 0,
      final_payment_due_days_before_event: 0,
    }
    updateProposalContext({ payment_plan: { ...current, ...patch } })
  }

  const headerStatus = pricingStatus === 'loading'
    ? 'Updating final price'
    : pricingStatus === 'ready' && !pricingErrors.length && !selectedPackage
      ? 'Choose a package'
      : pricingStatus === 'ready' && !pricingErrors.length && paymentPlanRequired
        ? 'Payment plan needed'
        : pricingStatus === 'ready' && !pricingErrors.length
          ? 'Final price verified'
          : 'Pricing needs event details'
  const continueLabel = stepIndex === 0
    ? 'Continue to compare'
    : stepIndex === 1
      ? 'Continue to services'
      : stepIndex === 2
        ? 'Continue to review'
        : 'Continue to payment plan'

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} ariaLabel="Final proposal builder" maxWidth="max-w-[1340px]">
      <div className="flex h-[calc(100dvh-2rem)] max-h-[94vh] min-h-0 flex-col bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] sm:h-[90vh]">
        <header className="shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
                <FileText size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Luxor Event Space</p>
                <h2 className="truncate font-serif text-xl font-semibold leading-6 sm:text-2xl">{isEditing ? 'Revise final proposal' : 'Build final proposal'}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] sm:inline-flex ${pricingStatus === 'ready' && !pricingErrors.length ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                {headerStatus}
              </span>
              <PortalCloseButton onClick={onClose} aria-label="Close final proposal builder" />
            </div>
          </div>
          <nav className="mt-4 overflow-x-auto pb-0.5" aria-label="Proposal builder steps">
            <ol className="flex min-w-max items-center gap-1 sm:gap-2">
              {STEPS.map((step, index) => {
                const Icon = step.icon
                const active = index === stepIndex
                const complete = index < stepIndex
                const locked = index > furthestUnlockedStep
                return (
                  <li key={step.id} className="flex items-center gap-1 sm:gap-2">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (locked) return
                        setStepIndex(index)
                        setValidationMessage(null)
                      }}
                      aria-current={active ? 'step' : undefined}
                      className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[9px] font-black uppercase tracking-[0.11em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 disabled:cursor-not-allowed disabled:opacity-55 sm:px-3 ${active ? 'bg-[#caa24c]/12 text-[#8c6529] dark:text-[#f1d27a]' : complete ? 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/8' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? 'border-[#caa24c]/45 bg-[#caa24c]/15' : complete ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-[color:var(--portal-border)]'}`}>
                        {complete ? <Check size={11} /> : <Icon size={11} />}
                      </span>
                      <span>{index + 1}. {step.label}</span>
                    </button>
                    {index < STEPS.length - 1 ? <span className="h-px w-3 bg-[color:var(--portal-border)] sm:w-5" aria-hidden="true" /> : null}
                  </li>
                )
              })}
            </ol>
          </nav>
        </header>

        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {validationMessage ? (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3.5 text-sm text-amber-900 dark:text-amber-100">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <p>{validationMessage}</p>
            </div>
          ) : null}

          {stepIndex === 0 ? (
            <section className="mx-auto max-w-4xl space-y-6">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 1 of 5</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Start with the facts that set the price.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The date, rental period, guest count, approved adjustment, tax treatment, and selected services are the only inputs that shape this proposal. The final price comes from Luxor’s pricing rules.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
                <div className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal title</span>
                    <input
                      value={description}
                      onChange={(event) => onDescriptionChange(event.target.value)}
                      placeholder={`${eventType || 'Event'} at Luxor`}
                      className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event date</span>
                      <PortalDatePicker value={eventDateValue} onChange={setEventDate} className="w-full" placeholder="Select event date" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Expected guest count</span>
                      <span className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12">
                        <Users size={15} className="ml-3 text-[color:var(--portal-muted)]" />
                        <input
                          type="number"
                          min="1"
                          max="200"
                          inputMode="numeric"
                          value={guestCount || ''}
                          onChange={(event) => setGuestCount(event.target.value)}
                          placeholder="1–200"
                          className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold outline-none"
                        />
                      </span>
                      <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Luxor accommodates up to 200 guests.</p>
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Rental period</span>
                      <PortalSelect
                        value={rentalPeriod}
                        onChange={(value) => updateProposalContext({ rental_period: value as ProposalBuilderContext['rental_period'] })}
                        options={[
                          { value: 'morning', label: 'Morning · 9 AM–4 PM' },
                          { value: 'evening', label: 'Evening · 6 PM–1 AM' },
                          { value: 'full_day', label: 'Full day · 11 AM–11 PM' },
                        ]}
                        className="w-full"
                        buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal"
                      />
                    </label>
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event type</span>
                      <div className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold">
                        {eventType || effectiveContext.event_type || 'Event booking'}
                      </div>
                    </div>
                  </div>
                </div>

                <aside className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Prepared for</p>
                    <p className="mt-1 text-base font-bold">{clientName}</p>
                    <p className="mt-0.5 text-sm text-[color:var(--portal-muted)]">{clientEmail || 'Add an email before publishing.'}</p>
                  </div>
                  <div className="border-t border-[color:var(--portal-border)] pt-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal valid through</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_108px] lg:grid-cols-1">
                      <PortalDatePicker value={dueDate} onChange={onDueDateChange} className="w-full" placeholder="Select expiry date" />
                      <input
                        type="time"
                        value={offerExpiryTime}
                        onChange={(event) => onOfferExpiryTimeChange(event.target.value)}
                        aria-label="Proposal expiry time"
                        className="min-h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12"
                      />
                    </div>
                  </div>
                  <div className="border-t border-[color:var(--portal-border)] pt-4">
                    <label className="block space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Sales tax rate for this proposal</span>
                      <span className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.001"
                          inputMode="decimal"
                          value={taxRate}
                          onChange={(event) => onTaxRateChange(event.target.value)}
                          placeholder="Enter 0 if none"
                          className="min-h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm font-bold outline-none"
                        />
                        <span className="pr-3 text-sm font-semibold text-[color:var(--portal-muted)]">%</span>
                      </span>
                      <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Enter the confirmed rate, including 0% where no sales tax applies. It is captured in the locked proposal.</p>
                    </label>
                  </div>
                  <div className="border-t border-[color:var(--portal-border)] pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Approved price adjustment</span>
                      {onDiscountTypeChange ? (
                        <PortalSelect
                          value={discountType}
                          onChange={(value) => onDiscountTypeChange(value as 'percent' | 'fixed')}
                          options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed amount' }]}
                          className="min-w-[130px]"
                          buttonClassName="min-h-8 px-2 text-[10px] font-bold normal-case tracking-normal"
                        />
                      ) : <span className="text-[10px] font-bold text-[color:var(--portal-muted)]">Percent</span>}
                    </div>
                    <label className="mt-2 flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12">
                      <span className="pl-3 font-mono text-sm text-[color:var(--portal-muted)]">{discountType === 'fixed' ? '$' : '%'}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={adjustmentValue}
                        onChange={(event) => {
                          if (onDiscountValueChange) onDiscountValueChange(event.target.value)
                          else onDiscountPercentChange(event.target.value)
                        }}
                        className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-right font-mono text-sm font-bold outline-none"
                      />
                    </label>
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                      <input
                        type="checkbox"
                        checked={discountApproved}
                        onChange={(event) => updateProposalContext({
                          pricing_selection: {
                            ...(effectiveContext.pricing_selection || {}),
                            discount_approved: event.target.checked,
                          },
                        })}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-[color:var(--portal-border)] text-[#a8792f] focus:ring-[#caa24c]/30"
                      />
                      <span>I confirm this adjustment has been approved. It will be visible in the locked final proposal.</span>
                    </label>
                  </div>
                </aside>
              </div>

              <label className="block max-w-4xl space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Client note</span>
                <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional note to include in the final proposal" className="min-h-24 w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-sm leading-5 outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" />
              </label>
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <section className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 2 of 5</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Compare packages at the actual event price.</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Every card uses the same date, guest count, rental period, required services, approved adjustment, and tax treatment. Choose one first; its included items will be prefilled on the next screen.</p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${pricingStatus === 'ready' && !pricingErrors.length ? paymentPlanRequired ? 'border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                  {pricingStatus === 'loading' ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ReceiptText size={14} />}
                  {pricingStatus === 'loading' ? 'Calculating final prices' : pricingStatus === 'ready' && paymentPlanRequired && !pricingErrors.length ? 'Final prices calculated — set payment plan later' : pricingStatus === 'ready' ? 'Final prices calculated' : 'Complete event details to calculate'}
                </div>
              </div>

              {pricingStatus === 'error' ? (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <div><p className="font-bold">We could not calculate the final price yet.</p><p className="mt-1">{pricingError || 'Review the event details and package rules, then try again.'}</p></div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {packageCards.map((packageOption) => {
                  const active = normalizePackageId(packageOption.id) === normalizePackageId(selectedPackage)
                  const showPrice = pricingStatus === 'ready' && typeof packageOption.finalEventPrice === 'number'
                  const inclusions = PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(packageOption.id))?.inclusions || []
                  return (
                    <button
                      key={packageOption.id}
                      type="button"
                      onClick={() => selectPackage(packageOption.id)}
                      aria-pressed={active}
                      className={`relative flex min-h-[400px] flex-col rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${active ? 'border-[#caa24c] bg-[#caa24c]/11 shadow-[0_0_0_1px_rgba(202,162,76,0.12)]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">{packageOption.eyebrow}</span>
                        {active ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#caa24c] text-white"><Check size={13} /></span> : null}
                      </div>
                      <h4 className="mt-3 font-serif text-xl font-semibold leading-6">{packageOption.name}</h4>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{packageOption.description}</p>
                      <div className="mt-4 border-y border-[color:var(--portal-border)] py-3">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final event price</p>
                        {showPrice ? <p className="mt-1 font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(packageOption.finalEventPrice)}</p> : <p className="mt-2 text-xs font-semibold text-[color:var(--portal-muted)]">Pricing appears after details are complete.</p>}
                      </div>
                      <div className="mt-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">What’s included</p>
                        <ul className="mt-2 space-y-2 text-xs leading-4 text-[color:var(--portal-muted)]">
                          {inclusions.map((inclusion) => <li key={inclusion} className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" /> <span>{inclusion}</span></li>)}
                        </ul>
                      </div>
                      <span className={`mt-auto inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.12em] ${active ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-[color:var(--portal-text)]'}`}>{active ? 'Selected package' : 'Select package'}</span>
                    </button>
                  )
                })}
              </div>

              {selectedPackageOption ? (
                <section className="grid gap-4 rounded-2xl border border-[#caa24c]/24 bg-[#caa24c]/[0.045] p-4 sm:p-5 lg:grid-cols-[1.35fr_.9fr]">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Selected package</p>
                    <h4 className="mt-1 font-serif text-2xl font-semibold">{selectedCalculatedPackage?.name || selectedPackageOption.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Its base services are locked into the price. Continue to Services &amp; Items to see the exact calculated rows and choose any compatible upgrades.</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {selectedPackageOption.inclusions.map((inclusion) => <p key={inclusion} className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs font-semibold"><Check size={13} className="shrink-0 text-emerald-700 dark:text-emerald-300" />{inclusion}</p>)}
                    </div>
                  </div>
                  <aside className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal summary</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      {typeof proposalSubtotal === 'number' ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Package &amp; services</span><span className="font-mono font-semibold">{formatMoney(proposalSubtotal)}</span></div> : null}
                      {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Approved adjustment</span><span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">−{formatMoney(proposalDiscountAmount)}</span></div> : null}
                      {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Sales tax{typeof proposalTaxRate === 'number' ? ` (${proposalTaxRate}%)` : ''}</span><span className="font-mono font-semibold">{formatMoney(proposalTaxAmount)}</span></div> : null}
                      <div className="flex items-end justify-between gap-3 border-t border-[#caa24c]/20 pt-3"><span className="text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Final event price</span><span className="font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{hasFinalPrice ? formatMoney(finalEventPrice) : 'Calculating…'}</span></div>
                      <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[color:var(--portal-muted)]">Refundable security deposit</span><span className="font-mono font-bold">{formatMoney(refundableSecurityDeposit ?? 750)}</span></div>
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">The $750 deposit is collected separately after the Event Agreement is signed. It never changes the event price.</p>
                  </aside>
                </section>
              ) : null}

              {pricingWarnings.length ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/7 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">Review before publishing</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-5 text-amber-900 dark:text-amber-100">
                    {pricingWarnings.map((warning, index) => <li key={`${warning}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{warning}</span></li>)}
                  </ul>
                </div>
              ) : null}

              {paymentPlanRequired && !pricingErrors.length ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/7 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
                  <p className="font-bold">Package prices are ready.</p>
                  <p className="mt-1">Set the owner-approved payment plan in Step 5 before publishing. It does not change the final event price.</p>
                </div>
              ) : null}

              {pricingErrors.length ? (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200"><p className="font-bold">This package needs a pricing rule before it can be published.</p>{pricingErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1">{error}</p>)}</div>
              ) : null}
            </section>
          ) : null}

          {stepIndex === 2 ? (
            <section className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 3 of 5</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Services &amp; items, already built from the package.</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The selected package has already filled in its required and included services. This is the only place to add a compatible upgrade; prices remain calculated from Luxor’s rules.</p>
                </div>
                <button type="button" onClick={() => { setStepIndex(1); setValidationMessage(null) }} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]"><ArrowLeft size={13} /> Change package</button>
              </div>

              <div className="rounded-2xl border border-[#caa24c]/20 bg-[#caa24c]/[0.055] p-4 text-sm leading-6 text-[color:var(--portal-muted)]">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
                  <p>Required services stay locked. Package services are never added twice, and replacement services only appear when Luxor has a defined pricing rule for them.</p>
                </div>
              </div>

              <ProposalPackageItemsPanel
                packageName={selectedCalculatedPackage?.name || selectedPackageOption?.name || null}
                lineItems={finalLineItems}
                optionalServices={optionalServices}
                selectedServiceIds={selectedServiceIds}
                pricingReady={pricingStatus === 'ready' && !pricingErrors.length}
                finalEventPrice={finalEventPrice}
                refundableSecurityDeposit={refundableSecurityDeposit}
                onToggleService={updateServiceSelection}
              />

              {pricingErrors.length ? (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200"><p className="font-bold">This package needs a pricing rule before it can be published.</p>{pricingErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1">{error}</p>)}</div>
              ) : null}
            </section>
          ) : null}

          {stepIndex === 3 ? (
            <section className="mx-auto max-w-4xl space-y-6">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 4 of 5</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Review the client’s final proposal.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">This screen is intentionally read-only. Go back to the earlier steps to change facts or services; publishing creates an immutable snapshot for the email, PDF, private page, and contract.</p>
              </div>

              {!selectedPackage ? (
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-muted)]">Choose a package in Compare before reviewing the proposal.</div>
              ) : !hasFinalPrice ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5 text-sm leading-6 text-amber-900 dark:text-amber-100"><p className="font-bold">Final pricing is not ready.</p><p className="mt-1">Return to Details and complete the event facts, then wait for the pricing calculation to finish.</p></div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                  <div className="border-b border-[#caa24c]/20 bg-[#1a140d] px-5 py-7 text-center text-white sm:px-8">
                    <p className="font-serif text-2xl tracking-[0.2em] text-[#f1d27a]">LUXOR</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.28em] text-white/65">Event Space</p>
                  </div>
                  <div className="p-5 sm:p-7">
                    <div className="flex flex-col gap-5 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Final proposal</p>
                        <h4 className="mt-1 font-serif text-2xl font-semibold">{description || `${eventType || 'Event'} at Luxor`}</h4>
                        <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Prepared for {clientName} · {formatEventDate(eventDateValue)} · {guestCount} guests</p>
                      </div>
                      <span className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">{selectedCalculatedPackage?.name || PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(selectedPackage))?.name}</span>
                    </div>

                    <div className="mt-5 grid gap-2 border-y border-[color:var(--portal-border)] py-4 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ['Venue', 'Luxor Event Space'],
                        ['Event date', formatEventDate(eventDateValue)],
                        ['Guests', `${guestCount} expected`],
                        ['Access', eventAccess || (rentalPeriod === 'full_day' ? 'Full day · 11 AM–11 PM' : rentalPeriod === 'morning' ? 'Morning · 9 AM–4 PM' : 'Evening · 6 PM–1 AM')],
                      ].map(([label, value]) => <div key={label} className="min-w-0 px-1 py-1 sm:px-2"><p className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--portal-text)]">{value}</p></div>)}
                    </div>

                    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_290px]">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">What’s included in this final proposal</p>
                          <span className="text-[10px] font-bold text-[color:var(--portal-muted)]">Exact calculated values</span>
                        </div>
                        {finalLineItems.length ? (
                          <div className="mt-3 divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)]">
                            {finalLineItems.map((item, index) => {
                              const itemStatus = item.included || item.pricingRole === 'included'
                                ? 'Included'
                                : item.required || item.pricingRole === 'required'
                                  ? 'Required'
                                  : item.pricingRole === 'add_on'
                                    ? 'Add-on'
                                    : item.pricingRole === 'discount'
                                      ? 'Adjustment'
                                      : 'Calculated'
                              return (
                                <div key={`${item.catalogId || item.description}-${index}`} className="flex items-start justify-between gap-4 px-3 py-3 text-sm">
                                  <div className="min-w-0"><p className="font-semibold">{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</p>{item.detail ? <p className="mt-0.5 text-xs leading-4 text-[color:var(--portal-muted)]">{item.detail}</p> : null}</div>
                                  <div className="shrink-0 text-right"><p className="font-mono text-xs font-bold text-[color:var(--portal-text)]">{formatMoney(item.total)}</p><span className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${itemStatus === 'Included' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : itemStatus === 'Required' ? 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300' : itemStatus === 'Add-on' ? 'border-[#caa24c]/25 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>{itemStatus}</span></div>
                                </div>
                              )
                            })}
                          </div>
                        ) : <p className="mt-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-muted)]">The detailed itemization will appear when the pricing service returns the selected package snapshot.</p>}
                      </div>
                      <aside className="h-fit rounded-xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Price summary</p>
                        <div className="mt-3 space-y-2.5 text-sm">
                          {typeof proposalSubtotal === 'number' ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Package &amp; services</span><span className="font-mono font-semibold">{formatMoney(proposalSubtotal)}</span></div> : null}
                          {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Approved adjustment</span><span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">−{formatMoney(proposalDiscountAmount)}</span></div> : null}
                          {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Sales tax{typeof proposalTaxRate === 'number' ? ` (${proposalTaxRate}%)` : ''}</span><span className="font-mono font-semibold">{formatMoney(proposalTaxAmount)}</span></div> : null}
                          <div className="border-t border-[#caa24c]/20 pt-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final event price</p><p className="mt-1 font-mono text-2xl font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p></div>
                        </div>
                        <div className="mt-4 border-t border-[#caa24c]/20 pt-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Separate refundable security deposit</p>
                          <p className="mt-1 font-mono text-lg font-black">{formatMoney(refundableSecurityDeposit ?? 750)}</p>
                          <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">Held through the event and returned after the post-event inspection, subject to the Event Agreement.</p>
                        </div>
                        <div className="mt-4 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3"><p className="text-[9px] font-black uppercase tracking-[0.11em] text-[#8c6529] dark:text-[#f1d27a]">Payment process</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Proposal acceptance → Event Agreement → Stripe payment link after signature.</p></div>
                      </aside>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {stepIndex === 4 ? (
            <section className="mx-auto max-w-6xl space-y-6">
              <div className="max-w-3xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 5 of 5</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Set the exact agreement payment terms.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The client accepts the final proposal first, Luxor sends the Event Agreement next, and Stripe is sent only after the agreement is signed. The schedule below shows exactly what that process will collect.</p>
              </div>

              <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)] lg:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">1 · Agreement payment terms</p>
                    <h4 className="mt-1 text-lg font-bold">Choose the payment structure that Luxor has approved.</h4>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">The percentage applies to the Final Event Price—not the refundable security deposit. The $750 deposit is collected separately with the initial Stripe payment and is not applied to the final balance.</p>
                    <div className="mt-4 grid gap-3">
                      <PortalSelect
                        value={paymentPlan?.mode || ''}
                        onChange={(value) => {
                          if (value === 'deposit_and_balance' || value === 'pay_in_full') updatePaymentPlan({ mode: value })
                        }}
                        options={[
                          { value: '', label: 'Choose an agreement payment plan' },
                          { value: 'deposit_and_balance', label: 'Initial contract payment + final balance' },
                          { value: 'pay_in_full', label: 'Final Event Price due in full after signing' },
                        ]}
                        className="w-full"
                        buttonClassName="min-h-12 px-3 text-sm font-semibold normal-case tracking-normal"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Initial contract payment %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={paymentPlan?.booking_payment_percent ?? ''}
                            onChange={(event) => updatePaymentPlan({ booking_payment_percent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
                            disabled={paymentPlan?.mode === 'pay_in_full'}
                            placeholder="Enter approved %"
                            className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 font-mono text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12 disabled:cursor-not-allowed disabled:opacity-45"
                          />
                          <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Used only for the first Final Event Price payment.</p>
                        </label>
                        <label className="space-y-1.5">
                          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final balance due (days before event)</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={paymentPlan?.final_payment_due_days_before_event ?? ''}
                            onChange={(event) => updatePaymentPlan({ final_payment_due_days_before_event: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                            disabled={paymentPlan?.mode === 'pay_in_full'}
                            placeholder="Enter approved days"
                            className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 font-mono text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12 disabled:cursor-not-allowed disabled:opacity-45"
                          />
                          <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">The schedule calculates this exact date from the event date.</p>
                        </label>
                      </div>
                    </div>
                  </div>
                  <aside className="rounded-xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">What the client experiences</p>
                    <ol className="mt-3 space-y-3">
                      {[
                        ['1', 'Accepts the proposal', 'The package, final price, service list, and payment terms lock together.'],
                        ['2', 'Signs the Event Agreement', 'Luxor sends a secure agreement after proposal acceptance.'],
                        ['3', 'Receives the Stripe link', 'Only then does Stripe collect the initial payment and the $750 refundable deposit.'],
                      ].map(([number, title, copy]) => <li key={number} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/28 bg-[#caa24c]/9 font-mono text-[10px] font-black text-[#8c6529] dark:text-[#f1d27a]">{number}</span><span><span className="block text-xs font-bold">{title}</span><span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--portal-muted)]">{copy}</span></span></li>)}
                    </ol>
                  </aside>
                </div>
              </section>

              <ProposalPaymentSchedule
                finalEventPrice={finalEventPrice}
                venueServicesTotal={venueServicesTotal}
                eventServicesTotal={eventServicesTotal}
                refundableSecurityDeposit={refundableSecurityDeposit}
                paymentPlan={paymentPlan}
                finalPaymentDueDate={asString(selectedContext.final_payment_due_date)}
                eventDate={eventDateValue}
              />

              {paymentPlanRequired ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/7 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100"><p className="font-bold">Payment terms are required before publishing.</p><p className="mt-1">The Final Event Price is already calculated. Choose the agreement plan and complete its approved terms above; the exact schedule will update immediately.</p>{publicationErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1 text-xs">{error}</p>)}</div>
              ) : null}

              {pricingErrors.length ? (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200"><p className="font-bold">This package needs a pricing rule before it can be published.</p>{pricingErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1">{error}</p>)}</div>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-10">
            {hasFinalPrice ? <><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Selected final event price</p><p className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p></> : <p className="flex min-h-10 items-center text-xs text-[color:var(--portal-muted)]">Complete the event facts to calculate the final price.</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {stepIndex > 0 ? <button type="button" onClick={retreat} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:opacity-40"><ArrowLeft size={14} /> Back</button> : null}
            {stepIndex < STEPS.length - 1 ? <button type="button" onClick={advance} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] disabled:opacity-40">{continueLabel} <ArrowRight size={14} /></button> : <>
              <button type="button" onClick={() => onSubmit('save')} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:opacity-40"><Eye size={14} /> Save draft &amp; preview</button>
              <button type="button" onClick={() => onSubmit('email')} disabled={submitting || !clientEmail || !canPublish} title={!canPublish ? paymentPlanRequired ? 'Set the payment plan in Step 5 before publishing.' : 'Complete the required event details and final pricing before publishing.' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-40"><Mail size={14} /> {submitting ? 'Publishing…' : 'Publish & email final proposal'}</button>
            </>}
          </div>
        </footer>
      </div>
    </PortalModal>
  )
}
