'use client'

import { luxorScheduleMinutes } from '@/lib/luxorAvailability'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  DoorOpen,
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
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'
import { PortalCloseButton, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { ProposalPackageItemsPanel } from '@/components/portal/ProposalPackageItemsPanel'
import { ProposalPaymentSchedule, calculateProposalPaymentSchedule } from '@/components/portal/ProposalPaymentSchedule'
import { PromotionTermsFields, type PromotionTermsDraft } from './PromotionTermsFields'
import { proposalEventTiming, proposalSecurityDuration, RENTAL_WINDOWS, luxorCalendarDate, proposalValidThrough, resolveFixedProposalRentalRange, validateFixedProposalRentalSchedule } from '@/lib/luxorProposalTerms'
import { formatCatalogTime } from '@/lib/luxorPricingCatalog'
import { OFFICIAL_DECOR_SERVICES, getOfficialDecorService } from '@/lib/luxorDecorCatalog'
import { DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS, packageInclusionsForDisplay, type LuxorProposalPackageOption } from '@/lib/luxorProposalPackages'
import { SAME_DAY_BOOKING_CODE, SAME_DAY_BOOKING_TERMS, SAME_DAY_CARD_CUTOFF_TERMS, type LuxorSameDayBookingSnapshot } from '@/lib/luxorSameDayBooking'
import { formatWeekdayCustomRentalDuration, formatWeekdayCustomRentalPriceBreakdown, getWeekdayCustomRentalPolicy, getWeekdayCustomRentalSnapshot, isWeekdayCustomRentalDate, validateWeekdayCustomRentalSchedule, validateWeekdayCustomRentalTiming, type LuxorWeekdayCustomRentalPolicy } from '@/lib/luxorWeekdayRental'
import { formatLuxorCustomTimeRentalPriceBreakdownV4, getLuxorCustomTimeRentalSnapshotV4, validateLuxorCustomTimeScheduleV4, type LuxorCustomTimeRentalPolicyV4 } from '@/lib/luxorCustomTimeRentalV4'
import { LuxorAvailabilityCalendar } from '@/components/portal/LuxorAvailabilityCalendar'
import { isLuxorAvailabilityRangeOpen, type LuxorAvailabilityCalendar as LuxorAvailabilityMap } from '@/lib/luxorAvailability'
import { buildLuxorProposalBreakdownEmail, luxorProposalBreakdownHasCompletePrices } from '@/lib/luxorProposalBreakdownEmail'

function findInitialCustomRentalRange(
  availability: LuxorAvailabilityMap,
  date: string,
  minimumHours: number,
  incrementMinutes: number,
  options: { blockWholeDate: boolean; cleanupBufferMinutes: number; resetWindowBlocked: boolean },
) {
  const step = Math.max(1, incrementMinutes)
  const duration = Math.ceil((minimumHours * 60) / step) * step
  if (!Number.isFinite(duration) || duration <= 0 || duration > 19 * 60) return null
  for (let start = 6 * 60; start < 24 * 60; start += step) {
    const end = start + duration
    if (end > 25 * 60) break
    if (options.resetWindowBlocked && start < 17 * 60 && end > 15 * 60) continue
    const startTime = clockFromScheduleMinutes(start)
    const endTime = clockFromScheduleMinutes(end)
    if (isLuxorAvailabilityRangeOpen(availability, date, startTime, endTime, options)) return { startTime, endTime }
  }
  return null
}

function clockFromScheduleMinutes(value: number) {
  const clock = ((value % (24 * 60)) + (24 * 60)) % (24 * 60)
  return `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
}

function isWholeHourTime(value: string) {
  return /^(?:[01]\d|2[0-3]):00$/.test(value) || value === '24:00'
}

function shiftClockByHour(value: string, direction: -1 | 1) {
  if (!isWholeHourTime(value)) return null
  const hour = value === '24:00' ? 0 : Number(value.slice(0, 2))
  return `${String((hour + direction + 24) % 24).padStart(2, '0')}:00`
}

function formatDurationMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return '—'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  if (!minutes) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  if (!hours) return `${minutes} minutes`
  return `${hours} hr ${minutes} min`
}

function formatTimeRange(startTime: string, endTime: string, startsNextDay: boolean, endsNextDay: boolean) {
  if (!startTime || !endTime) return 'Set both times'
  const prefix = startsNextDay ? 'Next day · ' : ''
  const suffix = endsNextDay && !startsNextDay ? ' · ends next day' : ''
  return `${prefix}${formatCatalogTime(startTime)} – ${formatCatalogTime(endTime)}${suffix}`
}

function ProposalHourControl({
  label,
  value,
  onStep,
  canStep,
  stepReason,
}: {
  label: string
  value: string
  onStep: (direction: -1 | 1) => void
  canStep: (direction: -1 | 1) => boolean
  stepReason: (direction: -1 | 1) => string | null
}) {
  const wholeHour = isWholeHourTime(value)
  const display = value ? formatCatalogTime(value) : 'Choose a time'
  const legacyTimeReason = 'This saved time includes minutes. It is preserved; hourly controls are disabled until an approved on-hour time is selected.'
  const buttonClass = 'flex min-h-14 w-14 items-center justify-center border border-[#caa24c]/30 bg-[#caa24c]/10 text-2xl font-semibold text-[#8c6529] transition hover:bg-[#caa24c]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/55 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#f1d27a]'

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{label}</p>
      <div className="grid min-h-14 grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()} by one hour`} title={!wholeHour ? legacyTimeReason : stepReason(-1) || 'Decrease by exactly one hour'} disabled={!wholeHour || !canStep(-1)} onClick={() => onStep(-1)} className={`${buttonClass} border-y-0 border-l-0`}>
          <span aria-hidden="true">−</span>
        </button>
        <output aria-live="polite" aria-label={`${label}: ${display}`} className="flex min-w-0 items-center justify-center px-2 text-center text-xl font-semibold tracking-tight text-[color:var(--portal-text)] sm:text-2xl">
          <span className="truncate">{display}</span>
        </output>
        <button type="button" aria-label={`Increase ${label.toLowerCase()} by one hour`} title={!wholeHour ? legacyTimeReason : stepReason(1) || 'Increase by exactly one hour'} disabled={!wholeHour || !canStep(1)} onClick={() => onStep(1)} className={`${buttonClass} border-y-0 border-r-0`}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

type ProposalSubmitAction = 'save' | 'email' | 'in_person' | 'breakdown'
type ProposalPresentationMode = 'email' | 'in_person'

type ProposalPackageId = 'rent_only'

export type ProposalBuilderContext = {
  [key: string]: unknown
  version?: number
  pricing_config_version?: number
  package_id?: string
  package_name?: string
  event_type?: string
  event_date?: string
  expected_guest_count?: number
  rental_period?: 'morning' | 'evening' | 'full_day' | 'custom'
  event_access?: string
  guest_arrival_time?: string
  guestArrivalTime?: string
  event_end_time?: string
  eventEndTime?: string
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
  payment_policy_acknowledged?: boolean
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
  officialDecorCategory?: 'decor_packages' | 'decor_add_ons'
  inclusions?: readonly string[]
  minimumQuantity?: number
  unit?: string
  pricingUnit?: 'order' | 'set' | 'each' | 'letter' | 'arch'
  includedQuantity?: number
}

type CalculatedPackage = {
  id: string
  name: string
  description?: string
  positioning?: string
  summaryTitle?: string
  summary?: string
  inclusions?: string[]
  packageFeeAmount?: number | null
  pricingReviewRequired?: boolean
  finalEventPrice?: number | null
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
  rental_access?: Record<string, unknown>
  weekday_custom_rental?: LuxorWeekdayCustomRentalPolicy | null
  custom_time_rental_v4_policy?: LuxorCustomTimeRentalPolicyV4 | null
  context?: Partial<LuxorProposalContext>
  packages?: CalculatedPackage[]
  packageOptions?: LuxorProposalPackageOption[]
  lineItems?: LuxorInvoiceLineItem[]
  warnings?: string[]
  calculationErrors?: string[]
  publicationErrors?: string[]
  requirements?: {
    paymentPlan?: boolean
  }
  addOnQuotes?: Array<{
    id?: string
    label?: string
    category?: string
    description?: string
    unitPrice?: number
    quantity?: number
    selectedQuantity?: number
    minimumQuantity?: number
    unit?: string
    pricingUnit?: string
    officialDecorCategory?: string
    includedQuantity?: number
    state?: 'included' | 'selected' | 'available'
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
  invoiceId?: string | null
  supersedesInvoiceId?: string | null
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
  /** Active permanent test run; keeps this production builder on an isolated save/publish path. */
  testRunId?: string | null
  notes: string
  onNotesChange: (value: string) => void
  /** An owner must explicitly configure the tax treatment for each final proposal. */
  taxRate: string
  onTaxRateChange: (value: string) => void
  submitting: boolean
  submissionError?: string | null
  publicationPending?: boolean
  breakdownPublished?: boolean
  breakdownRetryAvailable?: boolean
  onSubmit: (action: ProposalSubmitAction, details?: { recipientEmail?: string }) => void
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
    name: 'Luxor Venue Proposal',
    eyebrow: 'Confirmed Luxor cost',
    description: 'Official Luxor venue rental, required cleaning and security, applicable tax, and included tables and chairs.',
    inclusions: ['Venue rental', 'Required security', 'Required cleaning', 'Tables & chairs included with rental'],
  },
]

/**
 * The pricing engine owns the package base. These IDs are used only to keep
 * a former optional selection from being carried into a new package and
 * charged a second time when an owner switches packages.
 */
const PACKAGE_INCLUDED_SERVICE_IDS: Record<ProposalPackageId, readonly string[]> = {
  rent_only: [],
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
  { id: 'tables_chairs_setup', name: 'Tables & chairs included with rental', category: 'Setup & rentals', detail: 'Included with the venue rental at no additional charge.', locked: true, required: true },
  { id: 'essential_decor', name: 'Essential decor', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'decor', serviceLevel: 'basic' },
  { id: 'full_decor', name: 'Full decor & planning', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'decor', serviceLevel: 'upgrade' },
  { id: 'buffet_catering', name: 'Buffet catering', category: 'Preferred Vendor Collection', detail: 'Estimated per-guest starting investment. Confirm directly with the vendor.', exclusiveGroup: 'catering', serviceLevel: 'basic' },
  { id: 'plated_catering', name: 'Plated catering', category: 'Preferred Vendor Collection', detail: 'Estimated per-guest starting investment. Confirm directly with the vendor.', exclusiveGroup: 'catering', serviceLevel: 'upgrade' },
  { id: 'dj', name: 'DJ', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.' },
  { id: 'photo_booth_signature', name: 'Signature photo booth', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'photo_booth', serviceLevel: 'basic' },
  { id: 'photo_booth_celebration', name: 'Celebration photo booth', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'photo_booth', serviceLevel: 'upgrade' },
  { id: 'photo_booth_forever', name: 'Forever photo booth', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'photo_booth', serviceLevel: 'upgrade' },
  { id: 'bartender_service', name: 'Bartender service', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'bar', serviceLevel: 'basic' },
  { id: 'byob_signature', name: 'Signature BYOB bar', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
  { id: 'byob_premium', name: 'Premium BYOB bar', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
  { id: 'byob_non_alcoholic', name: 'Non-alcoholic bar', category: 'Preferred Vendor Collection', detail: 'Estimated starting investment. Confirm directly with the vendor.', exclusiveGroup: 'bar', serviceLevel: 'upgrade' },
]

const STEPS = [
  { id: 'details', label: 'Details', icon: ClipboardList },
  { id: 'services', label: 'Services & decor', icon: PackageCheck },
  { id: 'compare', label: 'Selection', icon: ReceiptText },
  { id: 'review', label: 'Selected Proposal', icon: FileText },
  { id: 'payment', label: 'Payment plan', icon: Handshake },
  { id: 'contract', label: 'Agreement', icon: ShieldCheck },
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

export function getRentalPeriodBounds(rentalPeriod?: string | null, rentalAccess?: Record<string, unknown> | null): { startMinutes: number; endMinutes: number; label: string; startTime: string; endTime: string } {
  const period = String(rentalPeriod || 'evening').toLowerCase().replace(/[^a-z]/g, '')
  const periodId = period === 'morning' ? 'morning' : period === 'fullday' ? 'full_day' : 'evening'
  const configured = asRecord(rentalAccess?.[periodId])
  const configuredStart = typeof configured?.start === 'string' ? configured.start : ''
  const configuredEnd = typeof configured?.end === 'string' ? configured.end : ''
  const configuredStartMinutes = parseTimeToDayMinutes(configuredStart)
  const configuredEndMinutes = parseTimeToDayMinutes(configuredEnd)
  if (configuredStartMinutes !== null && configuredEndMinutes !== null) {
    const endMinutes = configuredEndMinutes < configuredStartMinutes ? configuredEndMinutes + (24 * 60) : configuredEndMinutes
    const periodLabel = periodId === 'morning' ? 'Morning' : periodId === 'full_day' ? 'Full Day' : 'Evening'
    return {
      startMinutes: configuredStartMinutes,
      endMinutes,
      label: `${periodLabel} (${formatCatalogTime(configuredStart)}–${formatCatalogTime(configuredEnd)})`,
      startTime: configuredStart,
      endTime: endMinutes >= 24 * 60 ? '24:00' : configuredEnd,
    }
  }
  if (period === 'morning') {
    return { startMinutes: 9 * 60, endMinutes: 15 * 60, label: 'Morning (9:00 AM–3:00 PM)', startTime: '09:00', endTime: '15:00' }
  }
  if (period === 'fullday') {
    return { startMinutes: 9 * 60, endMinutes: 23 * 60, label: 'Full Day (9:00 AM–11:00 PM)', startTime: '09:00', endTime: '23:00' }
  }
  return { startMinutes: 17 * 60, endMinutes: 23 * 60, label: 'Evening (5:00 PM–11:00 PM)', startTime: '17:00', endTime: '23:00' }
}

export function parseTimeToDayMinutes(timeStr?: string | null, isEvening = false): number | null {
  if (!timeStr) return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h === 0 && m === 0 && isEvening) {
    return 24 * 60
  }
  return h * 60 + m
}

export function validateEventTimes(guestArrivalTime?: string | null, eventEndTime?: string | null, rentalPeriod?: string | null) {
  return proposalEventTiming(rentalPeriod || 'evening', guestArrivalTime, eventEndTime)
}

function formatEventDate(value?: string | null) {
  const normalized = normalizeEventDateValue(value)
  if (!normalized) return 'Not set'
  const parsed = new Date(`${normalized}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatEventAccess(value?: string | null, rentalPeriod?: string | null, rentalAccess?: Record<string, unknown> | null) {
  const raw = String(value || rentalPeriod || '').trim()
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'morning' || normalized === 'evening' || normalized === 'fullday') {
    const period = normalized === 'fullday' ? 'full_day' : normalized
    const bounds = getRentalPeriodBounds(period, rentalAccess)
    const label = period === 'morning' ? 'Morning' : period === 'full_day' ? 'Full day' : 'Evening'
    const displayEnd = bounds.endTime === '24:00' ? '00:00' : bounds.endTime
    return `${label} · ${formatCatalogTime(bounds.startTime)}–${formatCatalogTime(displayEnd)}`
  }
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
  if (normalized === 'custompackage' || normalized === 'rentonly' || normalized === 'rentalonly' || normalized === 'venue') return 'rent_only'
  if (normalized === 'luxorvenueproposal') return 'rent_only'
  // Historic proposal snapshots retain their original package label. New work always starts as the one Luxor venue proposal.
  if (normalized === 'bronze' || normalized === 'essentials' || normalized === 'bronzeessentials' || normalized === 'silver' || normalized === 'premier' || normalized === 'silverpremier' || normalized === 'gold' || normalized === 'allinclusive' || normalized === 'goldallinclusive') return 'rent_only'
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
    pricingRole: ['required', 'included', 'add_on', 'discount', 'tax', 'tax_coverage', 'custom'].includes(String(record.pricingRole || record.pricing_role))
      ? String(record.pricingRole || record.pricing_role) as LuxorInvoiceLineItem['pricingRole']
      : undefined,
    paymentBucket: ['venue', 'event', 'security_deposit'].includes(String(record.paymentBucket || record.payment_bucket))
      ? String(record.paymentBucket || record.payment_bucket) as LuxorInvoiceLineItem['paymentBucket']
      : undefined,
    costClassification: record.costClassification === 'preferred_vendor_estimate' || record.cost_classification === 'preferred_vendor_estimate'
      ? 'preferred_vendor_estimate'
      : record.costClassification === 'luxor_charge' || record.cost_classification === 'luxor_charge'
        ? 'luxor_charge'
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
      positioning: asString(packageRecord.positioning),
      summaryTitle: asString(packageRecord.summaryTitle) || asString(packageRecord.summary_title),
      summary: asString(packageRecord.summary),
      inclusions: arrayFromUnknown(packageRecord.inclusions).filter((inclusion): inclusion is string => typeof inclusion === 'string'),
      packageFeeAmount: packageRecord.package_fee_amount === null || packageRecord.packageFeeAmount === null ? null : asNumber(packageRecord.package_fee_amount, packageRecord.packageFeeAmount),
      pricingReviewRequired: Boolean(packageRecord.pricingReviewRequired ?? packageRecord.pricing_review_required),
      finalEventPrice: packageRecord.final_event_price === null || packageRecord.finalEventPrice === null ? null : asNumber(packageRecord.final_event_price, packageRecord.finalEventPrice, packageRecord.total, packageRecord.event_total),
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
    rental_access: asRecord(root.rental_access) || asRecord(record.rental_access) || undefined,
    weekday_custom_rental: getWeekdayCustomRentalPolicy({ weekday_custom_rental: root.weekday_custom_rental }),
    custom_time_rental_v4_policy: asRecord(root.custom_time_rental_v4_policy) as LuxorCustomTimeRentalPolicyV4 | null,
    context: context as Partial<LuxorProposalContext> | undefined,
    packages,
    packageOptions: arrayFromUnknown(record.packageOptions || record.package_options).map((value) => {
      const option = asRecord(value)
      if (!option) return null
      const id = asString(option.id)
      if (!id || !['essentials', 'signature', 'luxor', 'customized'].includes(id)) return null
      return {
        id: id as LuxorProposalPackageOption['id'],
        name: asString(option.name) || '',
        positioning: asString(option.positioning) || '',
        description: asString(option.description) || '',
        summary_title: asString(option.summary_title) || asString(option.summaryTitle) || '',
        summary: asString(option.summary) || '',
        inclusions: arrayFromUnknown(option.inclusions).filter((inclusion): inclusion is string => typeof inclusion === 'string'),
        price_tiers: arrayFromUnknown(option.price_tiers).map((value) => asRecord(value)).filter((tier): tier is Record<string, unknown> => Boolean(tier)).map((tier) => ({ min_guests: asNumber(tier.min_guests) || 0, max_guests: asNumber(tier.max_guests) || 0, amount: asNumber(tier.amount) || 0 })),
        ...(asString(option.most_popular_label) ? { most_popular_label: asString(option.most_popular_label) } : {}),
      } satisfies LuxorProposalPackageOption
    }).filter((option): option is LuxorProposalPackageOption => Boolean(option)),
    lineItems: arrayFromUnknown(record.line_items || record.lineItems || record.items).map(normalizeLineItem).filter((item): item is LuxorInvoiceLineItem => Boolean(item)),
    warnings: arrayFromUnknown(record.warnings).filter((warning): warning is string => typeof warning === 'string'),
    errors: arrayFromUnknown(record.errors).filter((error): error is string => typeof error === 'string'),
  }
}

function pricingSelectionWithoutLegacySecurityHours(selection: Record<string, unknown> | null | undefined) {
  const result = { ...(selection || {}) }
  delete result.securityHours
  delete result.security_hours
  return result
}

function selectedServiceIdsFrom(context: ProposalBuilderContext, items: LuxorInvoiceLineItem[]) {
  const selection = context.pricing_selection || {}
  // An intentionally empty add-on list is meaningful: do not infer add-ons from
  // calculated package line items, or reopening a proposal can accidentally add
  // every included service as an upgrade.
  for (const candidate of [selection.service_ids, selection.services, selection.add_ons, selection.addOns]) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === 'string' && Boolean(value) && !getOfficialDecorService(value))
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
    .filter((id): id is string => Boolean(id) && !getOfficialDecorService(id || ''))
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
  const paymentCount = Number(plan?.payment_count)
  const paymentCadence = plan?.payment_cadence === 'biweekly' || plan?.payment_cadence === 'monthly' || plan?.payment_cadence === 'evenly_spaced'
    ? plan.payment_cadence
    : 'evenly_spaced'
  const bookingPaymentAmount = asNumber(plan?.booking_payment_amount)
  const preferredPaymentMethod = plan?.preferred_payment_method === 'card' || plan?.preferred_payment_method === 'cash' || plan?.preferred_payment_method === 'zelle' || plan?.preferred_payment_method === 'check'
    ? plan.preferred_payment_method
    : 'card'
  if (plan && Number.isInteger(paymentCount) && paymentCount >= 2 && paymentCount <= 24) {
    return {
      mode: 'deposit_and_balance',
      payment_count: paymentCount,
      payment_cadence: paymentCadence,
      booking_payment_percent: asNumber(plan.booking_payment_percent) ?? 25,
      final_payment_due_days_before_event: asNumber(plan.final_payment_due_days_before_event) ?? 60,
      ...(bookingPaymentAmount !== undefined ? { booking_payment_amount: bookingPaymentAmount } : {}),
      preferred_payment_method: preferredPaymentMethod,
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
    ...(Number.isInteger(paymentCount) && paymentCount >= 2 && paymentCount <= 24 ? { payment_count: paymentCount, payment_cadence: paymentCadence } : {}),
    ...(bookingPaymentPercent !== undefined ? { booking_payment_percent: bookingPaymentPercent } : {}),
    ...(finalPaymentDays !== undefined ? { final_payment_due_days_before_event: finalPaymentDays } : {}),
    ...(bookingPaymentAmount !== undefined ? { booking_payment_amount: bookingPaymentAmount } : {}),
    preferred_payment_method: preferredPaymentMethod,
  }
}

export function ProposalBuilderModal({
  isOpen,
  onClose,
  isEditing = false,
  invoiceId,
  supersedesInvoiceId,
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
  testRunId = null,
  notes,
  onNotesChange,
  taxRate,
  onTaxRateChange,
  submitting,
  submissionError,
  publicationPending = false,
  breakdownPublished = false,
  breakdownRetryAvailable = false,
  onSubmit,
}: ProposalBuilderModalProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const reducedMotion = useReducedMotion() ?? false
  const [furthestUnlockedStep, setFurthestUnlockedStep] = useState(0)
  const [localContext, setLocalContext] = useState<ProposalBuilderContext>(() => proposalContext || {})
  const [pricingStatus, setPricingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [calculation, setCalculation] = useState<ProposalPricingCalculation | null>(null)
  const [breakdownRecipient, setBreakdownRecipient] = useState(clientEmail || '')
  const [breakdownPhone, setBreakdownPhone] = useState<string | null>(null)
  const [breakdownPreviewOpen, setBreakdownPreviewOpen] = useState(false)
  const [weekdayPolicy, setWeekdayPolicy] = useState<LuxorWeekdayCustomRentalPolicy | null>(null)
  const [customTimeV4Policy, setCustomTimeV4Policy] = useState<LuxorCustomTimeRentalPolicyV4 | null>(null)
  const [pricingClock, setPricingClock] = useState(0)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [pendingPackageChange, setPendingPackageChange] = useState<{ packageId: string; absorbedServiceIds: string[]; clearedConflictServiceIds: string[] } | null>(null)
  const [promotions, setPromotions] = useState<LuxorPromotion[]>([])
  const [promotionsStatus, setPromotionsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [promotionCreatorOpen, setPromotionCreatorOpen] = useState(false)
  const [promotionDraft, setPromotionDraft] = useState<PromotionTermsDraft & { name: string; discount_type: LuxorPromotion['discount_type']; value: string }>({ name: '', discount_type: 'percent', value: '' })
  const [savingPromotion, setSavingPromotion] = useState(false)
  const [availability, setAvailability] = useState<LuxorAvailabilityMap>({})
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [presentationMode, setPresentationMode] = useState<ProposalPresentationMode>('email')
  const calculationCallbackRef = useRef(onCalculationChange)
  const contextKey = JSON.stringify(proposalContext || {})

  useEffect(() => {
    calculationCallbackRef.current = onCalculationChange
  }, [onCalculationChange])

  useEffect(() => {
    setWeekdayPolicy(null)
    setCustomTimeV4Policy(null)
  }, [invoiceId, supersedesInvoiceId])

  useEffect(() => {
    if (!proposalContext) return
    // The parent supplies a complete draft, including a fresh one on reopen.
    // Merging would retain times and payment terms from the discarded draft.
    setLocalContext(proposalContext)
  }, [contextKey, proposalContext])

  useEffect(() => {
    if (isOpen) return
    setStepIndex(0)
    setFurthestUnlockedStep(0)
    setValidationMessage(null)
    setPendingPackageChange(null)
    setPromotionCreatorOpen(false)
    setPresentationMode('email')
    setWeekdayPolicy(null)
    setCustomTimeV4Policy(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    void loadPromotions()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setBreakdownRecipient(clientEmail || '')
    setBreakdownPreviewOpen(false)
    let active = true
    void fetch('/api/public/phone-number', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ phoneNumber?: string | null }> : null)
      .then((result) => { if (active) setBreakdownPhone(result?.phoneNumber || null) })
      .catch(() => { if (active) setBreakdownPhone(null) })
    return () => { active = false }
  }, [clientEmail, isOpen])

  const effectiveContext = localContext
  const selectedPackage = 'rent_only'
  const effectivePricingSelection = asRecord(effectiveContext.pricing_selection) || {}
  const packageTierId = asString(effectiveContext.package_tier_id)
    || asString(effectivePricingSelection.packageTierId)
    || asString(effectivePricingSelection.package_tier_id)
    || asString(effectivePricingSelection.luxorPackageId)
    || asString(effectivePricingSelection.luxor_package_id)
    || (!invoiceId && !supersedesInvoiceId ? 'essentials' : '')
  const proposalPricingPolicyVersion = asNumber(effectiveContext.proposal_pricing_policy_version, asNumber(effectivePricingSelection.proposal_pricing_policy_version, (!invoiceId && !supersedesInvoiceId ? 4 : 3))) || 3
  const eventDateValue = normalizeEventDateValue(effectiveContext.event_date) || normalizeEventDateValue(eventDate)
  const editableEventType = Object.prototype.hasOwnProperty.call(effectiveContext, 'event_type') && typeof effectiveContext.event_type === 'string'
    ? effectiveContext.event_type
    : eventType || ''
  const refreshAvailability = useCallback(async () => {
    setAvailabilityStatus('loading')
    setAvailability({})
    setAvailabilityError(null)
    try {
      const response = await fetch('/api/portal/event-availability', { credentials: 'same-origin', cache: 'no-store' })
      const payload = await response.json() as { availability?: LuxorAvailabilityMap; error?: string }
      if (!response.ok || !payload.availability) throw new Error(payload.error || 'Event availability could not be loaded.')
      setAvailability(payload.availability)
      setAvailabilityStatus('ready')
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : 'Event availability could not be loaded.')
      setAvailabilityStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setAvailabilityStatus('idle')
      return
    }
    void refreshAvailability()
  }, [isOpen, refreshAvailability])

  useEffect(() => {
    if (!isOpen) return
    const supabase = getPortalSupabaseClient()
    if (!supabase) return
    let refreshTimer: number | null = null
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void refreshAvailability()
      }, 250)
    }
    const channel = supabase
      .channel(`proposal-availability-${invoiceId || 'new'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_bookings' }, refreshSoon)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`Proposal availability channel entered ${status}.`)
      })
    const refreshOnFocus = () => void refreshAvailability()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      window.removeEventListener('focus', refreshOnFocus)
      void supabase.removeChannel(channel)
    }
  }, [invoiceId, isOpen, refreshAvailability])
  const guestCount = asNumber(effectiveContext.expected_guest_count, eventGuestCount) || 0
  const initialInvoiceGuestCountRef = useRef<{ invoiceId?: string | null; value: number }>({
    invoiceId,
    value: asNumber(proposalContext?.expected_guest_count, eventGuestCount) || 0,
  })
  if (initialInvoiceGuestCountRef.current.invoiceId !== invoiceId) {
    initialInvoiceGuestCountRef.current = {
      invoiceId,
      value: asNumber(proposalContext?.expected_guest_count, eventGuestCount) || 0,
    }
  }
  const isPreservedSavedGuestCount = Boolean(
    invoiceId
      && guestCount > LUXOR_MAX_GUESTS
      && guestCount === initialInvoiceGuestCountRef.current.value,
  )
  const customTimeV4Enabled = Boolean(customTimeV4Policy)
  const customWeekdayEnabled = Boolean((weekdayPolicy && isWeekdayCustomRentalDate(eventDateValue)) || customTimeV4Enabled)
  const rentalPeriod = effectiveContext.rental_period || 'evening'
  const isCustomRental = rentalPeriod === 'custom'
  const savedGuestArrivalTime = effectiveContext.guest_arrival_time ?? effectiveContext.guestArrivalTime
  const savedEventEndTime = effectiveContext.event_end_time ?? effectiveContext.eventEndTime
  const fixedRentalFallback = isCustomRental ? null : resolveFixedProposalRentalRange(
    rentalPeriod,
    asString(effectiveContext.rental_start_time ?? effectiveContext.start_time) || null,
    asString(effectiveContext.rental_end_time ?? effectiveContext.end_time) || null,
    typeof savedGuestArrivalTime === 'string' ? savedGuestArrivalTime : null,
    typeof savedEventEndTime === 'string' ? savedEventEndTime : null,
  )
  // Switching into hourly pricing requires deliberate start/end selections;
  // a historic fixed-period default is not a custom rental instruction.
  const customTimesSelected = effectiveContext.rental_period === 'custom'
  const rentalStartTime = isCustomRental
    ? customTimesSelected ? asString(effectiveContext.rental_start_time ?? effectiveContext.start_time ?? effectiveContext.guest_arrival_time ?? effectiveContext.guestArrivalTime) || '' : ''
    : asString(effectiveContext.rental_start_time ?? effectiveContext.start_time) || fixedRentalFallback?.startTime || RENTAL_WINDOWS[rentalPeriod].start
  const rentalEndTime = isCustomRental
    ? customTimesSelected ? asString(effectiveContext.rental_end_time ?? effectiveContext.end_time ?? effectiveContext.event_end_time ?? effectiveContext.eventEndTime) || '' : ''
    : asString(effectiveContext.rental_end_time ?? effectiveContext.end_time) || fixedRentalFallback?.endTime || RENTAL_WINDOWS[rentalPeriod].end
  const guestArrivalTime = isCustomRental
    ? customTimesSelected ? asString(effectiveContext.guest_arrival_time ?? effectiveContext.guestArrivalTime) || '' : ''
    : typeof savedGuestArrivalTime === 'string' ? savedGuestArrivalTime : RENTAL_WINDOWS[rentalPeriod].start
  const eventEndTime = isCustomRental
    ? customTimesSelected ? asString(effectiveContext.event_end_time ?? effectiveContext.eventEndTime) || '' : ''
    : typeof savedEventEndTime === 'string' ? savedEventEndTime : RENTAL_WINDOWS[rentalPeriod].end
  const rentalAccess = asRecord(calculation?.rental_access)
  const eventSecurityTiming = useMemo(
    () => proposalSecurityDuration(eventDateValue, guestArrivalTime, eventEndTime),
    [eventDateValue, guestArrivalTime, eventEndTime],
  )
  const timeValidation = useMemo(
    () => {
      const rentalTiming = isCustomRental
        ? customTimeV4Enabled && customTimeV4Policy
          ? validateLuxorCustomTimeScheduleV4(eventDateValue, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, customTimeV4Policy)
          : validateWeekdayCustomRentalSchedule(eventDateValue, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, weekdayPolicy)
        : validateFixedProposalRentalSchedule(rentalPeriod, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime)
      if (!rentalTiming.valid) return rentalTiming
      return eventSecurityTiming.valid ? rentalTiming : { valid: false, error: eventSecurityTiming.error }
    },
    [eventDateValue, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, isCustomRental, rentalPeriod, weekdayPolicy, customTimeV4Enabled, customTimeV4Policy, eventSecurityTiming]
  )
  const currentRentalRange = luxorScheduleMinutes(rentalStartTime, rentalEndTime)
  const venueAccessDurationMinutes = currentRentalRange ? currentRentalRange.end - currentRentalRange.start : null
  const venueAccessRangeLabel = currentRentalRange
    ? formatTimeRange(rentalStartTime, rentalEndTime, currentRentalRange.start >= 24 * 60, currentRentalRange.end >= 24 * 60)
    : 'Set both times'
  const eventDurationMinutes = eventSecurityTiming.valid ? eventSecurityTiming.durationMinutes : null
  const eventRangeLabel = eventSecurityTiming.valid
    ? formatTimeRange(
      guestArrivalTime,
      eventEndTime,
      eventSecurityTiming.arrivalLocal.slice(0, 10) !== eventDateValue,
      eventSecurityTiming.eventEndLocal.slice(0, 10) !== eventDateValue,
    )
    : 'Set valid arrival and end times'
  const hasLegacyOffHourTime = [rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime]
    .some((value) => Boolean(value) && !isWholeHourTime(value))
  const customAvailabilityPolicy = customTimeV4Policy || weekdayPolicy
  const availabilityOptions = isCustomRental
    ? { blockWholeDate: customAvailabilityPolicy?.booking_policy === 'one_per_date', cleanupBufferMinutes: customAvailabilityPolicy?.cleanup_buffer_minutes || 0 }
    : { blockWholeDate: false, cleanupBufferMinutes: 0 }
  const customAvailabilityOptions = {
    blockWholeDate: customAvailabilityPolicy?.booking_policy === 'one_per_date',
    cleanupBufferMinutes: customAvailabilityPolicy?.cleanup_buffer_minutes || 0,
  }
  const firstCustomRange = eventDateValue && availabilityStatus === 'ready' && customAvailabilityPolicy
    ? findInitialCustomRentalRange(availability, eventDateValue, customAvailabilityPolicy.minimum_hours, customTimeV4Enabled ? 60 : weekdayPolicy?.time_increment_minutes || 60, {
      ...customAvailabilityOptions,
      resetWindowBlocked: customAvailabilityPolicy.reset_window_policy === 'blocked',
    })
    : null
  const getPeriodAvailability = (period: string, start = rentalStartTime, end = rentalEndTime) => {
    if (!eventDateValue || availabilityStatus !== 'ready') return false
    if (period === 'custom') {
      if (!customWeekdayEnabled) return false
      const range = start && end ? { startTime: start, endTime: end } : firstCustomRange
      return Boolean(range && isLuxorAvailabilityRangeOpen(availability, eventDateValue, range.startTime, range.endTime, customAvailabilityOptions))
    }
    const bounds = getRentalPeriodBounds(period, rentalAccess)
    return isLuxorAvailabilityRangeOpen(availability, eventDateValue, bounds.startTime, bounds.endTime)
  }
  const currentRentalPeriodAvailable = Boolean(
    eventDateValue
      && availabilityStatus === 'ready'
      && isLuxorAvailabilityRangeOpen(availability, eventDateValue, rentalStartTime, rentalEndTime, availabilityOptions),
  )

  const handleRentalPeriodChange = (newPeriod: string) => {
    if (newPeriod === 'custom') {
      if (!customWeekdayEnabled) return
      if (!firstCustomRange) {
        setValidationMessage('No open custom rental window meets the saved minimum duration and availability rules for this date.')
        return
      }
      updateProposalContext({
        rental_period: 'custom', rental_start_time: firstCustomRange.startTime, rental_end_time: firstCustomRange.endTime,
        start_time: firstCustomRange.startTime, end_time: firstCustomRange.endTime, weekday_custom_rental: undefined,
        guest_arrival_time: firstCustomRange.startTime, guestArrivalTime: firstCustomRange.startTime,
        event_end_time: firstCustomRange.endTime, eventEndTime: firstCustomRange.endTime,
      })
      setValidationMessage(null)
      return
    }
    if (!getPeriodAvailability(newPeriod)) {
      setValidationMessage('That rental period is already occupied or availability is still loading. Choose an open period.')
      return
    }
    const period = newPeriod as keyof typeof RENTAL_WINDOWS
    const window = getRentalPeriodBounds(period, rentalAccess)
    updateProposalContext({
      rental_period: period,
      rental_start_time: window.startTime,
      rental_end_time: window.endTime,
      start_time: window.startTime,
      end_time: window.endTime,
      weekday_custom_rental: undefined,
      guest_arrival_time: window.startTime,
      guestArrivalTime: window.startTime,
      event_end_time: window.endTime,
      eventEndTime: window.endTime,
    })
    setValidationMessage(null)
  }

  const validateNextTiming = (nextRentalStart: string, nextRentalEnd: string, nextArrival: string, nextEnd: string) => {
    const check = isCustomRental
      ? customTimeV4Enabled && customTimeV4Policy
        ? validateLuxorCustomTimeScheduleV4(eventDateValue, nextRentalStart, nextRentalEnd, nextArrival, nextEnd, customTimeV4Policy)
        : validateWeekdayCustomRentalSchedule(eventDateValue, nextRentalStart, nextRentalEnd, nextArrival, nextEnd, weekdayPolicy)
      : validateFixedProposalRentalSchedule(rentalPeriod, nextRentalStart, nextRentalEnd, nextArrival, nextEnd)
    if (!check.valid) return check
    const security = proposalSecurityDuration(eventDateValue, nextArrival, nextEnd)
    return security.valid ? check : { valid: false, error: security.error }
  }

  type TimeEndpoint = 'start' | 'end'
  const accessStepError = (endpoint: TimeEndpoint, direction: -1 | 1) => {
    if (!eventDateValue) return 'Choose an event date before adjusting venue access.'
    if (availabilityStatus !== 'ready') return 'Confirm current booking availability before adjusting venue access.'
    const value = endpoint === 'start' ? rentalStartTime : rentalEndTime
    const candidate = shiftClockByHour(value, direction)
    if (!candidate) return 'This saved time includes minutes. Choose a rental period to apply its approved on-hour defaults before adjusting it.'
    const start = endpoint === 'start' ? candidate : rentalStartTime
    const end = endpoint === 'end' ? candidate : rentalEndTime
    if (!luxorScheduleMinutes(start, end)) return 'Venue access must stay within Luxor hours, from 6:00 AM to 1:00 AM the following day.'
    const timing = validateNextTiming(start, end, guestArrivalTime, eventEndTime)
    if (!timing.valid) return timing.error || 'This change conflicts with the selected rental rules or guest times.'
    if (!isLuxorAvailabilityRangeOpen(availability, eventDateValue, start, end, availabilityOptions)) {
      return 'This venue access change overlaps a confirmed booking or hold.'
    }
    return null
  }

  const guestStepError = (endpoint: TimeEndpoint, direction: -1 | 1) => {
    if (!eventDateValue) return 'Choose an event date before adjusting guest times.'
    const value = endpoint === 'start' ? guestArrivalTime : eventEndTime
    const candidate = shiftClockByHour(value, direction)
    if (!candidate) return 'This saved time includes minutes and is preserved. Hourly controls require an on-hour time.'
    const arrival = endpoint === 'start' ? candidate : guestArrivalTime
    const end = endpoint === 'end' ? candidate : eventEndTime
    const timing = validateNextTiming(rentalStartTime, rentalEndTime, arrival, end)
    return timing.valid ? null : timing.error || 'This change conflicts with the venue access or event timing rules.'
  }

  const canAdjustAccess = (endpoint: TimeEndpoint, direction: -1 | 1) => accessStepError(endpoint, direction) === null
  const canAdjustGuests = (endpoint: TimeEndpoint, direction: -1 | 1) => guestStepError(endpoint, direction) === null

  const handleAccessTimeStep = (endpoint: TimeEndpoint, direction: -1 | 1) => {
    const error = accessStepError(endpoint, direction)
    if (error) {
      setValidationMessage(error)
      return
    }
    const value = endpoint === 'start' ? rentalStartTime : rentalEndTime
    const candidate = shiftClockByHour(value, direction)
    if (!candidate) return
    const start = endpoint === 'start' ? candidate : rentalStartTime
    const end = endpoint === 'end' ? candidate : rentalEndTime
    const nextSelection = { ...(effectiveContext.pricing_selection || {}) }
    if (isCustomRental) {
      delete nextSelection.securityHours
      delete nextSelection.security_hours
    }
    updateProposalContext({
      rental_period: rentalPeriod,
      rental_start_time: start,
      rental_end_time: end,
      start_time: start,
      end_time: end,
      ...(isCustomRental ? { weekday_custom_rental: undefined, pricing_selection: nextSelection } : {}),
    })
    setValidationMessage(null)
  }

  const handleGuestTimeStep = (endpoint: TimeEndpoint, direction: -1 | 1) => {
    const error = guestStepError(endpoint, direction)
    if (error) {
      setValidationMessage(error)
      return
    }
    const value = endpoint === 'start' ? guestArrivalTime : eventEndTime
    const candidate = shiftClockByHour(value, direction)
    if (!candidate) return
    updateProposalContext(endpoint === 'start'
      ? { guest_arrival_time: candidate, guestArrivalTime: candidate }
      : { event_end_time: candidate, eventEndTime: candidate })
    setValidationMessage(null)
  }
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
  const selectedDecorPackageId = asString(pricingSelection && 'decor_package_id' in pricingSelection ? pricingSelection.decor_package_id : pricingSelection?.decorPackageId ?? effectiveContext.decor_package_id) || ''
  const decorAddOnQuantities = useMemo(() => {
    const saved = asRecord(pricingSelection?.decor_add_on_quantities ?? pricingSelection?.decorAddOnQuantities ?? effectiveContext.decor_add_on_quantities) || {}
    return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  }, [pricingSelection, effectiveContext.decor_add_on_quantities])
  const decorServices: ProposalServiceOption[] = proposalPricingPolicyVersion >= 4
    ? (calculation?.addOnQuotes || []).filter((quote) => quote.officialDecorCategory).map((quote) => ({
      id: String(quote.id),
      name: quote.label || String(quote.id),
      category: quote.officialDecorCategory === 'signature_package_add_ons' ? 'SIGNATURE PACKAGE ADD-ONS' : quote.officialDecorCategory === 'luxor_package_add_ons' ? 'LUXOR PACKAGE ADD-ONS' : 'PREMIUM ADD-ONS',
      detail: quote.description,
      officialDecorCategory: 'decor_add_ons',
      pricingUnit: quote.pricingUnit as ProposalServiceOption['pricingUnit'],
      minimumQuantity: quote.minimumQuantity,
      unit: quote.unit,
      includedQuantity: quote.includedQuantity,
    }))
    : OFFICIAL_DECOR_SERVICES.filter((service) => service.category === 'decor_add_ons').map((service) => ({
      id: service.id,
      name: service.name,
      category: 'Decor Add-ons',
      detail: `${service.description} Official Luxor charge.`,
      officialDecorCategory: service.category,
      inclusions: service.inclusions,
      minimumQuantity: service.minimumQuantity,
      unit: service.unit,
      includedQuantity: getOfficialDecorService(selectedDecorPackageId)?.includedAddOnQuantities?.[service.id] || 0,
    }))
  const catalogServices = [...availableServices.filter((service) => service.required || service.locked), ...decorServices, ...availableServices.filter((service) => !service.required && !service.locked)]
  const allSelectedServiceIds = [...selectedServiceIds, ...(selectedDecorPackageId ? [selectedDecorPackageId] : []), ...Object.keys(decorAddOnQuantities).filter((id) => decorAddOnQuantities[id] > 0)]
  const selectedPromotionId = promotionId
    || asString(pricingSelection?.promotionId)
    || asString(pricingSelection?.promotion_id)
    || asString(effectiveContext.promotionId)
    || asString(effectiveContext.promotion_id)
    || null
  const selectedPromotion = promotions.find((promotion) => promotion.id === selectedPromotionId) || null
  const sameDayCatalog = promotions.find(promotion => promotion.discount_type === 'tax_coverage' && promotion.code === SAME_DAY_BOOKING_CODE)
  const taxCoveragePromotionId = asString(pricingSelection?.taxCoveragePromotionId ?? pricingSelection?.tax_coverage_promotion_id) || null
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
    if (testRunId) {
      setPromotionError('Test proposals can use a saved promotion, but cannot create or change shared Luxor promotions.')
      return
    }
    const name = promotionDraft.name.trim()
    const value = Number(promotionDraft.value)
    if (!name || !Number.isFinite(value) || value <= 0 || (promotionDraft.discount_type === 'percent' && value > 100)) return
    if (promotionDraft.expirationMode === 'date' && !promotionDraft.expires_on) { setPromotionError('Choose an expiration date.'); return }
    setSavingPromotion(true)
    setPromotionError(null)
    try {
      const response = await fetch('/api/portal/promotions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, discount_type: promotionDraft.discount_type, value, expires_on: promotionDraft.expires_on || null, complimentary_item: promotionDraft.complimentary_item, complimentary_item_id: promotionDraft.complimentary_item_id, complimentary_scope: promotionDraft.complimentary_scope || 'vendor' }),
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
    setValidationMessage(null)
    onEventDateChange?.(value)
    void refreshAvailability()
  }

  const setGuestCount = (value: string) => {
    const parsed = Number(value)
    updateProposalContext({ expected_guest_count: parsed })
    onEventGuestCountChange?.(value)
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

  const selectPackageTier = (nextPackageTierId: LuxorProposalPackageOption['id']) => {
    const option = packageTierOptions.find((candidate) => candidate.id === nextPackageTierId) || DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS.options[nextPackageTierId]
    const nextPricingSelection = {
      ...pricingSelectionWithoutLegacySecurityHours(effectivePricingSelection),
      packageTierId: nextPackageTierId,
      package_tier_id: nextPackageTierId,
      // The new tiered packages replace the legacy Classic/Signature/Luxor
      // decor-package selector. Preserve separately selected individual items.
      decorPackageId: null,
      decor_package_id: null,
      decorAddOnQuantities,
      decor_add_on_quantities: decorAddOnQuantities,
    }
    updateProposalContext({
      package_name: option.name,
      package_tier_id: nextPackageTierId,
      package_tier_name: option.name,
      decor_package_id: null,
      decor_add_on_quantities: decorAddOnQuantities,
      pricing_selection: nextPricingSelection,
    })
    setPendingPackageChange(null)
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
    const configuredDecor = decorServices.find((item) => item.id === serviceId)
    if (configuredDecor) {
      const nextQuantities = { ...decorAddOnQuantities }
      if (nextQuantities[serviceId]) delete nextQuantities[serviceId]
      else nextQuantities[serviceId] = (configuredDecor.includedQuantity || 0) + (configuredDecor.minimumQuantity || 1)
      updateProposalContext({ pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        proposal_pricing_policy_version: proposalPricingPolicyVersion,
        decor_add_on_quantities: nextQuantities,
        decorAddOnQuantities: nextQuantities,
      } })
      return
    }
    const decor = getOfficialDecorService(serviceId)
    if (decor) {
      const nextQuantities = { ...decorAddOnQuantities }
      if (decor.category === 'decor_add_ons') {
        if (nextQuantities[serviceId]) delete nextQuantities[serviceId]
        else nextQuantities[serviceId] = decor.minimumQuantity
      }
      updateProposalContext({ pricing_selection: {
        ...(effectiveContext.pricing_selection || {}),
        decor_package_id: decor.category === 'decor_packages' ? (selectedDecorPackageId === serviceId ? null : serviceId) : selectedDecorPackageId || null,
        decorPackageId: decor.category === 'decor_packages' ? (selectedDecorPackageId === serviceId ? null : serviceId) : selectedDecorPackageId || null,
        decor_add_on_quantities: nextQuantities,
        decorAddOnQuantities: nextQuantities,
      } })
      return
    }
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
    ...(!testRunId ? { invoiceId, supersedesInvoiceId } : {}),
    ...(testRunId ? { testRunId } : {}),
    selection: {
      packageId: 'rental_only',
      packageTierId: packageTierId || null,
      eventDate: eventDateValue || null,
      guestCount: guestCount || null,
      eventType: editableEventType || null,
      rentalPeriod,
      rentalStartTime: rentalStartTime || null,
      rental_start_time: rentalStartTime || null,
      rentalEndTime: rentalEndTime || null,
      rental_end_time: rentalEndTime || null,
      guestArrivalTime: guestArrivalTime || null,
      guest_arrival_time: guestArrivalTime || null,
      eventEndTime: eventEndTime || null,
      event_end_time: eventEndTime || null,
      addOns: selectedServiceIds,
      decorPackageId: packageTierId ? null : selectedDecorPackageId || null,
      decorAddOnQuantities,
      removedServiceIds,
      customItems: customItemSelection(customItems),
      promotionId: selectedPromotionId,
      taxCoveragePromotionId,
      taxRate: taxRate.trim() === '' ? null : Math.max(0, Number(taxRate) || 0),
      paymentPlan: effectiveContext.payment_plan || null,
      proposalPricingPolicyVersion,
      proposal_pricing_policy_version: proposalPricingPolicyVersion,
    },
    event_date: eventDateValue || null,
    expected_guest_count: guestCount || null,
    event_type: editableEventType || null,
    rental_period: rentalPeriod,
    rental_start_time: rentalStartTime || null,
    rental_end_time: rentalEndTime || null,
    guest_arrival_time: guestArrivalTime || null,
    event_end_time: eventEndTime || null,
    package_id: 'luxor_venue_proposal',
    pricing_selection: {
      ...pricingSelectionWithoutLegacySecurityHours(effectiveContext.pricing_selection),
      ...(packageTierId ? { packageTierId, package_tier_id: packageTierId } : {}),
      service_ids: selectedServiceIds,
      decor_package_id: packageTierId ? null : selectedDecorPackageId || null,
      decor_add_on_quantities: decorAddOnQuantities,
      decorPackageId: packageTierId ? null : selectedDecorPackageId || null,
      decorAddOnQuantities,
      proposal_pricing_policy_version: proposalPricingPolicyVersion,
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
  }), [invoiceId, supersedesInvoiceId, testRunId, taxCoveragePromotionId, customItems, decorAddOnQuantities, selectedDecorPackageId, effectiveContext.event_type, effectiveContext.payment_plan, effectiveContext.pricing_selection, eventDateValue, eventEndTime, editableEventType, guestArrivalTime, guestCount, isCustomRental, items, removedServiceIds, rentalEndTime, rentalPeriod, rentalStartTime, selectedPackage, packageTierId, proposalPricingPolicyVersion, selectedPromotionId, selectedServiceIds, taxRate])
  const pricingRequestKey = useMemo(() => JSON.stringify(pricingRequest), [pricingRequest])

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
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Final pricing could not be calculated.')
        const nextCalculation = normalizeCalculation(payload)
        if (!nextCalculation) throw new Error('Pricing response was not recognized.')
        setWeekdayPolicy(nextCalculation.weekday_custom_rental || null)
        setCustomTimeV4Policy(nextCalculation.custom_time_rental_v4_policy || null)
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
  }, [eventDateValue, guestCount, isOpen, pricingEndpoint, pricingRequestKey, pricingClock])

  const calculatedPackages = useMemo(() => calculation?.packages || [], [calculation])
  const packageTierOptions = useMemo(() => calculation?.packageOptions?.length
    ? calculation.packageOptions
    : Object.values(DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS.options), [calculation?.packageOptions])
  const packageCards = useMemo(() => packageTierOptions.map((option) => {
    const calculated = calculatedPackages.find((candidate) => candidate.id === option.id)
    return { ...option, ...(calculated || {}), id: option.id }
  }), [calculatedPackages, packageTierOptions])
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
  const selectedCalculatedPackage = packageTierId
    ? calculatedPackages.find((candidate) => candidate.id === packageTierId)
    : calculatedPackages.find((candidate) => normalizePackageId(candidate.id) === 'rent_only')
      || calculatedPackages.find((candidate) => candidate.id === 'luxor_venue_proposal')
  const selectedTierOption = packageTierOptions.find((option) => option.id === packageTierId)
  const selectedContext = calculation?.context || effectiveContext
  const breakdownPriceReady = Boolean(calculation?.packageOptions && calculation.packages
    && luxorProposalBreakdownHasCompletePrices(calculation.packageOptions, calculation.packages))
  const breakdownPreview = useMemo(() => {
    if (!selectedCalculatedPackage || !selectedTierOption || !calculation?.packages?.length || !calculation.packageOptions?.length
      || !luxorProposalBreakdownHasCompletePrices(calculation.packageOptions, calculation.packages)) return null
    return buildLuxorProposalBreakdownEmail({
      recipientName: clientName,
      eventType: editableEventType || 'Event',
      eventDate: eventDateValue || '',
      guestCount: Number(guestCount) || 0,
      // `event_access` is a legacy guest-arrival/end summary. Venue access is
      // the rental window and must come from the distinct rental endpoints.
      venueAccess: venueAccessRangeLabel,
      guestArrival: guestArrivalTime ? formatCatalogTime(guestArrivalTime) : '',
      eventEnd: eventEndTime ? `${formatCatalogTime(eventEndTime)}${isCustomRental && Number(eventEndTime.slice(0, 2)) < 6 ? ' (next day)' : ''}` : '',
      selectedPackageId: packageTierId as LuxorProposalPackageOption['id'],
      packageOptions: calculation.packageOptions,
      packages: calculation.packages,
      selectedPackage: selectedCalculatedPackage,
      addOnQuotes: (calculation.addOnQuotes || []) as NonNullable<Parameters<typeof buildLuxorProposalBreakdownEmail>[0]['addOnQuotes']>,
      phoneNumber: breakdownPhone,
      bookingUrl: null,
    })
  }, [breakdownPhone, calculation, clientName, editableEventType, eventDateValue, eventEndTime, guestArrivalTime, guestCount, isCustomRental, packageTierId, rentalPeriod, selectedCalculatedPackage, selectedTierOption, venueAccessRangeLabel])
  const customRentalSnapshot = getWeekdayCustomRentalSnapshot(selectedContext.weekday_custom_rental)
  const customTimeV4Snapshot = getLuxorCustomTimeRentalSnapshotV4(selectedContext.weekday_custom_rental)
  const validThrough = asString(selectedContext.valid_through) || proposalValidThrough(asString(selectedContext.proposal_created_on) || luxorCalendarDate(), selectedPromotion)
  useEffect(() => {
    if (!isOpen) return
    if (dueDate !== validThrough) onDueDateChange(validThrough)
    if (offerExpiryTime !== '23:59') onOfferExpiryTimeChange('23:59')
  }, [isOpen, dueDate, validThrough, offerExpiryTime, onDueDateChange, onOfferExpiryTimeChange])
  const selectedPackageNeedsReview = selectedCalculatedPackage?.pricingReviewRequired === true
  const finalEventPrice = selectedPackageNeedsReview ? undefined : selectedCalculatedPackage?.finalEventPrice ?? asNumber(selectedContext.final_event_price)
  const refundableSecurityDeposit = selectedCalculatedPackage?.refundableSecurityDeposit ?? asNumber(selectedContext.refundable_security_deposit)
  const finalLineItems = selectedCalculatedPackage?.lineItems?.length
    ? selectedCalculatedPackage.lineItems
    : calculation?.lineItems?.length
      ? calculation.lineItems
      : []
  // Discounts and tax belong in the one concise financial summary, not in the
  // client-facing checklist of package selections.
  const proposalChecklistItems = finalLineItems.filter((item) => (
    item.pricingRole !== 'discount' && item.pricingRole !== 'tax' && item.pricingRole !== 'tax_coverage' && !item.id?.startsWith('package-inclusions-')
  ))
  const proposalSubtotal = selectedPackageNeedsReview ? undefined : selectedCalculatedPackage?.subtotal ?? asNumber(selectedContext.subtotal)
  const proposalDiscountAmount = selectedPackageNeedsReview ? undefined : selectedCalculatedPackage?.discountAmount ?? asNumber(selectedContext.discount_amount, selectedContext.discountAmount)
  const proposalTaxAmount = selectedPackageNeedsReview ? undefined : selectedCalculatedPackage?.taxAmount ?? asNumber(selectedContext.tax_amount, selectedContext.taxAmount)
  const proposalTaxRate = selectedCalculatedPackage?.taxRate ?? asNumber(selectedContext.tax_rate, selectedContext.taxRate)
  const sameDayBenefit = selectedContext.same_day_booking as LuxorSameDayBookingSnapshot | undefined
  const taxCoverageAmount = sameDayBenefit?.coverage_amount || 0
  useEffect(() => {
    if (!isOpen || !sameDayBenefit || sameDayBenefit.status === 'expired') return
    const check = () => { if (Date.now() >= new Date(sameDayBenefit.expires_at).getTime()) setPricingClock(value => value + 1) }
    const timer = window.setTimeout(check, Math.max(0, Math.min(new Date(sameDayBenefit.expires_at).getTime() - Date.now(), 2_147_483_647)))
    window.addEventListener('focus', check)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', check) }
  }, [isOpen, sameDayBenefit?.expires_at, sameDayBenefit?.status])
  const venueServicesTotal = asNumber(selectedContext.venue_services_total)
  const eventServicesTotal = asNumber(selectedContext.event_services_total)
  const eventAccess = asString(selectedContext.event_access)
  const additionalRentalLine = finalLineItems.find((item) => item.id === 'venue-additional-hours')
  const actualRentalHours = asNumber(selectedContext.rental_hours)
    ?? (customTimeV4Snapshot?.duration_hours || customRentalSnapshot?.duration_hours)
    ?? ((asNumber(rentalAccess?.hours) ?? (rentalPeriod === 'full_day' ? 14 : 6)) + (asNumber(additionalRentalLine?.quantity) || 0))
  const customRentalMinimumHours = asNumber(customTimeV4Snapshot?.minimum_hours ?? customRentalSnapshot?.minimum_hours)
  const customRentalAdditionalRate = asNumber(customTimeV4Snapshot?.additional_hour_rate ?? customRentalSnapshot?.additional_hour_rate)
  const customRentalAdditionalHours = customRentalMinimumHours === undefined ? 0 : Math.max(0, actualRentalHours - customRentalMinimumHours)
  const selectedPackageInclusions = selectedCalculatedPackage?.inclusions
    || (selectedTierOption ? packageInclusionsForDisplay(selectedTierOption, actualRentalHours) : [])
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
  const paymentPlanRequired = pricingRequirements?.paymentPlan === true || publicationErrors.some((error) => error.toLowerCase().includes('payment plan'))
  const isCalculating = pricingStatus === 'loading'
  const hasFinalPrice = pricingStatus === 'ready' && !selectedPackageNeedsReview && typeof finalEventPrice === 'number' && finalEventPrice >= 0
  const canPublish = Boolean(eventDateValue && guestCount > 0 && Number.isInteger(guestCount) && (guestCount <= LUXOR_MAX_GUESTS || isPreservedSavedGuestCount) && availabilityStatus === 'ready' && currentRentalPeriodAvailable && timeValidation.valid && hasFinalPrice && pricingErrors.length === 0 && publicationErrors.length === 0 && !paymentPlanRequired)
  const reviewTogether = !testRunId && presentationMode === 'in_person'
  const publishDisabled = submitting || !clientEmail || !canPublish || hasUnmigratedLegacyDiscount
  const publishTitle = hasUnmigratedLegacyDiscount
    ? 'Save the legacy adjustment as a promotion first.'
    : !canPublish
      ? paymentPlanRequired
        ? 'Set the payment plan in Step 5 before publishing.'
        : publicationErrors[0] || 'Complete the required event details and final pricing before publishing.'
      : !clientEmail
        ? 'Add the client email before starting the signing flow.'
        : undefined

  const advance = () => {
    if (stepIndex === 0) {
      if (!eventDateValue || guestCount < 1 || !Number.isInteger(guestCount) || (guestCount > LUXOR_MAX_GUESTS && !isPreservedSavedGuestCount)) {
        setValidationMessage('Add the event date and an expected guest count from 1 to 180 before continuing.')
        return
      }
      if (!timeValidation.valid) {
        setValidationMessage(timeValidation.error || 'Please correct the event times before continuing.')
        return
      }
      if (availabilityStatus !== 'ready') {
        setValidationMessage('Confirm current booking availability before continuing.')
        void refreshAvailability()
        return
      }
      if (!currentRentalPeriodAvailable) {
        setValidationMessage('That rental period is not available for the selected date. Choose an open period.')
        return
      }
    }
    if (stepIndex === 4) {
      const bookingDate = paymentPlanDraft?.booking_date || new Date().toISOString().slice(0, 10)
      const cadence = paymentPlanDraft?.payment_cadence ?? 'evenly_spaced'
      const schedule = calculateProposalPaymentSchedule({
        finalEventPrice, venueServicesTotal, eventServicesTotal, eventDate: eventDateValue,
        paymentPlan: paymentPlanDraft, bookingDate,
        paymentCount: paymentPlanDraft?.payment_count ?? 4, paymentCadence: cadence,
        bookingPaymentAmount: paymentPlanDraft?.booking_payment_amount ?? asNumber(selectedContext.booking_payment_default),
      })
      if (!hasFinalPrice || !schedule.rows.length || schedule.initialContractPayment === null) {
        setValidationMessage('Wait for final pricing and a valid payment schedule before continuing.')
        return
      }
      // Continuing confirms the schedule on screen, including untouched defaults.
      updatePaymentPlan({
        mode: 'deposit_and_balance', booking_payment_percent: 25,
        final_payment_due_days_before_event: 60, booking_date: bookingDate,
        payment_count: schedule.rows.length, payment_cadence: cadence,
        booking_payment_amount: schedule.initialContractPayment,
        schedule_rows: schedule.rows.map((row) => ({
          installment_order: row.number,
          label: row.label || `Payment ${row.number}`,
          description: row.description,
          amount: row.amount,
          due_at: row.dueDate || '',
          payment_bucket: row.paymentBucket,
        })),
        ...(proposalPricingPolicyVersion >= 4 ? { schedule_anchor_policy: 'first_deposit_paid_at_v1' as const } : {}),
        preferred_payment_method: paymentPlanDraft?.preferred_payment_method ?? 'card',
      })
    }
    if (stepIndex === 3 && !hasFinalPrice) {
      setValidationMessage(selectedPackageNeedsReview
        ? 'The selected package needs owner-approved pricing for this guest count before you can continue.'
        : 'Wait for final pricing to finish before you continue to the payment plan.')
      return
    }
    setValidationMessage(null)
    setStepDirection(1)
    setStepIndex((current) => {
      const next = Math.min(current + 1, STEPS.length - 1)
      setFurthestUnlockedStep((furthest) => Math.max(furthest, next))
      return next
    })
  }

  const retreat = () => {
    setValidationMessage(null)
    setStepDirection(-1)
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const updatePaymentPlan = (patch: Partial<LuxorProposalPaymentPlan>) => {
    const current = paymentPlanDraft || {}
    updateProposalContext({ payment_plan: { ...current, ...patch } })
  }

  const headerStatus = pricingStatus === 'loading'
    ? 'Updating final price'
    : pricingStatus === 'ready' && !pricingErrors.length && paymentPlanRequired
        ? 'Payment plan needed'
        : pricingStatus === 'ready' && !pricingErrors.length
          ? 'Final price verified'
          : 'Pricing needs event details'
  const continueLabel = stepIndex === 0
    ? 'Continue to services & decor'
    : stepIndex === 1
      ? 'Continue to package selection'
    : stepIndex === 2
      ? 'Continue to review'
    : stepIndex === 3
      ? 'Continue to payment plan'
    : stepIndex === 4
      ? 'Continue to agreement'
      : 'Finish'

  return (
    <PortalModal isOpen={isOpen} onClose={() => { if (!submitting) onClose() }} ariaLabel="Final proposal builder" maxWidth="max-w-[1340px]">
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
              <PortalCloseButton onClick={onClose} disabled={submitting} aria-label="Close final proposal builder" />
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
                      disabled={locked || submitting || publicationPending}
                      onClick={() => {
                        if (locked) return
                        setStepDirection(index >= stepIndex ? 1 : -1)
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

        <fieldset disabled={submitting || publicationPending} className="portal-scrollbar min-w-0 min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {validationMessage ? (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3.5 text-sm text-amber-900 dark:text-amber-100">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <p>{validationMessage}</p>
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, x: reducedMotion ? 0 : stepDirection * 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : stepDirection * -12 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
          {stepIndex === 0 ? (
            <section className="mx-auto max-w-6xl space-y-6">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 1 of 6</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Start with the facts that set the price.</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The date, rental period, guest count, promotion, tax treatment, and selected services are the only inputs that shape this proposal. The final price comes from Luxor’s pricing rules.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
                <div className="min-w-0 space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal title</span>
                    <input value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder={`${clientName.split(/\s+/)[0] || 'Client'}'s ${editableEventType || 'Event'}`} className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" />
                  </label>

                  <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <div aria-label="Selected event date" className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3">
                      <CalendarDays size={15} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
                      <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Event date</p><p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{eventDateValue ? formatEventDate(eventDateValue) : 'Choose a date below'}</p></div>
                    </div>
                    <div className="min-w-0 lg:row-span-3">
                      <LuxorAvailabilityCalendar availability={availability} availabilityReady={availabilityStatus === 'ready'} selectedDate={eventDateValue} onSelectDate={setEventDate} />
                      {availabilityStatus === 'loading' ? <p role="status" className="mt-2 text-xs text-[color:var(--portal-muted)]">Refreshing confirmed booking availability…</p> : null}
                      {availabilityError ? <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/8 p-2.5 text-xs text-rose-800 dark:text-rose-200"><span>{availabilityError}</span><button type="button" onClick={() => void refreshAvailability()} className="min-h-8 rounded-md px-2 font-bold underline underline-offset-2">Retry</button></div> : null}
                  {eventDateValue && availabilityStatus === 'ready' && availability[eventDateValue]?.status === 'fully-booked' ? <p role="status" className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/8 p-2.5 text-xs font-semibold text-amber-900 dark:text-amber-100">Fully booked — both AM and PM rental slots are unavailable for this date.</p> : null}
                    </div>
                    <label className="min-w-0 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Expected guest count</span>
                      <span className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12">
                        <Users size={15} className="ml-3 text-[color:var(--portal-muted)]" />
                        <input type="number" min="1" max={LUXOR_MAX_GUESTS} step="1" inputMode="numeric" value={guestCount || ''} onChange={(event) => setGuestCount(event.target.value)} placeholder={`1-${LUXOR_MAX_GUESTS}`} className="portal-input-transparent min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold outline-none" />
                      </span>
                      <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Luxor accommodates up to {LUXOR_MAX_GUESTS} guests.</p>
                    </label>
                    <label className="min-w-0 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event type</span>
                      <input value={editableEventType} onChange={(event) => updateProposalContext({ event_type: event.target.value })} placeholder="Enter an event type" className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" />
                    </label>
                  </div>

                  <section className="min-w-0 space-y-4 border-t border-[color:var(--portal-border)] pt-4" aria-label="Rental period and event timing">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6529] dark:text-[#f1d27a]">Rental period</p>
                      <div className="mt-2 grid min-w-0 grid-cols-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1" role="group" aria-label="Choose rental period">
                        {[
                          { value: 'morning', label: 'AM', title: formatEventAccess('morning', 'morning', rentalAccess) },
                          { value: 'evening', label: 'PM', title: formatEventAccess('evening', 'evening', rentalAccess) },
                          { value: 'full_day', label: 'Full Day', title: formatEventAccess('full_day', 'full_day', rentalAccess) },
                          { value: 'custom', label: 'Custom', title: customWeekdayEnabled ? 'Custom rental period' : 'Custom access is available only when saved rental rules allow it' },
                        ].map((option) => {
                          const active = option.value === rentalPeriod
                          const available = getPeriodAvailability(option.value)
                          const configured = option.value !== 'custom' || customWeekdayEnabled
                          const disabled = availabilityStatus !== 'ready' || !eventDateValue || !configured || (!available && !active)
                          const availabilityLabel = !configured ? 'not enabled by saved rental rules' : available ? 'available' : 'unavailable'
                          return <button key={option.value} type="button" aria-pressed={active} aria-label={`${option.title}, ${availabilityLabel}`} disabled={disabled} onClick={() => handleRentalPeriodChange(option.value)} className={`min-h-10 min-w-0 rounded-lg px-1.5 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/55 disabled:cursor-not-allowed disabled:opacity-45 sm:px-2 ${active ? 'bg-[#b98a3e] text-white shadow-sm' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]'}`}>{option.label}</button>
                        })}
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">AM, PM, and Full Day use their saved rental windows. Custom access is available only when the saved rental rules permit it.</p>
                    </div>

                    <section aria-label="Venue access time" className="min-w-0 space-y-4 rounded-2xl border border-sky-400/35 bg-sky-500/[0.055] p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300"><DoorOpen size={19} aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-black uppercase tracking-[0.1em] text-[color:var(--portal-text)]">Venue Access Time</h4>
                            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">When you can access the venue for setup and breakdown.</p>
                          </div>
                        </div>
                        <div className="min-w-44 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] px-4 py-3 sm:text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-800 dark:text-sky-300">Total venue access</p>
                          <p className="mt-1 text-xl font-semibold text-[color:var(--portal-text)]">{formatDurationMinutes(venueAccessDurationMinutes)}</p>
                          <p className="mt-0.5 text-xs font-medium text-[color:var(--portal-muted)]">{venueAccessRangeLabel}</p>
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        <ProposalHourControl label="Access start time" value={rentalStartTime} onStep={(direction) => handleAccessTimeStep('start', direction)} canStep={(direction) => canAdjustAccess('start', direction)} stepReason={(direction) => accessStepError('start', direction)} />
                        <ProposalHourControl label="Access end time" value={rentalEndTime} onStep={(direction) => handleAccessTimeStep('end', direction)} canStep={(direction) => canAdjustAccess('end', direction)} stepReason={(direction) => accessStepError('end', direction)} />
                      </div>
                      {isCustomRental && weekdayPolicy && timeValidation.valid && 'durationMinutes' in timeValidation ? <p role="status" className="text-xs font-semibold text-[color:var(--portal-text)]">{formatWeekdayCustomRentalDuration(timeValidation.durationMinutes)} venue access — minimum {formatMoney(weekdayPolicy.minimum_price)} covers the first {weekdayPolicy.minimum_hours} billed hours; additional hours are {formatMoney(weekdayPolicy.additional_hour_rate)} each. Current rental price: {formatMoney(asNumber(selectedContext.rental_total) ?? weekdayPolicy.minimum_price)}.</p> : null}
                      {!isCustomRental && timeValidation.valid && 'additionalHours' in timeValidation && timeValidation.additionalHours > 0 ? <p role="status" className="text-xs leading-5 text-[color:var(--portal-muted)]">Additional rental time: {timeValidation.additionalHours} hour(s). {pricingStatus === 'ready' ? formatMoney(asNumber(selectedContext.additional_rental_charge) || 0) + ' added at the saved hourly rate.' : 'Updating the additional-hour charge.'}</p> : null}
                      {!currentRentalPeriodAvailable && eventDateValue && availabilityStatus === 'ready' ? <p role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-2.5 text-xs text-amber-900 dark:text-amber-100">This venue access window overlaps an active booking or is not available under the saved rental rules.</p> : null}
                      <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Adjustments follow Luxor’s 6:00 AM–1:00 AM hours, the selected rental policy, and the booked-events calendar.</p>
                    </section>

                    <section aria-label="Guest arrival and event end" className="min-w-0 space-y-4 rounded-2xl border border-[#caa24c]/25 bg-[color:var(--portal-soft)] p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]"><Users size={19} aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-black uppercase tracking-[0.1em] text-[color:var(--portal-text)]">Guest Arrival &amp; Event End</h4>
                            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Set when guests arrive and when the event ends.</p>
                          </div>
                        </div>
                        <div className="min-w-44 rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/[0.07] px-4 py-3 sm:text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">Event duration</p>
                          <p className="mt-1 text-xl font-semibold text-[color:var(--portal-text)]">{formatDurationMinutes(eventDurationMinutes)}</p>
                          <p className="mt-0.5 text-xs font-medium text-[color:var(--portal-muted)]">{eventRangeLabel}</p>
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        <ProposalHourControl label="Guest arrival time" value={guestArrivalTime} onStep={(direction) => handleGuestTimeStep('start', direction)} canStep={(direction) => canAdjustGuests('start', direction)} stepReason={(direction) => guestStepError('start', direction)} />
                        <ProposalHourControl label="Event end time" value={eventEndTime} onStep={(direction) => handleGuestTimeStep('end', direction)} canStep={(direction) => canAdjustGuests('end', direction)} stepReason={(direction) => guestStepError('end', direction)} />
                      </div>
                      <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Guest times must stay within venue access and occur in chronological order. Security hours use this event duration.</p>
                    </section>

                    {hasLegacyOffHourTime ? <p role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-2.5 text-xs leading-5 text-amber-900 dark:text-amber-100">Saved times that include minutes are preserved as recorded. Their hourly controls stay disabled; choose a rental period to apply its approved on-hour defaults.</p> : null}
                    {!timeValidation.valid ? <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><AlertCircle size={14} className="shrink-0" />{timeValidation.error}</p> : null}
                    {availabilityStatus === 'error' ? <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">Confirm availability before continuing.</p> : null}
                  </section>
                </div>
                <aside className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Prepared for</p>
                    <p className="mt-1 text-base font-bold">{clientName}</p>
                    <p className="mt-0.5 text-sm text-[color:var(--portal-muted)]">{clientEmail || 'Add an email before publishing.'}</p>
                  </div>
                  {!clientEmail ? <div role="status" className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-xs leading-5 text-amber-900 dark:text-amber-100"><Mail size={16} className="mt-0.5 shrink-0" /><div><p className="font-bold">Client email required</p><p className="mt-0.5">Add it in the client summary before the handoff. Luxor needs it to deliver the executed agreement copy after signing.</p></div></div> : null}
                  <div className="border-t border-[color:var(--portal-border)] pt-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal valid through</p>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--portal-text)]">{formatEventDate(validThrough)}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{selectedPromotion?.expires_on ? 'Matches the attached promotion expiration.' : '30 days from proposal creation.'}</p>
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
                      {!testRunId ? <button type="button" onClick={() => { setPromotionDraft({ name: '', discount_type: 'percent', value: '' }); setPromotionCreatorOpen(true) }} className="inline-flex min-h-8 shrink-0 items-center rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#8c6529] transition hover:bg-[#caa24c]/16 dark:text-[#f1d27a]">Create</button> : null}
                    </div>
                    <PortalSelect
                      value={selectedPromotionId || ''}
                      onChange={(value) => setSelectedPromotion(value || null)}
                      options={[
                        { value: '', label: 'No promotion' },
                        ...promotions.filter((promotion) => promotion.discount_type !== 'tax_coverage' && (promotion.active && (!promotion.expires_on || promotion.expires_on >= luxorCalendarDate()) || promotion.id === selectedPromotionId)).map((promotion) => ({
                          value: promotion.id,
                          label: `${promotion.name} · ${promotion.discount_type === 'complimentary' ? 'Complimentary' : (promotion.discount_type === 'fixed' ? formatMoney(promotion.value) : `${promotion.value}%`) + ' off'}`,
                        })),
                      ]}
                      className="mt-2 w-full"
                      buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal"
                    />
                    {promotionsStatus === 'loading' ? <p className="mt-2 text-[10px] text-[color:var(--portal-muted)]"><ProposalCalculationStatus label="Loading saved promotions" /></p> : null}
                    {selectedPromotion ? <p className="mt-2 text-[10px] leading-4 text-emerald-700 dark:text-emerald-300">{selectedPromotion.name} ({selectedPromotion.code}) will be verified and snapped into this final proposal.</p> : null}
                    {sameDayCatalog ? <div className="mt-4 border-t border-[color:var(--portal-border)] pt-4">
                      <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" className="mt-1 accent-[#b98a3e]" checked={Boolean(taxCoveragePromotionId)} disabled={!sameDayCatalog.active && !taxCoveragePromotionId} onChange={event => updateProposalContext({ pricing_selection: { ...effectiveContext.pricing_selection, taxCoveragePromotionId: event.target.checked ? sameDayCatalog.id : null, tax_coverage_promotion_id: event.target.checked ? sameDayCatalog.id : null } })} /><span>{sameDayCatalog.name}{!sameDayCatalog.active ? ' (not active)' : ''}</span></label>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Can accompany the selected discount. {SAME_DAY_BOOKING_TERMS}</p>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{SAME_DAY_CARD_CUTOFF_TERMS}</p>
                      {sameDayBenefit ? <p className="mt-2 text-xs font-semibold">Original date: {luxorCalendarDate(new Date(sameDayBenefit.original_created_at))}. {sameDayBenefit.status === 'expired' ? 'Expired — tax coverage removed; other promotions retained.' : 'Ends at midnight America/Chicago on this date.'}</p> : null}
                    </div> : null}
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
            <section aria-busy={isCalculating} className="mx-auto max-w-4xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 3 of 6</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Choose Your Package</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Compare our packages to find the perfect fit for your event. From a DIY setup to a fully styled experience, choose the level of service that works best for you.</p>
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {packageCards.map((packageOption) => {
                  const active = packageOption.id === packageTierId
                  const showPrice = pricingStatus === 'ready' && typeof packageOption.finalEventPrice === 'number' && !packageOption.pricingReviewRequired
                  const packageFee = typeof packageOption.packageFeeAmount === 'number' ? packageOption.packageFeeAmount : 0
                  const hasOptionalService = selectedServiceIds.some((id) => {
                    const service = availableServices.find((item) => item.id === id)
                    return Boolean(service && !service.required && !service.locked)
                  })
                  const hasCustomizations = hasOptionalService || Object.entries(decorAddOnQuantities).some(([id, quantity]) => quantity > (decorServices.find((item) => item.id === id)?.includedQuantity || 0)) || customItems.some((item) => item.costClassification !== 'preferred_vendor_estimate' && Number(item.quantity) > 0)
                  const packageFeeLabel = packageOption.pricingReviewRequired ? 'Needs review' : packageOption.id === 'customized' ? hasCustomizations ? 'Customizations added' : 'No customizations' : packageFee > 0 ? formatMoney(packageFee) : 'No added fee'
                  const badge = packageOption.id === 'luxor' ? packageOption.most_popular_label || '⭐ MOST POPULAR' : null
                  return (
                    <button
                      key={packageOption.id}
                      type="button"
                      onClick={() => selectPackageTier(packageOption.id as LuxorProposalPackageOption['id'])}
                      aria-pressed={active}
                      className={`relative flex min-h-[270px] flex-col rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${active ? 'border-[#caa24c] bg-[#caa24c]/11 shadow-[0_0_0_1px_rgba(202,162,76,0.12)]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]'}`}
                    >
                      <div className="flex min-h-6 items-start justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">{packageOption.positioning}</span>
                        {badge ? <span className="inline-flex items-center gap-1 rounded-full border border-[#caa24c]/40 bg-[#caa24c]/12 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-[#8c6529] dark:text-[#f1d27a]">{badge}</span> : active ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#caa24c] text-white"><Check size={13} /></span> : null}
                      </div>
                      <h4 className="mt-2 font-serif text-lg font-semibold leading-6">{packageOption.name}</h4>
                      <p className="mt-1 text-[11px] font-bold text-[color:var(--portal-muted)]">{packageOption.summary_title}</p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-[color:var(--portal-muted)]">{packageOption.summary}</p>
                      <div className="mt-auto border-t border-[color:var(--portal-border)] pt-3">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-[color:var(--portal-muted)]">Package fee</span>
                          <span className={`font-mono font-semibold ${packageOption.pricingReviewRequired ? 'text-amber-800 dark:text-amber-200' : ''}`}>{packageFeeLabel}</span>
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Estimated event total</span>
                          {isCalculating ? <ProposalPriceSkeleton /> : showPrice ? <span className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(packageOption.finalEventPrice)}</span> : packageOption.pricingReviewRequired ? <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">Needs review</span> : <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">Complete event details</span>}
                        </div>
                      </div>
                      <span className={`mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.12em] ${active ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-[color:var(--portal-text)]'}`}>{active ? 'Selected package' : 'Select package'}</span>
                    </button>
                  )
                })}
              </div>

              {selectedTierOption ? (
                <>
                <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">What&apos;s Included in Your Package</p><h4 className="mt-1 font-serif text-xl font-semibold">{selectedCalculatedPackage?.name || selectedTierOption.name}</h4></div>
                    {additionalRentalLine ? <p className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/[0.08] px-3 py-2 text-xs font-semibold">{actualRentalHours} rental hours, including {additionalRentalLine.quantity} additional {Number(additionalRentalLine.quantity) === 1 ? 'hour' : 'hours'} at {formatMoney(additionalRentalLine.unitPrice)} / hour ({formatMoney(additionalRentalLine.total)}).</p> : customRentalAdditionalHours > 0 && customRentalAdditionalRate !== undefined ? <p className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/[0.08] px-3 py-2 text-xs font-semibold">{actualRentalHours} rental hours, including {customRentalAdditionalHours} additional {customRentalAdditionalHours === 1 ? 'hour' : 'hours'} at {formatMoney(customRentalAdditionalRate)} / hour ({formatMoney(customRentalAdditionalHours * customRentalAdditionalRate)}).</p> : <p className="text-xs text-[color:var(--portal-muted)]">{actualRentalHours} venue rental hours</p>}
                  </div>
                  <ul className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedPackageInclusions.map((inclusion) => <li key={inclusion} className="flex items-start gap-2 text-xs leading-5"><Check size={14} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" /><span>{inclusion}</span></li>)}
                  </ul>
                </section>

                <section className="grid gap-4 rounded-2xl border border-[#caa24c]/24 bg-[#caa24c]/[0.045] p-4 sm:p-5 lg:grid-cols-[1.35fr_.9fr]">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Selected package</p>
                    <h4 className="mt-1 font-serif text-2xl font-semibold">{selectedCalculatedPackage?.name || selectedTierOption.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">{selectedCalculatedPackage?.description || selectedTierOption.description}</p>
                    <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Itemized Luxor charges</p>
                      {isCalculating ? <div className="space-y-2"><ProposalPriceSkeleton /><ProposalPriceSkeleton /></div> : finalLineItems.filter((item) => item.id !== `package-inclusions-${packageTierId}` && item.pricingRole !== 'discount' && item.pricingRole !== 'tax' && item.pricingRole !== 'tax_coverage' && Number(item.total || 0) !== 0).map((item, index) => <div key={`${item.id || item.description}-${index}`} className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0"><span className="block font-semibold">{item.description}{item.quantity > 1 ? ` x ${item.quantity}` : ''}</span>{item.detail ? <span className="mt-0.5 block text-[10px] leading-4 text-[color:var(--portal-muted)]">{item.detail}</span> : null}</span><span className="shrink-0 font-mono font-semibold">{formatMoney(item.total)}</span></div>)}
                    </div>
                  </div>
                  <aside className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal summary</p>
                    {isCalculating ? <div aria-label="Updating proposal summary" className="mt-3 space-y-3"><div className="flex items-center justify-between gap-3"><span className="h-3 w-28 rounded luxor-skeleton" /><span className="h-3 w-16 rounded luxor-skeleton" /></div><div className="flex items-center justify-between gap-3"><span className="h-3 w-24 rounded luxor-skeleton" /><span className="h-3 w-14 rounded luxor-skeleton" /></div><div className="border-t border-[#caa24c]/20 pt-3"><span className="block h-2.5 w-24 rounded luxor-skeleton" /><span className="mt-2 block h-6 w-28 rounded luxor-skeleton" /></div><div className="flex items-center justify-between gap-3"><span className="h-3 w-36 rounded luxor-skeleton" /><span className="h-3 w-16 rounded luxor-skeleton" /></div></div> : <div className="mt-3 space-y-2.5 text-sm">
                      {typeof proposalSubtotal === 'number' ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Package &amp; services</span><span className="font-mono font-semibold">{formatMoney(proposalSubtotal)}</span></div> : null}
                      {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">{selectedPromotion?.name || 'Promotion'}</span><span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">−{formatMoney(proposalDiscountAmount)}</span></div> : null}
                      {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? <div className="flex items-center justify-between gap-3"><span className="text-[color:var(--portal-muted)]">Sales tax{typeof proposalTaxRate === 'number' ? ` (${formatTaxRate(proposalTaxRate)})` : ''}</span><span className="font-mono font-semibold">{formatMoney(proposalTaxAmount)}</span></div> : null}
                      {taxCoverageAmount > 0 ? <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[color:var(--portal-muted)]">LUXOR pays your sales tax (conditional)</span><span className="font-mono font-semibold">-{formatMoney(taxCoverageAmount)}</span></div> : null}
                      {typeof calculation?.estimatedVendorTotal === 'number' && calculation.estimatedVendorTotal > 0 ? <div className="flex items-center justify-between gap-3 border-t border-[color:var(--portal-border)] pt-2 text-xs"><span className="text-[color:var(--portal-muted)]">Preferred vendor estimates (not collected by Luxor)</span><span className="font-mono font-semibold">{formatMoney(calculation.estimatedVendorTotal)}</span></div> : null}
                      <div className="flex items-end justify-between gap-3 border-t border-[#caa24c]/20 pt-3"><span className="text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Final event price</span><span className="font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{hasFinalPrice ? formatMoney(finalEventPrice) : 'Pricing not ready'}</span></div>
                      <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[color:var(--portal-muted)]">Refundable security deposit</span><span className="font-mono font-bold">{formatMoney(refundableSecurityDeposit ?? 750)}</span></div>
                    </div>}
                    <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">The refundable deposit is collected separately after the Event Agreement is signed. It never changes the event price.</p>
                  </aside>
                </section>
                </>
              ) : <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-5 text-amber-900 dark:text-amber-100">Choose one of the new packages to continue this proposal with the updated pricing structure.</div>}

              {pricingWarnings.length ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/7 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">Review before publishing</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-5 text-amber-900 dark:text-amber-100">
                    {pricingWarnings.map((warning, index) => <li key={`${warning}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{warning}</span></li>)}
                  </ul>
                </div>
              ) : null}

              <section aria-labelledby="proposal-breakdown-email-title" className="rounded-2xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6529] dark:text-[#f1d27a]">Client email</p>
                    <h4 id="proposal-breakdown-email-title" className="mt-1 font-serif text-xl font-semibold">Email Proposal Breakdown</h4>
                    <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Send the four-package comparison and selected package details. Book Now opens the selected package’s secure proposal page. This email does not create a booking or collect payment.</p>
                  </div>
                  {testRunId ? <span className="shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[10px] font-bold text-amber-900 dark:text-amber-100">Unavailable in isolated test mode</span> : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="block min-w-0 space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Recipient email</span>
                    <input type="email" autoComplete="email" value={breakdownRecipient} onChange={(event) => setBreakdownRecipient(event.target.value)} disabled={submitting || Boolean(testRunId)} className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12 disabled:opacity-50" />
                  </label>
                  <button type="button" onClick={() => setBreakdownPreviewOpen((open) => !open)} disabled={!breakdownPreview || submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-text)] transition hover:border-[#caa24c]/40 disabled:cursor-not-allowed disabled:opacity-45"><Eye size={14} />{breakdownPreviewOpen ? 'Hide preview' : 'Preview email'}</button>
                  <button type="button" onClick={() => onSubmit('breakdown', { recipientEmail: breakdownRecipient.trim() })} disabled={submitting || (publicationPending && !breakdownRetryAvailable) || Boolean(testRunId) || Boolean(supersedesInvoiceId) || !breakdownPreview || (!publicationPending && !canPublish) || hasUnmigratedLegacyDiscount || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(breakdownRecipient.trim())} title={testRunId ? 'Breakdown delivery is disabled for isolated test leads.' : supersedesInvoiceId ? 'Use the final proposal action for revisions so the prior offer is replaced through the existing revision flow.' : paymentPlanRequired ? 'Set the payment plan in Step 5, then return here.' : !canPublish ? publicationErrors[0] || 'Complete the required event details and pricing first.' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-white transition hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-45"><Mail size={14} />{submitting ? 'Sending…' : breakdownRetryAvailable ? 'Retry Breakdown' : breakdownPublished ? 'Breakdown sent' : 'Send Breakdown'}</button>
                </div>
                {breakdownPublished ? <p role="status" className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/7 px-3 py-2 text-xs leading-5 text-emerald-900 dark:text-emerald-100">Proposal Breakdown sent and saved. Continue to the final step if you also want to email the individual proposal.</p> : null}
                {supersedesInvoiceId ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/7 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">For revised pricing, publish the updated proposal from the final step so the existing offer stays active until the normal revision flow replaces it.</p> : null}
                {paymentPlanRequired && !pricingErrors.length ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/7 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">Complete the owner-approved payment plan in Step 5, then return here to publish and email the breakdown.</p> : null}
                {breakdownPreviewOpen && breakdownPreview ? <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-white"><iframe title="Proposal Breakdown email preview" srcDoc={breakdownPreview.html} sandbox="" className="h-[680px] w-full border-0 sm:h-[760px]" /></div> : null}
                {!breakdownPriceReady && pricingStatus === 'ready' ? <p className="mt-3 text-xs text-amber-900 dark:text-amber-100">The package comparison is unavailable until every package has a current calculated price.</p> : null}
              </section>

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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 2 of 6</p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Build the services and items for this event.</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Choose a base package, then add decor and services. Preferred-vendor estimates stay separate from Luxor charges.</p>
                </div>
                <button type="button" onClick={() => { setStepIndex(2); setValidationMessage(null) }} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]"><ReceiptText size={13} /> Review packages</button>
              </div>

              <div className="rounded-2xl border border-[#caa24c]/20 bg-[#caa24c]/[0.055] p-4 text-sm leading-6 text-[color:var(--portal-muted)]">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
                  <p>Choose a base package below Setup &amp; Rentals, then add eligible services and decor. Items included in the selected package are not charged again; preferred-vendor estimates remain separate from Luxor charges.</p>
                </div>
              </div>

              <ProposalPackageItemsPanel
                packageName={selectedTierOption?.name || null}
                packageOptions={packageCards.filter((option) => option.id !== 'customized').map((option) => ({ id: option.id, name: option.name, eyebrow: option.positioning, description: option.summary, finalEventPrice: option.finalEventPrice }))}
                showPackageSwitcher={proposalPricingPolicyVersion >= 4}
                selectedPackageId={packageTierId}
                onSelectPackage={(id) => selectPackageTier(id as LuxorProposalPackageOption['id'])}
                lineItems={finalLineItems}
                customItems={customItems}
                optionalServices={optionalServices}
                catalogServices={catalogServices}
                addableServiceIds={catalogServices.filter((service) => !lockedServiceIds.includes(service.id)).map((service) => service.id)}
                lockedServiceIds={lockedServiceIds}
                includedServiceIds={[...packageIncludedServiceIds]}
                unavailableServiceIds={[]}
                selectedServiceIds={allSelectedServiceIds}
                serviceQuantities={decorAddOnQuantities}
                onServiceQuantityChange={(serviceId, quantity) => {
                  const included = decorServices.find((item) => item.id === serviceId)?.includedQuantity || 0
                  const nextQuantities = { ...decorAddOnQuantities }
                  if (quantity <= included) delete nextQuantities[serviceId]
                  else nextQuantities[serviceId] = quantity
                  updateProposalContext({ pricing_selection: {
                    ...(effectiveContext.pricing_selection || {}),
                    proposal_pricing_policy_version: proposalPricingPolicyVersion,
                    decor_package_id: selectedDecorPackageId || null,
                    decor_add_on_quantities: nextQuantities,
                    decorPackageId: selectedDecorPackageId || null,
                    decorAddOnQuantities: nextQuantities,
                  } })
                }}
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
            <section aria-busy={isCalculating} className="mx-auto max-w-6xl space-y-6">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 4 of 6</p>
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

                    <div className="mt-5 grid gap-2 border-y border-[color:var(--portal-border)] py-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ['Venue', 'Luxor at Las Palmas Events'],
                        ['Event date', formatEventDate(eventDateValue)],
                        ['Guests', `${guestCount} expected`],
                        ['Venue access', formatEventAccess(eventAccess, rentalPeriod)],
                        ['Guest arrival', guestArrivalTime ? formatCatalogTime(guestArrivalTime) : 'To be confirmed'],
                        ['Event end', eventEndTime ? formatCatalogTime(eventEndTime) + (isCustomRental && Number(eventEndTime.slice(0, 2)) < 6 ? ' (next day)' : '') : 'To be confirmed'],
                        ...(customTimeV4Snapshot ? [['Rental duration', formatWeekdayCustomRentalDuration(customTimeV4Snapshot.duration_minutes)], ['Venue rental terms', formatLuxorCustomTimeRentalPriceBreakdownV4(customTimeV4Snapshot)], ['Venue rental', formatMoney(customTimeV4Snapshot.rental_total)]] : customRentalSnapshot ? [['Rental duration', formatWeekdayCustomRentalDuration(customRentalSnapshot.duration_minutes)], ['Venue rental terms', formatWeekdayCustomRentalPriceBreakdown(customRentalSnapshot)], ['Venue rental', formatMoney(customRentalSnapshot.rental_total)]] : []),
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
{taxCoverageAmount > 0 ? <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[color:var(--portal-muted)]">LUXOR pays your sales tax (conditional)</span><span className="font-mono font-semibold">-{formatMoney(taxCoverageAmount)}</span></div> : null}
                          <div className="border-t border-[#caa24c]/20 pt-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final total</p><p className="mt-1 font-mono text-2xl font-black text-[#8c6529] dark:text-[#f1d27a]">{hasFinalPrice ? formatMoney(finalEventPrice) : 'Pricing needs review'}</p></div>
                        </div>
                        <div className="mt-4 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3"><p className="text-[9px] font-black uppercase tracking-[0.11em] text-[#8c6529] dark:text-[#f1d27a]">Payment process</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Proposal acceptance → Event Agreement → payment choice after signature. The client can use Card, Zelle, or Cash; the separate refundable security deposit is handled with the first payment.</p></div>
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 5 of 6</p>
              </div>

              {isCalculating ? <ProposalPaymentScheduleSkeleton /> : <ProposalPaymentSchedule
                finalEventPrice={finalEventPrice}
                venueServicesTotal={venueServicesTotal}
                eventServicesTotal={eventServicesTotal}
                refundableSecurityDeposit={refundableSecurityDeposit}
                paymentPlan={paymentPlanDraft}
                finalPaymentDueDate={asString(selectedContext.final_payment_due_date)}
                eventDate={eventDateValue}
                bookingDate={paymentPlanDraft?.booking_date || new Date().toISOString().slice(0, 10)}
                paymentCount={paymentPlanDraft?.payment_count ?? 4}
                paymentCadence={paymentPlanDraft?.payment_cadence ?? 'evenly_spaced'}
                bookingPaymentAmount={paymentPlanDraft?.booking_payment_amount ?? asNumber(selectedContext.booking_payment_default)}
                preferredPaymentMethod={paymentPlanDraft?.preferred_payment_method ?? 'card'}
                editable
                onPaymentPlanChange={(patch) => updatePaymentPlan({ mode: 'deposit_and_balance', booking_payment_percent: 25, final_payment_due_days_before_event: 60, ...patch })}
              />}

              <section aria-labelledby="proposal-presentation-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
                <p id="proposal-presentation-title" className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Finish the proposal</p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">{testRunId ? 'The production proposal will be prepared for the verified test inbox.' : 'Choose how the client will see this final version.'}</p>
                <div role="radiogroup" aria-label="How the client will review this proposal" className={`mt-4 grid gap-3 ${testRunId ? '' : 'sm:grid-cols-2'}`}>
                  <button type="button" role="radio" aria-checked={presentationMode === 'email'} onClick={() => setPresentationMode('email')} className={`rounded-xl border p-4 text-left transition ${presentationMode === 'email' ? 'border-[#caa24c]/65 bg-[#caa24c]/[0.08] shadow-sm' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                    <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--portal-text)]"><Mail size={16} className="text-[#8c6529] dark:text-[#f1d27a]" /> {testRunId ? 'Send test proposal' : 'Send for later'}</span>
                    <span className="mt-2 block text-xs leading-5 text-[color:var(--portal-muted)]">{testRunId ? 'Queue the rendered proposal and PDF only to luxoratlaspalmas@gmail.com.' : 'Email the final proposal so the client can review it on their own time.'}</span>
                  </button>
                  {!testRunId ? <button type="button" role="radio" aria-checked={presentationMode === 'in_person'} onClick={() => setPresentationMode('in_person')} className={`rounded-xl border p-4 text-left transition ${presentationMode === 'in_person' ? 'border-[#caa24c]/65 bg-[#caa24c]/[0.08] shadow-sm' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                    <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--portal-text)]"><Users size={16} className="text-[#8c6529] dark:text-[#f1d27a]" /> Review together</span>
                    <span className="mt-2 block text-xs leading-5 text-[color:var(--portal-muted)]">Open a clean client handoff on the iPad for review, acceptance, signing, and payment choice.</span>
                  </button> : null}
                </div>
                {reviewTogether ? <p className="mt-4 rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/[0.055] px-4 py-3 text-xs leading-5 text-[color:var(--portal-text)]">No proposal email is sent now. After the client accepts, they sign the agreement and can choose Card, Zelle, or Cash. Luxor records Cash or Zelle only after it is actually received.</p> : null}
              </section>

              <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Payment &amp; refund policy</p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--portal-muted)]">
                  <p>Payments toward your Event Total are non-refundable once paid, except as otherwise expressly provided in your Event Agreement.</p>
                  <p>Your $750 Security Deposit is separate from your Event Total and is refundable according to the terms of your Event Agreement.</p>
                </div>
              </section>

              {paymentPlanRequired ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/7 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100"><p className="font-bold">Payment terms are required before publishing.</p><p className="mt-1">The Final Event Price is already calculated. Choose the agreement plan and complete its approved terms above; the exact schedule will update immediately.</p>{publicationErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1 text-xs">{error}</p>)}</div>
              ) : null}

              {pricingErrors.length ? (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm leading-6 text-red-800 dark:text-red-200"><p className="font-bold">This package needs a pricing rule before it can be published.</p>{pricingErrors.map((error, index) => <p key={`${error}-${index}`} className="mt-1">{error}</p>)}</div>
              ) : null}
            </section>
          ) : null}
          {stepIndex === 5 ? (
            <section aria-busy={isCalculating} className="mx-auto max-w-5xl space-y-6">
              <div className="max-w-3xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Step 6 of 6</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">Client Contract Agreement</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">
                  The agreement automatically incorporates all locked proposal facts, contractual event timing, financial terms, and legal clauses. Review before publishing or initiating client signing.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                <div className="border-b border-[#caa24c]/20 bg-[#1a140d] px-5 py-6 text-center text-white sm:px-8">
                  <p className="font-serif text-2xl tracking-[0.2em] text-[#f1d27a]">LUXOR AT LAS PALMAS EVENTS</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.28em] text-white/65">Event Booking Agreement &middot; 803 Castroville Rd #402, San Antonio, TX 78237</p>
                </div>

                <div className="space-y-6 p-5 sm:p-7">
                  {/* Client Information */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6529] dark:text-[#f1d27a]">1. Client Information</h4>
                    <div className="mt-3 grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:grid-cols-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Client / Contract Holder</p>
                        <p className="mt-1 text-sm font-bold">{clientName}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Email</p>
                        <p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{clientEmail || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Venue Name</p>
                        <p className="mt-1 text-sm font-semibold">Luxor at Las Palmas Events</p>
                      </div>
                    </div>
                  </div>

                  {/* Event Information */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6529] dark:text-[#f1d27a]">2. Event Information</h4>
                    <div className="mt-3 grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event Date</p>
                        <p className="mt-1 text-sm font-bold">{formatEventDate(eventDateValue)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Guest Count</p>
                        <p className="mt-1 text-sm font-bold">{guestCount} guests {isPreservedSavedGuestCount ? "(saved proposal)" : "(maximum 180)"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event Type</p>
                        <p className="mt-1 text-sm font-bold">{eventType || effectiveContext.event_type || 'Private celebration'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Guest Arrival Time</p>
                        <p className="mt-1 text-sm font-bold text-[#8c6529] dark:text-[#f1d27a]">{guestArrivalTime ? formatCatalogTime(guestArrivalTime) : 'To be confirmed'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Event End Time</p>
                        <p className="mt-1 text-sm font-bold text-[#8c6529] dark:text-[#f1d27a]">{eventEndTime ? formatCatalogTime(eventEndTime) + (isCustomRental && Number(eventEndTime.slice(0, 2)) < 6 ? ' (next day)' : '') : 'To be confirmed'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Venue Access / Rental Period</p>
                        <p className="mt-1 text-sm font-semibold">{formatEventAccess(eventAccess, rentalPeriod)}</p>
                      </div>
                      {customTimeV4Snapshot ? <div className="sm:col-span-2 lg:col-span-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Custom Time venue rental</p><p className="mt-1 text-sm font-semibold">{formatWeekdayCustomRentalDuration(customTimeV4Snapshot.duration_minutes)} · {formatLuxorCustomTimeRentalPriceBreakdownV4(customTimeV4Snapshot)}</p></div> : customRentalSnapshot ? <div className="sm:col-span-2 lg:col-span-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Custom weekday venue rental</p><p className="mt-1 text-sm font-semibold">{formatWeekdayCustomRentalDuration(customRentalSnapshot.duration_minutes)} · {formatWeekdayCustomRentalPriceBreakdown(customRentalSnapshot)}</p></div> : null}
                    </div>
                  </div>

                  {/* Financial Information */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6529] dark:text-[#f1d27a]">3. Financial Terms &amp; Itemization</h4>
                    <div className="mt-3 divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                      {items.map((item, idx) => (
                        <div key={`contract-item-${item.catalogId || item.description}-${idx}`} className="flex items-center justify-between gap-4 p-3.5 text-sm">
                          <div>
                            <p className="font-semibold">{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</p>
                            {item.detail ? <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">{item.detail}</p> : null}
                          </div>
                          <span className="font-mono font-bold">{formatMoney(item.total)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-4 p-3.5 text-sm font-semibold bg-[color:var(--portal-card)]">
                        <span className="text-[color:var(--portal-muted)]">Subtotal</span>
                        <span className="font-mono">{formatMoney(proposalSubtotal)}</span>
                      </div>
                      {typeof proposalDiscountAmount === 'number' && proposalDiscountAmount > 0 ? (
                        <div className="flex items-center justify-between gap-4 p-3.5 text-sm font-semibold bg-[color:var(--portal-card)] text-emerald-700 dark:text-emerald-300">
                          <span>{selectedPromotion?.name || 'Promotion'}</span>
                          <span className="font-mono">−{formatMoney(proposalDiscountAmount)}</span>
                        </div>
                      ) : null}
                      {typeof proposalTaxAmount === 'number' && proposalTaxAmount > 0 ? (
                        <div className="flex items-center justify-between gap-4 p-3.5 text-sm font-semibold bg-[color:var(--portal-card)]">
                          <span className="text-[color:var(--portal-muted)]">Sales Tax{typeof proposalTaxRate === 'number' ? ` (${formatTaxRate(proposalTaxRate)})` : ''}</span>
                          <span className="font-mono">{formatMoney(proposalTaxAmount)}</span>
                        </div>
                      ) : null}
                      {taxCoverageAmount > 0 ? <div className="flex items-center justify-between gap-4 p-3.5 text-sm"><span>LUXOR pays your sales tax (conditional)</span><span className="font-mono">-{formatMoney(taxCoverageAmount)}</span></div> : null}
                      <div className="flex items-center justify-between gap-4 p-4 text-base font-black bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]">
                        <span>Final Event Price (Total)</span>
                        <span className="font-mono text-xl">{hasFinalPrice ? formatMoney(finalEventPrice) : 'Pricing needs review'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Schedule & Deposit */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Refundable Security Deposit</p>
                      <p className="font-mono text-xl font-bold text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(refundableSecurityDeposit)}</p>
                      <p className="text-xs text-[color:var(--portal-muted)]">Held throughout event period; refunded post-event per contract inspection terms.</p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Initial Booking Payment Due</p>
                      <p className="font-mono text-xl font-bold text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(selectedContext.amount_due_to_book == null ? Math.min(finalEventPrice ?? 0, paymentPlanDraft?.booking_payment_amount ?? asNumber(selectedContext.booking_payment_default) ?? 0) : asNumber(selectedContext.amount_due_to_book) ?? 0)}</p>
                      <p className="text-xs text-[color:var(--portal-muted)]">Due upon electronic signature to secure date reservation.</p>
                    </div>
                  </div>

                  {/* Legal Terms & Policies Accordion */}
                  <details className="group rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-xs font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] hover:bg-[#caa24c]/10">
                      <span>View Incorporated Luxor Venue Policies &amp; Legal Clauses</span>
                      <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-[color:var(--portal-border)] p-4 space-y-4 text-xs leading-5 text-[color:var(--portal-muted)] max-h-96 overflow-y-auto portal-scrollbar">
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Venue Access, Setup &amp; Breakdown</h5>
                        <p className="mt-1">All setup, event time, guest presence, cleanup, and breakdown must fit strictly within the contracted rental period shown above. Remaining past the contracted period incurs overtime at $150.00 per 30-minute increment.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Guest Arrival &amp; Event End Time</h5>
                        <p className="mt-1">Guests are permitted on the Premises only from the contracted Guest Arrival Time until the Event End Time. The client is responsible for timely guest departure.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Private BYOB Alcohol Policy</h5>
                        <p className="mt-1">Luxor at Las Palmas Events is a private BYOB venue. No alcohol may be sold or furnished for compensation. Alcohol must be served exclusively by a qualified TABC-certified bartender.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Occupancy &amp; Event Rules</h5>
                        <p className="mt-1">Maximum occupancy is 200 persons total (including all guests, vendors, and staff). Smoking, vaping, illegal substances, weapons, open flames, glitter, and unapproved confetti are strictly prohibited.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Security Deposit &amp; Deductions</h5>
                        <p className="mt-1">Luxor may document venue condition before, during, and after the event. Deductions may be made for excessive cleaning, damages, missing property, overtime, or policy violations.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Cancellation &amp; Payments</h5>
                        <p className="mt-1">All payments toward the Event Price are non-refundable. Rescheduling requests must be in writing and are subject to venue approval, date availability, and a $250.00 administrative fee.</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-[color:var(--portal-text)]">Liability, Insurance &amp; Force Majeure</h5>
                        <p className="mt-1">The client must provide proof of event liability insurance with at least $1,000,000 per occurrence 14 days prior to the event. Unforeseen force majeure events are governed under the full agreement terms.</p>
                      </div>
                    </div>
                  </details>

                  {/* Delivery Mode Choice */}
                  {testRunId ? <p role="note" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-xs leading-5 text-[color:var(--portal-muted)]">The agreement terms above remain the production terms for review. This test flow does not create or send an agreement, signature request, booking, or payment request.</p> : <section aria-labelledby="agreement-presentation-title" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
                    <p id="agreement-presentation-title" className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Delivery &amp; Signing Method</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Choose how the client will execute the agreement.</p>
                    <div role="radiogroup" aria-label="How the client will sign" className="mt-3 grid gap-3 sm:grid-cols-2">
                      <button type="button" role="radio" aria-checked={presentationMode === 'email'} onClick={() => setPresentationMode('email')} className={`rounded-xl border p-4 text-left transition ${presentationMode === 'email' ? 'border-[#caa24c]/65 bg-[#caa24c]/[0.08] shadow-sm' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                        <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--portal-text)]"><Mail size={16} className="text-[#8c6529] dark:text-[#f1d27a]" /> Send for later</span>
                        <span className="mt-2 block text-xs leading-5 text-[color:var(--portal-muted)]">Email the final proposal &amp; agreement link so the client can review and sign on their own time.</span>
                      </button>
                      <button type="button" role="radio" aria-checked={presentationMode === 'in_person'} onClick={() => setPresentationMode('in_person')} className={`rounded-xl border p-4 text-left transition ${presentationMode === 'in_person' ? 'border-[#caa24c]/65 bg-[#caa24c]/[0.08] shadow-sm' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                        <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--portal-text)]"><Users size={16} className="text-[#8c6529] dark:text-[#f1d27a]" /> Review together</span>
                        <span className="mt-2 block text-xs leading-5 text-[color:var(--portal-muted)]">Open a clean iPad handoff for immediate on-site review, electronic signature, and payment selection.</span>
                      </button>
                    </div>
                  </section>}
                </div>
              </div>
            </section>
          ) : null}

          </motion.div>
          </AnimatePresence>
        </fieldset>
        {stepIndex === 2 && publicationPending ? <div role={submissionError ? 'alert' : 'status'} className="shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-[color:var(--portal-text)] sm:px-6">
          <p>{submissionError || (breakdownPublished ? 'Proposal Breakdown sent and saved. Continue to Step 6 to email the individual proposal if you want that separate message.' : 'This Proposal Breakdown is saved. Retry delivery with the same saved terms.')}</p>
          {breakdownRetryAvailable && !breakdownPublished ? <button type="button" onClick={() => onSubmit('breakdown', { recipientEmail: breakdownRecipient.trim() })} disabled={submitting} className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-white disabled:cursor-not-allowed disabled:opacity-45"><Mail size={13} />{submitting ? 'Retrying…' : 'Retry Breakdown Email'}</button> : null}
        </div> : null}
        {stepIndex === 5 && (submissionError || publishTitle || publicationPending) ? <div role={submissionError ? 'alert' : 'status'} className="shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-3 text-sm text-[color:var(--portal-text)]">
          {submissionError || (!publicationPending && publishTitle)}
          {publicationPending ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{breakdownPublished ? 'Proposal Breakdown was sent and saved. Send the individual proposal here if you want that separate email too.' : 'This proposal has been saved. Retry delivery using these saved terms, or close the builder to review it in Documents.'}</p> : null}
        </div> : null}

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-10">
            {isCalculating ? <div role="status" aria-live="polite" className="space-y-2 py-1"><span className="block h-2.5 w-28 rounded luxor-skeleton" /><span className="block h-5 w-24 rounded luxor-skeleton" /><span className="sr-only">Updating selected final event price.</span></div> : hasFinalPrice ? <><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Selected final event price</p><p className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p></> : <p className="flex min-h-10 items-center text-xs text-[color:var(--portal-muted)]">Complete the event facts to calculate the final price.</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {stepIndex > 0 ? <button type="button" onClick={retreat} disabled={submitting || publicationPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:opacity-40"><ArrowLeft size={14} /> Back</button> : null}
            {stepIndex < STEPS.length - 1 ? <button type="button" onClick={advance} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] !text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] disabled:opacity-40">{continueLabel} <ArrowRight size={14} className="!text-white" /></button> : <>
              <button type="button" onClick={() => onSubmit('save')} disabled={submitting || publicationPending || hasUnmigratedLegacyDiscount} title={hasUnmigratedLegacyDiscount ? 'Save the legacy adjustment as a promotion first.' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-40"><Eye size={14} /> Save draft</button>
              <button type="button" onClick={() => onSubmit(reviewTogether ? 'in_person' : 'email')} disabled={submitting || (!publicationPending && publishDisabled)} title={publishTitle} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-[0.12em] !text-white shadow-lg shadow-[#b98a3e]/15 transition hover:bg-[#a8792f] [&>svg]:!text-white disabled:cursor-not-allowed disabled:bg-[color:var(--portal-soft)] disabled:!text-[color:var(--portal-muted)] disabled:shadow-none disabled:[&>svg]:!text-[color:var(--portal-muted)]">{reviewTogether ? <Users size={14} /> : <Mail size={14} />}{submitting ? reviewTogether ? 'Preparing…' : 'Publishing…' : reviewTogether ? 'Begin client handoff' : 'Publish & email final proposal'}</button>
            </>}
          </div>
        </footer>

        <PortalModal isOpen={Boolean(pendingPackageChange)} onClose={() => setPendingPackageChange(null)} ariaLabel="Confirm package change" maxWidth="max-w-lg">
          <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Estimated event investment</p>
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

        <PortalModal isOpen={promotionCreatorOpen && !testRunId} onClose={() => setPromotionCreatorOpen(false)} ariaLabel="Create saved promotion" maxWidth="max-w-md">
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
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Type</span><PortalSelect value={promotionDraft.discount_type} onChange={(value) => setPromotionDraft((current) => ({ ...current, discount_type: value as LuxorPromotion['discount_type'] }))} options={[{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Dollar amount' }, { value: 'complimentary', label: 'Complimentary' }]} className="w-full" buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal" /></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">{promotionDraft.discount_type === 'complimentary' ? 'Regular value' : 'Value'}</span><span className="flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12"><span className="pl-3 font-mono text-sm text-[color:var(--portal-muted)]">{promotionDraft.discount_type === 'percent' ? '%' : '$'}</span><input type="number" min="0.01" max={promotionDraft.discount_type === 'percent' ? 100 : undefined} step="0.01" inputMode="decimal" value={promotionDraft.value} onChange={(event) => setPromotionDraft((current) => ({ ...current, value: event.target.value }))} className="min-h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none" /></span></label>
              </div>
              <PromotionTermsFields value={promotionDraft} complimentary={promotionDraft.discount_type === 'complimentary'} onChange={patch => setPromotionDraft(current => ({...current, ...patch}))} />
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
