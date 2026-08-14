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
import type { LuxorInvoiceLineItem, LuxorPromotion, LuxorProposalContext, LuxorProposalPaymentPlan } from '@/lib/luxorInquiryTypes'
import { PortalCloseButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { ProposalPackageItemsPanel } from '@/components/portal/ProposalPackageItemsPanel'
import { ProposalPaymentSchedule } from '@/components/portal/ProposalPaymentSchedule'

type ProposalSubmitAction = 'save' | 'email'

type ProposalPackageId = 'rent_only' | 'bronze' | 'silver' | 'gold'

export type ProposalBuilderContext = {
  [key: string]: unknown
  version?: number
  pricing_config_version?: number
  package_id?: string
  package_name?: string
  event_type?: string
  event_date?: string
  expected_guest_count?: number
  rental_period?: 'morning' | 'evening' | 'full_day'
  event_access?: string
  venue_services_total?: number
  event_services_total?: number
  final_event_price?: number
  refundable_security_deposit?: number
  final_payment_due_date?: string
  subtotal?: number
  discount_amount?: number
  discountAmount?: number
  tax_amount?: number
  taxAmount?: number
  tax_rate?: number
  taxRate?: number
  calculation_warnings?: string[]
  calculation_errors?: string[]
  publication_errors?: string[]
  pricing_selection?: Record<string, unknown>
  promotion_id?: string | null
  promotionId?: string | null
  /** Step 5 may be intentionally incomplete while the owner is entering approved terms. */
  payment_plan?: Partial<LuxorProposalPaymentPlan>
}

export type ProposalServiceOption = {
  id: string
  name: string
  category: string
  detail?: string
  exclusiveGroup?: 'decor' | 'catering' | 'photo_booth' | 'bar'
  /** Basic choices establish a package tier; upgrades replace or enhance it. */
  serviceLevel?: 'basic' | 'upgrade'
  quantityLabel?: string
  locked?: boolean
  required?: boolean
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
  addOnQuotes?: Array<{
    id?: string
    total?: number | null
    available?: boolean
    error?: string
    quoteBreakdown?: {
      quantity?: number
      unitPrice?: number
      unit_price?: number
      subtotal?: number
      perGuestRate?: number
      per_guest_rate?: number
      minimum?: number
      appliedMinimum?: boolean
      applied_minimum?: boolean
      replacementOf?: string
      replacement_of?: string
    }
  }>
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
  /** Promotions are chosen by id; the pricing server resolves and snapshots their terms. */
  promotionId?: string | null
  onPromotionIdChange?: (promotionId: string | null) => void
  /** Legacy drafts must be converted to a saved promotion before their next save. */
  legacyDiscount?: { type: 'percent' | 'fixed'; value: number } | null
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
const DEFAULT_SERVICE_LIBRARY: ProposalServiceOption[] = [
  { id: 'venue_rental', name: 'Venue rental', category: 'Venue & rental', detail: 'The selected date and rental period set this exact price.', locked: true, required: true },
  { id: 'required_security', name: 'Security', category: 'Required services', detail: 'Required for every event and calculated from the guest count.', locked: true, required: true },
  { id: 'required_cleaning', name: 'Cleaning', category: 'Required services', detail: 'Required for every event and calculated from the guest count.', locked: true, required: true },
  { id: 'tables_chairs_setup', name: 'Tables & chairs setup', category: 'Setup & rentals', detail: 'Included or required according to the selected package.', locked: true, required: true },
  { id: 'essential_decor', name: 'Essential decor', category: 'Decor', detail: 'Basic decor collection for the event.', exclusiveGroup: 'decor', serviceLevel: 'basic' },
  { id: 'full_decor', name: 'Full decor & planning', category: 'Decor', detail: 'Upgrade to the full decor collection and planning service.', exclusiveGroup: 'decor', serviceLevel: 'upgrade' },
  { id: 'buffet_catering', name: 'Buffet catering', category: 'Catering', detail: 'Basic catering style, calculated from the expected guest count.', exclusiveGroup: 'catering', serviceLevel: 'basic' },
  { id: 'plated_catering', name: 'Plated catering', category: 'Catering', detail: 'Upgrade catering style, calculated from the expected guest count.', exclusiveGroup: 'catering', serviceLevel: 'upgrade' },
  { id: 'dj', name: 'DJ', category: 'Entertainment', detail: 'Professional DJ service.' },
  { id: 'photo_booth_signature', name: 'Signature photo booth', category: 'Photo booth', detail: 'Basic photo booth experience.', exclusiveGroup: 'photo_booth', serviceLevel: 'basic' },
  { id: 'photo_booth_celebration', name: 'Celebration photo booth', category: 'Photo booth', detail: 'Upgrade photo booth experience.', exclusiveGroup: 'photo_booth', serviceLevel: 'upgrade' },
  { id: 'photo_booth_forever', name: 'Forever photo booth', category: 'Photo booth', detail: 'Upgrade photo booth experience.', exclusiveGroup: 'photo_booth', serviceLevel: 'upgrade' },
  { id: 'bartender_service', name: 'Bartender service', category: 'Bar', detail: 'Basic bar service tier determined by guest count.', exclusiveGroup: 'bar', serviceLevel: 'basic' },
  { id: 'byob_signature', name: 'Signature BYOB bar', category: 'Bar', detail: 'Upgrade bar package with the applicable minimum.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
  { id: 'byob_premium', name: 'Premium BYOB bar', category: 'Bar', detail: 'Upgrade bar package with the applicable minimum.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
  { id: 'byob_non_alcoholic', name: 'Non-alcoholic bar', category: 'Bar', detail: 'Upgrade non-alcoholic package with the applicable minimum.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
]

const STEPS = [
  { id: 'details', label: 'Details', icon: ClipboardList },
  { id: 'services', label: 'Services & items', icon: PackageCheck },
  { id: 'compare', label: 'Compare packages', icon: ReceiptText },
  { id: 'review', label: 'Selected proposal', icon: FileText },
  { id: 'payment', label: 'Payment plan', icon: Handshake },
] as const

const formatMoney = (value: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  // A proposal is a financial document: always show cents, including whole-dollar package lines.
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value || 0)

/** The pricing API stores a tax rate as a decimal (0.0825), while owners and clients expect 8.25%. */
function formatTaxRate(value: number) {
  const percent = value > 0 && value <= 1 ? value * 100 : value
  return `${Number(percent.toFixed(3))}%`
}

/**
 * Pricing is recalculated after every pricing input changes. These deliberately
 * use the shared portal skeleton treatment instead of a spinner, so the owner
 * sees the shape of the result that is being refreshed without mistaking a
 * previous price for the current one.
 */
function ProposalCalculationStatus({ label = 'Updating final prices' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="h-3 w-3 rounded-full luxor-skeleton" />
      <span>{label}</span>
    </span>
  )
}

function ProposalPriceSkeleton() {
  return (
    <span aria-hidden="true" className="mt-2 block space-y-2">
      <span className="block h-5 w-24 rounded luxor-skeleton" />
      <span className="block h-2.5 w-16 rounded luxor-skeleton" />
    </span>
  )
}

function ProposalReviewCalculationSkeleton() {
  return (
    <section aria-busy="true" aria-label="Recalculating final proposal" className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <div className="border-b border-[#caa24c]/20 bg-[#1a140d] px-5 py-7 sm:px-8">
        <div className="mx-auto h-6 w-36 rounded luxor-skeleton" />
        <div className="mx-auto mt-2 h-2.5 w-20 rounded luxor-skeleton" />
      </div>
      <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <span className="space-y-3"><span className="block h-3 w-24 rounded luxor-skeleton" /><span className="block h-7 w-64 max-w-full rounded luxor-skeleton" /><span className="block h-3 w-48 rounded luxor-skeleton" /></span>
          <span className="h-9 w-32 rounded-lg luxor-skeleton" />
        </div>
        <div className="mt-5 grid gap-3 border-y border-[color:var(--portal-border)] py-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <span key={index} className="space-y-2 px-1 py-1 sm:px-2"><span className="block h-2.5 w-14 rounded luxor-skeleton" /><span className="block h-3 w-24 rounded luxor-skeleton" /></span>)}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_290px]">
          <div className="space-y-3"><span className="block h-3 w-44 rounded luxor-skeleton" /><div className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)]">{[0, 1, 2, 3].map((index) => <div key={index} className="flex gap-3 px-4 py-3.5"><span className="h-5 w-5 shrink-0 rounded-full luxor-skeleton" /><span className="flex-1 space-y-2"><span className="block h-3 w-2/3 rounded luxor-skeleton" /><span className="block h-2.5 w-1/2 rounded luxor-skeleton" /></span></div>)}</div></div>
          <aside className="rounded-xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4"><span className="block h-2.5 w-20 rounded luxor-skeleton" /><div className="mt-4 space-y-3">{[0, 1, 2].map((index) => <span key={index} className="flex items-center justify-between gap-3"><span className="h-3 w-24 rounded luxor-skeleton" /><span className="h-3 w-16 rounded luxor-skeleton" /></span>)}</div><div className="mt-4 border-t border-[#caa24c]/20 pt-3"><span className="block h-2.5 w-20 rounded luxor-skeleton" /><span className="mt-2 block h-7 w-28 rounded luxor-skeleton" /></div></aside>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">Recalculating the final proposal.</p>
    </section>
  )
}

function ProposalPaymentScheduleSkeleton() {
  return (
    <section aria-busy="true" aria-label="Recalculating payment schedule" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><span className="space-y-2"><span className="block h-3 w-28 rounded luxor-skeleton" /><span className="block h-5 w-48 rounded luxor-skeleton" /></span><span className="h-8 w-28 rounded-lg luxor-skeleton" /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((index) => <div key={index} className="rounded-xl border border-[color:var(--portal-border)] p-4"><span className="block h-2.5 w-16 rounded luxor-skeleton" /><span className="mt-3 block h-6 w-24 rounded luxor-skeleton" /><span className="mt-2 block h-2.5 w-20 rounded luxor-skeleton" /></div>)}</div>
      <div className="mt-5 overflow-hidden rounded-xl border border-[color:var(--portal-border)]"><div className="grid grid-cols-[1fr_.75fr_.7fr] gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 sm:grid-cols-4">{[0, 1, 2, 3].map((index) => <span key={index} className="h-2.5 rounded luxor-skeleton" />)}</div>{[0, 1, 2].map((row) => <div key={row} className="grid grid-cols-[1fr_.75fr_.7fr] gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 last:border-b-0 sm:grid-cols-4">{[0, 1, 2, 3].map((cell) => <span key={cell} className={`h-3 rounded luxor-skeleton ${cell === 0 ? 'w-3/4' : ''}`} />)}</div>)}</div>
      <p role="status" aria-live="polite" className="sr-only">Recalculating the payment schedule.</p>
    </section>
  )
}

function formatEventDate(value?: string | null) {
  const normalized = normalizeEventDateValue(value)
  if (!normalized) return 'Not set'
  const parsed = new Date(`${normalized}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatEventAccess(value?: string | null, rentalPeriod?: string | null) {
  const raw = String(value || rentalPeriod || '').trim()
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'morning') return 'Morning · 8 AM–3 PM'
  if (normalized === 'evening') return 'Evening · 5 PM–12 AM'
  if (normalized === 'fullday') return 'Full day · 11 AM–11 PM'
  return raw || 'Not set'
}

/** PortalDatePicker accepts calendar dates, not legacy display strings such as “February 14th”. */
function normalizeEventDateValue(value?: string | null) {
  if (typeof value !== 'string') return ''
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${match[1]}-${match[2]}-${match[3]}`
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
  // Legacy saved line items do not reliably say whether a row came from the
  // package or from an optional selection. Inferring every catalog row as an
  // add-on would let a Rental package inherit Bronze/Silver inclusions and
  // charge them again. Only an explicitly marked add-on is safe to carry
  // forward; owners can deliberately re-add anything else from the library.
  return items
    .filter((item) => item.pricingRole === 'add_on')
    .map((item) => item.catalogId)
    .filter((id): id is string => Boolean(id))
}

function removedServiceIdsFrom(context: ProposalBuilderContext) {
  const selection = context.pricing_selection || {}
  for (const candidate of [selection.removedServiceIds, selection.removed_service_ids]) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === 'string' && Boolean(value))
    }
  }
  return []
}

/**
 * Custom rows are an owner-only editing affordance, but a custom charge must
 * be part of the same final-price calculation and client-facing breakdown as
 * every other proposal line. Returning null (rather than []) preserves a
 * pre-existing calculated custom row until the owner explicitly saves a list.
 */
function customItemsFrom(context: ProposalBuilderContext): LuxorInvoiceLineItem[] | null {
  const selection = asRecord(context.pricing_selection)
  if (!selection) return null
  for (const candidate of [selection.customItems, selection.custom_items]) {
    if (Array.isArray(candidate)) {
      return candidate
        .map(normalizeLineItem)
        .filter((item): item is LuxorInvoiceLineItem => Boolean(item))
        .map((item) => ({ ...item, pricingRole: 'custom' as const }))
    }
  }
  return null
}

function customItemSelection(items: LuxorInvoiceLineItem[]) {
  return items.map((item) => ({
    id: item.id,
    category: item.category || 'Custom items',
    description: item.description,
    quantity: Math.max(1, Number(item.quantity) || 1),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    paymentBucket: item.paymentBucket === 'venue' ? 'venue' as const : 'event' as const,
    ...(item.detail ? { detail: item.detail } : {}),
  }))
}

/**
 * Step 5 needs to retain a partially-entered owner plan while it is being
 * completed so the schedule can stay visible while the owner enters terms.
 */
function getPaymentPlanDraft(context: ProposalBuilderContext): Partial<LuxorProposalPaymentPlan> | null {
  const plan = asRecord(context.payment_plan)
  if (plan && Number.isInteger(Number(plan.payment_count)) && [2, 3, 4, 5].includes(Number(plan.payment_count))) {
    return {
      mode: 'deposit_and_balance',
      payment_count: Number(plan.payment_count) as 2 | 3 | 4 | 5,
      booking_payment_percent: asNumber(plan.booking_payment_percent) ?? 25,
      final_payment_due_days_before_event: asNumber(plan.final_payment_due_days_before_event) ?? 60,
      ...(typeof plan.booking_date === 'string' ? { booking_date: plan.booking_date } : {}),
    }
  }
  const mode = plan?.mode === 'pay_in_full' || plan?.mode === 'deposit_and_balance'
    ? plan.mode
    : null
  if (!plan || !mode) return null
  const bookingPaymentPercent = asNumber(plan.booking_payment_percent)
  const finalPaymentDays = asNumber(plan.final_payment_due_days_before_event)
  return {
    mode,
    ...(Number.isInteger(Number(plan.payment_count)) && [2, 3, 4, 5].includes(Number(plan.payment_count)) ? { payment_count: Number(plan.payment_count) as 2 | 3 | 4 | 5 } : {}),
    ...(bookingPaymentPercent !== undefined ? { booking_payment_percent: bookingPaymentPercent } : {}),
    ...(finalPaymentDays !== undefined ? { final_payment_due_days_before_event: finalPaymentDays } : {}),
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
  items,
  onItemsChange,
  proposalContext,
  onProposalContextChange,
  selectedPackageId,
  onSelectedPackageIdChange,
  promotionId,
  onPromotionIdChange,
  legacyDiscount,
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
  const [pendingPackageChange, setPendingPackageChange] = useState<{ packageId: string; absorbedServiceIds: string[]; clearedConflictServiceIds: string[] } | null>(null)
  const [promotions, setPromotions] = useState<LuxorPromotion[]>([])
  const [promotionsStatus, setPromotionsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [promotionCreatorOpen, setPromotionCreatorOpen] = useState(false)
  const [promotionDraft, setPromotionDraft] = useState<{ name: string; discount_type: 'percent' | 'fixed'; value: string }>({ name: '', discount_type: 'percent', value: '' })
  const [savingPromotion, setSavingPromotion] = useState(false)
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
    setPendingPackageChange(null)
    setPromotionCreatorOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    void loadPromotions()
  }, [isOpen])

  const effectiveContext = localContext
  const selectedPackage = normalizePackageId(selectedPackageId || effectiveContext.package_id)
  const eventDateValue = normalizeEventDateValue(effectiveContext.event_date) || normalizeEventDateValue(eventDate)
  const guestCount = asNumber(effectiveContext.expected_guest_count, eventGuestCount) || 0
  const rentalPeriod = effectiveContext.rental_period || 'evening'
  const selectedServiceIds = useMemo(() => selectedServiceIdsFrom(effectiveContext, items), [effectiveContext, items])
  const removedServiceIds = useMemo(() => removedServiceIdsFrom(effectiveContext), [effectiveContext])
  const customItems = useMemo(() => (
    customItemsFrom(effectiveContext)
    ?? items.filter((item) => item.pricingRole === 'custom')
  ), [effectiveContext, items])
  const selectedServiceIdSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds])
  const removedServiceIdsSet = useMemo(() => new Set(removedServiceIds), [removedServiceIds])
  const selectedPackageOption = PACKAGE_OPTIONS.find((option) => option.id === selectedPackage)
  const packageBaseServiceIds = useMemo(() => selectedPackageOption ? PACKAGE_INCLUDED_SERVICE_IDS[selectedPackageOption.id] : [], [selectedPackageOption])
  const packageIncludedServiceIds = useMemo(() => packageBaseServiceIds.filter((includedServiceId) => {
    if (removedServiceIdsSet.has(includedServiceId)) return false
    const includedService = availableServices.find((service) => service.id === includedServiceId)
    if (!includedService?.exclusiveGroup) return true
    return !selectedServiceIds.some((selectedServiceId) => {
      if (selectedServiceId === includedServiceId) return false
      return availableServices.find((service) => service.id === selectedServiceId)?.exclusiveGroup === includedService.exclusiveGroup
    })
  }), [availableServices, packageBaseServiceIds, removedServiceIdsSet, selectedServiceIds])
  // Only actual venue/required rows are locked. Package components can be
  // removed or restored; the calculation uses removedServiceIds rather than
  // inventing package credits on the client.
  const lockedServiceIds = useMemo(() => availableServices
    .filter((service) => service.required || service.locked)
    .map((service) => service.id), [availableServices])
  const optionalServices = useMemo(() => selectedPackageOption ? availableServices : [], [availableServices, selectedPackageOption])
  const paymentPlanDraft = getPaymentPlanDraft(effectiveContext)
  const pricingSelection = asRecord(effectiveContext.pricing_selection)
  const selectedPromotionId = promotionId
    || asString(pricingSelection?.promotionId)
    || asString(pricingSelection?.promotion_id)
    || asString(effectiveContext.promotionId)
    || asString(effectiveContext.promotion_id)
    || null
  const selectedPromotion = promotions.find((promotion) => promotion.id === selectedPromotionId) || null
  const hasUnmigratedLegacyDiscount = Boolean(!selectedPromotionId && legacyDiscount && legacyDiscount.value > 0)

  const updateProposalContext = (patch: Partial<ProposalBuilderContext>) => {
    const next = { ...effectiveContext, ...patch }
    setLocalContext(next)
    onProposalContextChange?.(next)
  }

  const setSelectedPromotion = (nextPromotionId: string | null) => {
    const nextSelection = { ...(effectiveContext.pricing_selection || {}) }
    if (nextPromotionId) {
      nextSelection.promotionId = nextPromotionId
      nextSelection.promotion_id = nextPromotionId
    } else {
      delete nextSelection.promotionId
      delete nextSelection.promotion_id
    }
    onPromotionIdChange?.(nextPromotionId)
    updateProposalContext({
      promotionId: nextPromotionId,
      promotion_id: nextPromotionId,
      pricing_selection: nextSelection,
    })
  }

  const loadPromotions = async () => {
    setPromotionsStatus('loading')
    setPromotionError(null)
    try {
      const response = await fetch('/api/portal/promotions', { credentials: 'same-origin' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !Array.isArray(payload)) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Promotions could not be loaded.')
      setPromotions(payload.filter((promotion): promotion is LuxorPromotion => Boolean(promotion && typeof promotion.id === 'string')))
      setPromotionsStatus('ready')
    } catch (error) {
      setPromotionsStatus('error')
      setPromotionError(error instanceof Error ? error.message : 'Promotions could not be loaded.')
    }
  }

  const savePromotion = async () => {
    const name = promotionDraft.name.trim()
    const value = Number(promotionDraft.value)
    if (!name || !Number.isFinite(value) || value <= 0 || (promotionDraft.discount_type === 'percent' && value > 100)) return
    setSavingPromotion(true)
    setPromotionError(null)
    try {
      const response = await fetch('/api/portal/promotions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, discount_type: promotionDraft.discount_type, value }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload || typeof payload.id !== 'string') throw new Error(typeof payload?.error === 'string' ? payload.error : 'Promotion could not be saved.')
      const savedPromotion = payload as LuxorPromotion
      setPromotions((current) => [...current.filter((promotion) => promotion.id !== savedPromotion.id), savedPromotion].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedPromotion(savedPromotion.id)
      setPromotionDraft({ name: '', discount_type: 'percent', value: '' })
      setPromotionCreatorOpen(false)
      setPromotionsStatus('ready')
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : 'Promotion could not be saved.')
    } finally {
      setSavingPromotion(false)
    }
  }

  const updateCustomItems = (nextItems: LuxorInvoiceLineItem[]) => {
    updateProposalContext({
      pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        service_ids: selectedServiceIds,
        customItems: customItemSelection(nextItems),
      },
    })
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

  /**
   * Package switches start from the new package defaults. A selected Basic
   * service only conflicts when the new package supplies a higher-level
   * service in that same group (for example Essential Decor → Full Decor).
   * Selected upgrades remain: the pricing engine treats them as approved
   * replacements, rather than stacking another charge on top of the package.
   */
  const reconcilePackageServices = (packageOption?: (typeof PACKAGE_OPTIONS)[number]) => {
    const packageServiceIds = new Set(packageOption ? PACKAGE_INCLUDED_SERVICE_IDS[packageOption.id] : [])
    const libraryById = new Map(availableServices.map((service) => [service.id, service]))
    const packageServices = [...packageServiceIds]
      .map((serviceId) => libraryById.get(serviceId))
      .filter((service): service is ProposalServiceOption => Boolean(service))
    const absorbedServiceIds = selectedServiceIds.filter((serviceId) => packageServiceIds.has(serviceId))
    const clearedConflictServiceIds = selectedServiceIds.filter((serviceId) => {
      if (packageServiceIds.has(serviceId)) return false
      const selectedService = libraryById.get(serviceId)
      if (!selectedService?.exclusiveGroup || selectedService.serviceLevel !== 'basic') return false
      return packageServices.some((packageService) => (
        packageService.id !== selectedService.id
        && packageService.exclusiveGroup === selectedService.exclusiveGroup
        && packageService.serviceLevel === 'upgrade'
      ))
    })
    return {
      absorbedServiceIds,
      clearedConflictServiceIds,
      removedServiceIds: new Set([...absorbedServiceIds, ...clearedConflictServiceIds]),
    }
  }

  const selectPackage = (packageId: string) => {
    const packageOption = PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(packageId))
    const canonicalId = packageOption?.id || packageId
    const { removedServiceIds } = reconcilePackageServices(packageOption)
    const nextServiceIds = selectedServiceIds.filter((id) => !removedServiceIds.has(id))
    const nextItems = items.filter((item) => (
      item.pricingRole !== 'add_on'
      || !item.catalogId
      || !removedServiceIds.has(item.catalogId)
    ))
    onSelectedPackageIdChange?.(canonicalId)
    updateProposalContext({
      package_id: canonicalId,
      package_name: packageOption?.name,
      pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        service_ids: nextServiceIds,
        removedServiceIds: [],
        removed_service_ids: [],
      },
    })
    // Package base items come back from the server calculator. Keep only
    // optional selections that remain valid for the newly selected package.
    onItemsChange(nextItems)
  }

  const requestPackageChange = (packageId: string, requireConfirmation = false) => {
    const nextPackageId = normalizePackageId(packageId)
    if (!nextPackageId || nextPackageId === selectedPackage) return
    const nextPackage = PACKAGE_OPTIONS.find((option) => option.id === nextPackageId)
    const { absorbedServiceIds, clearedConflictServiceIds } = reconcilePackageServices(nextPackage)

    if (requireConfirmation) {
      setPendingPackageChange({ packageId: nextPackageId, absorbedServiceIds, clearedConflictServiceIds })
      return
    }

    selectPackage(nextPackageId)
  }

  const updateServiceSelection = (serviceId: string) => {
    const service = availableServices.find((candidate) => candidate.id === serviceId)
    if (!service || !selectedPackageOption || lockedServiceIds.includes(serviceId)) return

    const libraryById = new Map(availableServices.map((candidate) => [candidate.id, candidate]))
    const isSelected = selectedServiceIdSet.has(serviceId)
    const isPackageDefault = packageBaseServiceIds.includes(serviceId)
    const isPackageIncluded = packageIncludedServiceIds.includes(serviceId)
    const wasPackageDefaultRemoved = isPackageDefault && removedServiceIdsSet.has(serviceId)

    if (isPackageIncluded) {
      const nextRemovedServiceIds = [...new Set([...removedServiceIds, serviceId])]
      updateProposalContext({
        pricing_selection: {
          ...(effectiveContext.pricing_selection || {}),
          service_ids: selectedServiceIds,
          removedServiceIds: nextRemovedServiceIds,
          removed_service_ids: nextRemovedServiceIds,
        },
      })
      return
    }

    if (wasPackageDefaultRemoved || (isPackageDefault && !isSelected)) {
      const nextServiceIds = selectedServiceIds.filter((id) => {
        const current = libraryById.get(id)
        return !service.exclusiveGroup || current?.exclusiveGroup !== service.exclusiveGroup
      })
      const nextItems = items.filter((item) => {
        if (!item.catalogId) return true
        const current = libraryById.get(item.catalogId)
        return !service.exclusiveGroup || current?.exclusiveGroup !== service.exclusiveGroup
      })
      const nextRemovedServiceIds = removedServiceIds.filter((id) => id !== serviceId)
      updateProposalContext({
        pricing_selection: {
          ...(effectiveContext.pricing_selection || {}),
          service_ids: nextServiceIds,
          removedServiceIds: nextRemovedServiceIds,
          removed_service_ids: nextRemovedServiceIds,
        },
      })
      onItemsChange(nextItems)
      return
    }

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
        removedServiceIds,
        removed_service_ids: removedServiceIds,
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
      removedServiceIds,
      customItems: customItemSelection(customItems),
      promotionId: selectedPromotionId,
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
      removedServiceIds,
      removed_service_ids: removedServiceIds,
      customItems: customItemSelection(customItems),
      ...(selectedPromotionId ? { promotionId: selectedPromotionId, promotion_id: selectedPromotionId } : {}),
    },
    selected_services: selectedServiceIds,
    line_items: items.map((item) => ({
      catalogId: item.catalogId,
      quantity: item.quantity,
      included: item.included,
      pricingRole: item.pricingRole,
    })),
    tax_rate: taxRate.trim() === '' ? null : Math.max(0, Number(taxRate) || 0),
  }), [customItems, effectiveContext.event_type, effectiveContext.payment_plan, effectiveContext.pricing_selection, eventDateValue, eventType, guestCount, items, removedServiceIds, rentalPeriod, selectedPackage, selectedPromotionId, selectedServiceIds, taxRate])
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
    // Begin the visual handoff immediately; the request itself stays debounced
    // so normal typing does not generate a pricing call for every keystroke.
    setPricingStatus('loading')
    setPricingError(null)
    const timer = window.setTimeout(async () => {
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
  const servicePackageOptions = useMemo(() => PACKAGE_OPTIONS.map((option) => {
    const calculated = calculatedPackages.find((candidate) => normalizePackageId(candidate.id) === option.id)
    return {
      ...option,
      // Keep the UI's canonical package ID even though the calculator uses
      // rental_only / bronze_essentials etc. internally.
      id: option.id,
      finalEventPrice: calculated?.finalEventPrice,
    }
  }), [calculatedPackages])
  const servicePrices = useMemo(() => {
    const result: Record<string, number | null> = {}
    for (const value of arrayFromUnknown(calculation?.addOnQuotes)) {
      const quote = asRecord(value)
      const id = asString(quote?.id)
      if (!id) continue
      result[id] = quote?.total === null ? null : asNumber(quote?.total) ?? null
    }
    return result
  }, [calculation])
  const serviceQuotes = useMemo(() => {
    const result: Record<string, NonNullable<ProposalPricingCalculation['addOnQuotes']>[number]> = {}
    for (const value of arrayFromUnknown(calculation?.addOnQuotes)) {
      const quote = asRecord(value)
      const id = asString(quote?.id)
      if (!id) continue
      result[id] = value as NonNullable<ProposalPricingCalculation['addOnQuotes']>[number]
    }
    return result
  }, [calculation])
  const selectedCalculatedPackage = calculatedPackages.find((candidate) => normalizePackageId(candidate.id) === normalizePackageId(selectedPackage))
  const selectedContext = calculation?.context || effectiveContext
  const finalEventPrice = selectedCalculatedPackage?.finalEventPrice ?? asNumber(selectedContext.final_event_price)
  const refundableSecurityDeposit = selectedCalculatedPackage?.refundableSecurityDeposit ?? asNumber(selectedContext.refundable_security_deposit)
  const finalLineItems = selectedCalculatedPackage?.lineItems?.length
    ? selectedCalculatedPackage.lineItems
    : calculation?.lineItems?.length
      ? calculation.lineItems
      : []
  // Discounts and tax belong in the one concise financial summary, not in the
  // client-facing checklist of package selections.
  const proposalChecklistItems = finalLineItems.filter((item) => (
    item.pricingRole !== 'discount' && item.pricingRole !== 'tax'
  ))
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
  const isCalculating = pricingStatus === 'loading'
  const hasFinalPrice = pricingStatus === 'ready' && typeof finalEventPrice === 'number' && finalEventPrice >= 0
  const canPublish = Boolean(selectedPackage && eventDateValue && guestCount > 0 && hasFinalPrice && pricingErrors.length === 0 && !paymentPlanRequired)

  const advance = () => {
    if (stepIndex === 0 && (!eventDateValue || guestCount < 1 || guestCount > 200)) {
      setValidationMessage('Add the event date and an expected guest count from 1 to 200 before continuing.')
      return
    }
    if (stepIndex === 1 && !selectedPackage) {
      setValidationMessage('Choose a package at the top of Services & Items before comparing the final options.')
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
    const current = paymentPlanDraft || {}
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
    ? 'Continue to services & items'
    : stepIndex === 1
      ? 'Continue to compare'
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
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Luxor at Las Palmas Events</p>
                <h2 className="truncate font-serif text-xl font-semibold leading-6 sm:text-2xl">{isEditing ? 'Revise final proposal' : 'Build final proposal'}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] sm:inline-flex ${pricingStatus === 'ready' && !pricingErrors.length ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                {isCalculating ? <ProposalCalculationStatus label={headerStatus} /> : headerStatus}
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
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The date, rental period, guest count, promotion, tax treatment, and selected services are the only inputs that shape this proposal. The final price comes from Luxor’s pricing rules.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
                <div className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal title</span>
                    <input
                      value={description}
                      onChange={(event) => onDescriptionChange(event.target.value)}
                      placeholder={`${clientName.split(/\s+/)[0] || 'Client'}’s ${eventType || 'Event'}`}
                      className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event date</span>
                      <PortalDatePicker value={eventDateValue} onChange={setEventDate} className="w-full" placeholder="Select event date" />
                      {eventDateValue ? <p className="text-[10px] font-semibold text-[#8c6529] dark:text-[#f1d27a]">{formatEventDate(eventDateValue)}</p> : null}
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
                          className="portal-input-transparent min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold outline-none"
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
                          { value: 'morning', label: 'Morning · 8 AM–3 PM' },
                          { value: 'evening', label: 'Evening · 5 PM–12 AM' },
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
                    {normalizeEventDateValue(dueDate) ? <p className="mt-2 text-[10px] font-semibold text-[#8c6529] dark:text-[#f1d27a]">{formatEventDate(dueDate)}</p> : null}
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
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Add promotion</p>
                        <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">Promotions are saved once and can be used on future proposals.</p>
                      </div>
                      <button type="button" onClick={() => { setPromotionDraft({ name: '', discount_type: 'percent', value: '' }); setPromotionCreatorOpen(true) }} className="inline-flex min-h-8 shrink-0 items-center rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#8c6529] transition hover:bg-[#caa24c]/16 dark:text-[#f1d27a]">Create</button>
                    </div>
                    <PortalSelect
                      value={selectedPromotionId || ''}
                      onChange={(value) => setSelectedPromotion(value || null)}
                      options={[
                        { value: '', label: 'No promotion' },
                        ...promotions.filter((promotion) => promotion.active).map((promotion) => ({
                          value: promotion.id,
                          label: `${promotion.name} · ${promotion.discount_type === 'fixed' ? formatMoney(promotion.value) : `${promotion.value}%`} off`,
                        })),
                      ]}
                      className="mt-2 w-full"
                      buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal"
                    />
                    {promotionsStatus === 'loading' ? <p className="mt-2 text-[10px] text-[color:var(--portal-muted)]"><ProposalCalculationStatus label="Loading saved promotions" /></p> : null}
                    {selectedPromotion ? <p className="mt-2 text-[10px] leading-4 text-emerald-700 dark:text-emerald-300">{selectedPromotion.name} ({selectedPromotion.code}) will be verified and snapped into this final proposal.</p> : null}
                    {hasUnmigratedLegacyDiscount ? <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/8 p-2.5 text-[10px] leading-4 text-amber-900 dark:text-amber-100"><p className="font-bold">This draft has a legacy adjustment.</p><p className="mt-0.5">Save it as a promotion before saving this revision so its exact terms stay protected.</p><button type="button" onClick={() => { setPromotionDraft({ name: 'Legacy proposal promotion', discount_type: legacyDiscount?.type || 'percent', value: String(legacyDiscount?.value || '') }); setPromotionCreatorOpen(true) }} className="mt-2 font-black uppercase tracking-[0.09em] text-[#8c6529] underline decoration-[#caa24c]/50 underline-offset-2 dark:text-[#f1d27a]">Save as promotion</button></div> : null}
                    {promotionError ? <div role="alert" className="mt-2 flex items-center justify-between gap-2 text-[10px] leading-4 text-rose-700 dark:text-rose-300"><span>{promotionError}</span>{promotionsStatus === 'error' ? <button type="button" onClick={() => void loadPromotions()} className="font-black uppercase tracking-[0.09em] underline underline-offset-2">Retry</button> : null}</div> : null}
                  </div>
                </aside>
              </div>

              <label className="block max-w-4xl space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Client note</span>
                <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional note to include in the final proposal" className="min-h-24 w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-sm leading-5 outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" />
              </label>
            </section>
          ) : null}

          {stepIndex === 2 ? (
            <section aria-busy={isCalculating} className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 3 of 5</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Compare the packages against your service selections.</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Every card uses the same date, guest count, rental period, required services, saved promotion, and tax treatment. Switch packages here only when the comparison changes the right fit; compatible add-ons and custom items stay with the proposal.</p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${pricingStatus === 'ready' && !pricingErrors.length ? paymentPlanRequired ? 'border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                  {isCalculating ? <ProposalCalculationStatus label="Updating final prices" /> : <><ReceiptText size={14} />{pricingStatus === 'ready' && paymentPlanRequired && !pricingErrors.length ? 'Final prices calculated — set payment plan later' : pricingStatus === 'ready' ? 'Final prices calculated' : 'Complete event details to calculate'}</>}
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
                      onClick={() => requestPackageChange(packageOption.id, true)}
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
                        {isCalculating ? <ProposalPriceSkeleton /> : showPrice ? <p className="mt-1 font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(packageOption.finalEventPrice)}</p> : <p className="mt-2 text-xs font-semibold text-[color:var(--portal-muted)]">Pricing appears after details are complete.</p>}
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
                    <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Its base services are locked into the price. Compatible add-ons and custom items stay with the proposal; any service now included by the new package is absorbed and never charged twice.</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {selectedPackageOption.inclusions.map((inclusion) => <p key={inclusion} className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs font-semibold"><Check size={13} className="shrink-0 text-emerald-700 dark:text-emerald-300" />{inclusion}</p>)}
                    </div>
                  </div>
                  <aside className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal summary</p>
                    {isCalculating ? <div aria-label="Updating proposal summary" className="mt-3 space-y-3"><div className="flex items-center justify-between gap-3"><span className="h-3 w-28 rounded luxor-skeleton" /><span className="h-3 w-16 rounded luxor-skeleton" /></div><div className="flex items-center justify-between gap-3"><span className="h-3 w-24 rounded luxor-skeleton" /><span className="h-3 w-14 rounded luxor-skeleton" /></div><div className="border-t border-[#caa24c]/20 pt-3"><span className="block h-2.5 w-24 rounded luxor-skeleton" /><span className="mt-2 block h-6 w-28 rounded luxor-skeleton" /></div><div className="flex items-center justify-between gap-3"><span className="h-3 w-36 rounded luxor-skeleton" /><span className="h-3 w-16 rounded luxor-skeleton" /></div></div> : <div className="mt-3 space-y-2.5 text-sm">
                      {typeof proposalSubtotal === 'number' ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Package &amp; services</span><span className="font-mono font-semibold">{formatMoney(proposalSubtotal)}</span></div> : null}
                      {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">{selectedPromotion?.name || 'Promotion'}</span><span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">−{formatMoney(proposalDiscountAmount)}</span></div> : null}
                      {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Sales tax{typeof proposalTaxRate === 'number' ? ` (${formatTaxRate(proposalTaxRate)})` : ''}</span><span className="font-mono font-semibold">{formatMoney(proposalTaxAmount)}</span></div> : null}
                      <div className="flex items-end justify-between gap-3 border-t border-[#caa24c]/20 pt-3"><span className="text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Final event price</span><span className="font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{hasFinalPrice ? formatMoney(finalEventPrice) : 'Pricing not ready'}</span></div>
                      <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[color:var(--portal-muted)]">Refundable security deposit</span><span className="font-mono font-bold">{formatMoney(refundableSecurityDeposit ?? 750)}</span></div>
                    </div>}
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

          {stepIndex === 1 ? (
            <section aria-busy={isCalculating} className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 2 of 5</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Build the services and items for this event.</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Choose a starting package above, then adjust the exact service list. Required services stay locked; basic choices and upgrades are priced from Luxor’s approved rules.</p>
                </div>
                <button type="button" onClick={() => { setStepIndex(2); setValidationMessage(null) }} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]"><ReceiptText size={13} /> Compare packages</button>
              </div>

              <div className="rounded-2xl border border-[#caa24c]/20 bg-[#caa24c]/[0.055] p-4 text-sm leading-6 text-[color:var(--portal-muted)]">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
                  <p>Required services stay locked. Basic and upgrade choices are mutually exclusive inside each category, and the server verifies every exact price before publishing.</p>
                </div>
              </div>

              <ProposalPackageItemsPanel
                packageName={selectedCalculatedPackage?.name || selectedPackageOption?.name || null}
                packageOptions={servicePackageOptions}
                selectedPackageId={selectedPackage}
                onSelectPackage={selectPackage}
                lineItems={finalLineItems}
                customItems={customItems}
                optionalServices={optionalServices}
                catalogServices={availableServices}
                addableServiceIds={optionalServices.filter((service) => !lockedServiceIds.includes(service.id)).map((service) => service.id)}
                lockedServiceIds={lockedServiceIds}
                includedServiceIds={[...packageIncludedServiceIds]}
                unavailableServiceIds={[]}
                selectedServiceIds={selectedServiceIds}
                servicePrices={servicePrices}
                serviceQuotes={serviceQuotes}
                pricingReady={pricingStatus === 'ready' && !pricingErrors.length}
                finalEventPrice={finalEventPrice}
                refundableSecurityDeposit={refundableSecurityDeposit}
                onToggleService={updateServiceSelection}
                onAddCustomItem={(item) => updateCustomItems([...customItems, item])}
                onUpdateCustomItem={(item) => updateCustomItems(customItems.map((current) => current.id === item.id ? item : current))}
                onRemoveCustomItem={(itemId) => updateCustomItems(customItems.filter((item) => item.id !== itemId))}
              />

              {pricingErrors.length ? (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200"><p className="font-bold">This package needs a pricing rule before it can be published.</p>{pricingErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1">{error}</p>)}</div>
              ) : null}
            </section>
          ) : null}

          {stepIndex === 3 ? (
            <section aria-busy={isCalculating} className="mx-auto max-w-4xl space-y-6">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 4 of 5</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Review the client’s final proposal.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">This screen is intentionally read-only. Go back to the earlier steps to change facts or services; publishing creates an immutable snapshot for the email, PDF, private page, and contract.</p>
              </div>

              {!selectedPackage ? (
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-muted)]">Choose a package in Compare before reviewing the proposal.</div>
              ) : isCalculating ? (
                <ProposalReviewCalculationSkeleton />
              ) : !hasFinalPrice ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5 text-sm leading-6 text-amber-900 dark:text-amber-100"><p className="font-bold">Final pricing is not ready.</p><p className="mt-1">Return to Details and complete the event facts, then wait for the pricing calculation to finish.</p></div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                  <div className="border-b border-[#caa24c]/20 bg-[#1a140d] px-5 py-7 text-center text-white sm:px-8">
                    <p className="font-serif text-2xl tracking-[0.2em] text-[#f1d27a]">LUXOR</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.28em] text-white/65">At Las Palmas Events</p>
                  </div>
                  <div className="p-5 sm:p-7">
                    <div className="flex flex-col gap-5 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Final proposal</p>
                        <h4 className="mt-1 font-serif text-2xl font-semibold">{description || `${clientName.split(/\s+/)[0] || 'Client'}’s ${eventType || 'Event'}`}</h4>
                        <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Prepared for {clientName} · {formatEventDate(eventDateValue)} · {guestCount} guests</p>
                      </div>
                      <span className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">{selectedCalculatedPackage?.name || PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(selectedPackage))?.name}</span>
                    </div>

                    <div className="mt-5 grid gap-2 border-y border-[color:var(--portal-border)] py-4 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ['Venue', 'Luxor at Las Palmas Events'],
                        ['Event date', formatEventDate(eventDateValue)],
                        ['Guests', `${guestCount} expected`],
                        ['Access', formatEventAccess(eventAccess, rentalPeriod)],
                      ].map(([label, value]) => <div key={label} className="min-w-0 px-1 py-1 sm:px-2"><p className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--portal-text)]">{value}</p></div>)}
                    </div>

                    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_290px]">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Your selected package &amp; services</p>
                          <span className="text-[10px] font-bold text-[color:var(--portal-muted)]">Final selection</span>
                        </div>
                        {proposalChecklistItems.length ? (
                          <div className="mt-3 divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)]">
                            {proposalChecklistItems.map((item, index) => (
                              <div key={`${item.catalogId || item.description}-${index}`} className="flex items-start gap-3 px-4 py-3.5 text-sm">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]"><Check size={12} strokeWidth={2.5} /></span>
                                <div className="min-w-0"><p className="font-semibold">{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</p>{item.detail ? <p className="mt-0.5 text-xs leading-4 text-[color:var(--portal-muted)]">{item.detail}</p> : null}</div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="mt-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-muted)]">The detailed itemization will appear when the pricing service returns the selected package snapshot.</p>}
                      </div>
                      <aside className="h-fit rounded-xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Price summary</p>
                        <div className="mt-3 space-y-2.5 text-sm">
                          {typeof proposalSubtotal === 'number' ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Subtotal</span><span className="font-mono font-semibold">{formatMoney(proposalSubtotal)}</span></div> : null}
                          {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">{selectedPromotion?.name || 'Promotion'}</span><span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">−{formatMoney(proposalDiscountAmount)}</span></div> : null}
                          {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Sales tax{typeof proposalTaxRate === 'number' ? ` (${formatTaxRate(proposalTaxRate)})` : ''}</span><span className="font-mono font-semibold">{formatMoney(proposalTaxAmount)}</span></div> : null}
                          <div className="border-t border-[#caa24c]/20 pt-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final total</p><p className="mt-1 font-mono text-2xl font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p></div>
                        </div>
                        <div className="mt-4 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3"><p className="text-[9px] font-black uppercase tracking-[0.11em] text-[#8c6529] dark:text-[#f1d27a]">Payment process</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Proposal acceptance → Event Agreement → Stripe payment link after signature. The separate refundable security deposit is handled with the first payment.</p></div>
                      </aside>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {stepIndex === 4 ? (
            <section aria-busy={isCalculating} className="mx-auto max-w-6xl space-y-6">
              <div className="max-w-3xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 5 of 5</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Set the exact agreement payment terms.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The client accepts the final proposal first, Luxor sends the Event Agreement next, and Stripe is sent only after the agreement is signed. The schedule below shows exactly what that process will collect.</p>
              </div>

              <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)] lg:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">1 · Agreement payment terms</p>
                    <h4 className="mt-1 text-lg font-bold">Choose the payment schedule Luxor has approved.</h4>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">The booking payment is 25% of Venue Services, with a $750 minimum. The refundable $750 security deposit is separate and due 30 days before the event.</p>
                    <div className="mt-4 grid gap-3">
                      <p className="text-xs font-semibold text-[color:var(--portal-muted)]">The schedule is anchored to the actual contract/Stripe booking date after signature. The preview uses today’s date until that booking exists.</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[2, 3, 4, 5].map((count) => <button key={count} type="button" onClick={() => updatePaymentPlan({ mode: 'deposit_and_balance', payment_count: count as 2 | 3 | 4 | 5, booking_payment_percent: 25, final_payment_due_days_before_event: 60 })} className={`min-h-11 rounded-lg border px-3 text-xs font-bold ${paymentPlanDraft?.payment_count === count ? 'border-[#caa24c] bg-[#171512] text-white' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'}`}>{count} Payments</button>)}
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

              {isCalculating ? <ProposalPaymentScheduleSkeleton /> : <ProposalPaymentSchedule
                finalEventPrice={finalEventPrice}
                venueServicesTotal={venueServicesTotal}
                eventServicesTotal={eventServicesTotal}
                refundableSecurityDeposit={refundableSecurityDeposit}
                paymentPlan={paymentPlanDraft}
                finalPaymentDueDate={asString(selectedContext.final_payment_due_date)}
                eventDate={eventDateValue}
                bookingDate={new Date().toISOString().slice(0, 10)}
                paymentCount={paymentPlanDraft?.payment_count ?? 4}
                editable
                onPaymentCountChange={(count) => updatePaymentPlan({ mode: 'deposit_and_balance', payment_count: count, booking_payment_percent: 25, final_payment_due_days_before_event: 60 })}
              />}

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
            {isCalculating ? <div role="status" aria-live="polite" className="space-y-2 py-1"><span className="block h-2.5 w-28 rounded luxor-skeleton" /><span className="block h-5 w-24 rounded luxor-skeleton" /><span className="sr-only">Updating selected final event price.</span></div> : hasFinalPrice ? <><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Selected final event price</p><p className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p></> : <p className="flex min-h-10 items-center text-xs text-[color:var(--portal-muted)]">Complete the event facts to calculate the final price.</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {stepIndex > 0 ? <button type="button" onClick={retreat} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:opacity-40"><ArrowLeft size={14} /> Back</button> : null}
            {stepIndex < STEPS.length - 1 ? <button type="button" onClick={advance} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] !text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] disabled:opacity-40">{continueLabel} <ArrowRight size={14} className="!text-white" /></button> : <>
              <button type="button" onClick={() => onSubmit('save')} disabled={submitting || hasUnmigratedLegacyDiscount} title={hasUnmigratedLegacyDiscount ? 'Save the legacy adjustment as a promotion first.' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-40"><Eye size={14} /> Save draft &amp; preview</button>
              <button type="button" onClick={() => onSubmit('email')} disabled={submitting || !clientEmail || !canPublish || hasUnmigratedLegacyDiscount} title={hasUnmigratedLegacyDiscount ? 'Save the legacy adjustment as a promotion first.' : !canPublish ? paymentPlanRequired ? 'Set the payment plan in Step 5 before publishing.' : 'Complete the required event details and final pricing before publishing.' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] !text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] [&>svg]:!text-white disabled:cursor-not-allowed disabled:bg-[color:var(--portal-soft)] disabled:!text-[color:var(--portal-muted)] disabled:shadow-none disabled:[&>svg]:!text-[color:var(--portal-muted)]"><Mail size={14} /> {submitting ? 'Publishing…' : 'Publish & email final proposal'}</button>
            </>}
          </div>
        </footer>

        <PortalModal isOpen={Boolean(pendingPackageChange)} onClose={() => setPendingPackageChange(null)} ariaLabel="Confirm package change" maxWidth="max-w-lg">
          <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Compare packages</p>
                <h3 className="mt-1 font-serif text-xl font-semibold">Switch the selected package?</h3>
              </div>
              <PortalCloseButton onClick={() => setPendingPackageChange(null)} aria-label="Cancel package change" />
            </div>
            <div className="space-y-4 px-5 py-5 text-sm leading-6 text-[color:var(--portal-muted)]">
              <p>{pendingPackageChange ? <>Switch to <strong className="text-[color:var(--portal-text)]">{PACKAGE_OPTIONS.find((option) => option.id === normalizePackageId(pendingPackageChange.packageId))?.name}</strong>. Luxor will recalculate the exact price from its approved rules.</> : null}</p>
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3">
                <p className="font-semibold text-[color:var(--portal-text)]">What stays with this proposal</p>
                <p className="mt-1 text-xs">All custom items and compatible upgrades stay selected. Services that the new package already includes are absorbed into it and never charged twice.</p>
              </div>
              {pendingPackageChange?.absorbedServiceIds.length ? <div className="rounded-xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-3"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Moved into the new package</p><ul className="mt-1.5 space-y-1 text-xs">{pendingPackageChange.absorbedServiceIds.map((serviceId) => <li key={serviceId}>• {availableServices.find((service) => service.id === serviceId)?.name || serviceId.replaceAll('_', ' ')}</li>)}</ul></div> : null}
              {pendingPackageChange?.clearedConflictServiceIds.length ? <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3"><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Removed because the new package replaces it</p><p className="mt-1 text-xs text-amber-800 dark:text-amber-200">The selected Basic choice conflicts with the higher package level. Compatible upgrades remain selected.</p><ul className="mt-1.5 space-y-1 text-xs text-amber-800 dark:text-amber-200">{pendingPackageChange.clearedConflictServiceIds.map((serviceId) => <li key={serviceId}>• {availableServices.find((service) => service.id === serviceId)?.name || serviceId.replaceAll('_', ' ')}</li>)}</ul></div> : null}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingPackageChange(null)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)] transition hover:text-[color:var(--portal-text)]">Keep current package</button>
              <button type="button" onClick={() => { if (!pendingPackageChange) return; selectPackage(pendingPackageChange.packageId); setPendingPackageChange(null) }} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#b98a3e] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-white transition hover:bg-[#a8792f]">Switch package</button>
            </div>
          </section>
        </PortalModal>

        <PortalModal isOpen={promotionCreatorOpen} onClose={() => setPromotionCreatorOpen(false)} ariaLabel="Create saved promotion" maxWidth="max-w-md">
          <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Saved promotion</p>
                <h3 className="mt-1 font-serif text-xl font-semibold">Create promotion</h3>
              </div>
              <PortalCloseButton onClick={() => setPromotionCreatorOpen(false)} aria-label="Close promotion creator" />
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void savePromotion() }} className="space-y-4 px-5 py-5">
              <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Promotion name</span><input value={promotionDraft.name} onChange={(event) => setPromotionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Example: Grand opening special" className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" autoFocus /></label>
              <div className="grid gap-3 sm:grid-cols-[.9fr_1.1fr]">
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Type</span><PortalSelect value={promotionDraft.discount_type} onChange={(value) => setPromotionDraft((current) => ({ ...current, discount_type: value === 'fixed' ? 'fixed' : 'percent' }))} options={[{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Dollar amount' }]} className="w-full" buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal" /></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Value</span><span className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12"><span className="pl-3 font-mono text-sm text-[color:var(--portal-muted)]">{promotionDraft.discount_type === 'fixed' ? '$' : '%'}</span><input type="number" min="0.01" max={promotionDraft.discount_type === 'percent' ? 100 : undefined} step="0.01" inputMode="decimal" value={promotionDraft.value} onChange={(event) => setPromotionDraft((current) => ({ ...current, value: event.target.value }))} className="min-h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none" /></span></label>
              </div>
              <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Luxor creates the internal code automatically. You can edit or deactivate this saved promotion later in Settings.</p>
              {promotionError ? <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{promotionError}</p> : null}
              <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPromotionCreatorOpen(false)} disabled={savingPromotion} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Cancel</button><button type="submit" disabled={savingPromotion || !promotionDraft.name.trim() || !(Number(promotionDraft.value) > 0)} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#b98a3e] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-white transition hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-45">{savingPromotion ? 'Saving…' : 'Save promotion'}</button></div>
            </form>
          </section>
        </PortalModal>
      </div>
    </PortalModal>
  )
}
