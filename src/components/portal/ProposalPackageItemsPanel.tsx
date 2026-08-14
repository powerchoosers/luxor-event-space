'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  CircleDollarSign,
  FilePenLine,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { PortalCalculationSkeleton, PortalSelect, PortalSkeleton } from '@/components/portal/PortalUI'

export type ProposalPackageServiceOption = {
  id: string
  name: string
  category: string
  detail?: string
  exclusiveGroup?: 'decor' | 'catering' | 'photo_booth' | 'bar'
  serviceLevel?: 'basic' | 'upgrade'
  quantityLabel?: string
  /** A visible package/required row that can be inspected but never changed here. */
  locked?: boolean
  required?: boolean
}

export type ProposalPackageOption = {
  id: string
  name: string
  eyebrow?: string
  description?: string
  finalEventPrice?: number | null
}

type CustomItemDraft = {
  id?: string
  category: string
  description: string
  detail: string
  quantity: string
  unitPrice: string
  paymentBucket: 'venue' | 'event'
}

type ProposalServiceQuote = {
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
}

type ProposalPackageItemsPanelProps = {
  packageName?: string | null
  /** A compact, in-context package switcher for the Services & Items workspace. */
  packageOptions?: ProposalPackageOption[]
  selectedPackageId?: string | null
  onSelectPackage?: (packageId: string) => void
  lineItems: LuxorInvoiceLineItem[]
  /** Owner-created rows are rendered separately so calculator rows cannot be mistaken for manual ones. */
  customItems?: LuxorInvoiceLineItem[]
  optionalServices: ProposalPackageServiceOption[]
  /** The full service library gives the owner context for what the package already covers. */
  catalogServices?: ProposalPackageServiceOption[]
  /** Services eligible to be added to the selected package. Defaults to optionalServices. */
  addableServiceIds?: string[]
  /** Only required services are locked from owner edits. */
  lockedServiceIds?: string[]
  /** Current package components, shown as included but still removable by an owner. */
  includedServiceIds?: string[]
  /** Package replacements or incompatible services that need an approved pricing rule. */
  unavailableServiceIds?: string[]
  selectedServiceIds: string[]
  /** Exact current price for each selectable service, supplied by the pricing calculator. */
  servicePrices?: Record<string, number | null>
  /** Rich quote metadata supports transparent per-guest and minimum-price math. */
  serviceQuotes?: Record<string, ProposalServiceQuote>
  pricingReady: boolean
  finalEventPrice?: number | null
  refundableSecurityDeposit?: number | null
  onToggleService: (serviceId: string) => void
  onAddCustomItem?: (item: LuxorInvoiceLineItem) => void
  onUpdateCustomItem?: (item: LuxorInvoiceLineItem) => void
  onRemoveCustomItem?: (itemId: string) => void
}

const formatMoney = (value: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0))

const lineAmount = (item: LuxorInvoiceLineItem) => {
  const total = Number(item.total)
  return Number.isFinite(total) ? total : Number(item.quantity || 1) * Number(item.unitPrice || 0)
}

function normalized(value?: string | null) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function statusFor(item: LuxorInvoiceLineItem) {
  if (item.pricingRole === 'custom') return { label: 'Custom', tone: 'gold' as const }
  if (item.pricingRole === 'discount' || lineAmount(item) < 0) return { label: 'Adjustment', tone: 'rose' as const }
  if (item.pricingRole === 'tax') return { label: 'Tax', tone: 'slate' as const }
  if (item.included || item.pricingRole === 'included') return { label: 'Included', tone: 'emerald' as const }
  if (item.required || item.pricingRole === 'required') return { label: 'Required', tone: 'blue' as const }
  if (item.pricingRole === 'add_on') return { label: 'Add-on', tone: 'gold' as const }
  return { label: 'Calculated', tone: 'slate' as const }
}

function statusClass(tone: ReturnType<typeof statusFor>['tone']) {
  if (tone === 'emerald') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (tone === 'blue') return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (tone === 'rose') return 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (tone === 'slate') return 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
  return 'border-[#caa24c]/25 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]'
}

function groupByCategory<T extends { category?: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const category = item.category || 'Package details'
    const grouped = groups.get(category) || []
    grouped.push(item)
    groups.set(category, grouped)
  }
  return [...groups.entries()]
}

function serviceMatchesLineItem(service: ProposalPackageServiceOption, item: LuxorInvoiceLineItem) {
  const haystack = normalized(`${item.catalogId || ''} ${item.id || ''} ${item.description || ''}`)
  const directKeys = [normalized(service.id), normalized(service.name)]
  if (directKeys.some((key) => key && (haystack.includes(key) || key.includes(haystack)))) return true

  const nameWords = service.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1)
  return nameWords.length > 0 && nameWords.every((word) => haystack.includes(word))
}

function defaultCustomDraft(item?: LuxorInvoiceLineItem): CustomItemDraft {
  return {
    id: item?.id,
    category: item?.category || 'Custom item',
    description: item?.description || '',
    detail: item?.detail || '',
    quantity: String(Math.max(1, Number(item?.quantity) || 1)),
    unitPrice: item ? String(Math.max(0.01, Number(item.unitPrice) || 0)) : '',
    paymentBucket: item?.paymentBucket === 'venue' ? 'venue' : 'event',
  }
}

function libraryPrice(service: ProposalPackageServiceOption, lineItems: LuxorInvoiceLineItem[], servicePrices?: Record<string, number | null>) {
  const matched = lineItems.find((item) => serviceMatchesLineItem(service, item))
  const matchedAmount = matched ? lineAmount(matched) : null
  // Package-covered rows must show their actual selected line, not the $0
  // incremental add-on quote returned when the same service is already included.
  if (typeof matchedAmount === 'number' && matchedAmount !== 0) return matchedAmount
  const quoted = servicePrices?.[service.id]
  if (typeof quoted === 'number' && Number.isFinite(quoted)) return quoted
  return matchedAmount
}

function quoteMath(quote?: ProposalServiceQuote) {
  const breakdown = quote?.quoteBreakdown
  if (!breakdown) return null
  const quantity = Number(breakdown.quantity)
  const perGuestRate = Number(breakdown.perGuestRate ?? breakdown.per_guest_rate)
  if (!Number.isFinite(perGuestRate) || perGuestRate <= 0) return null
  const minimum = Number(breakdown.minimum)
  if (Number.isFinite(quantity) && quantity > 0) {
    const base = `${quantity} guests × ${formatMoney(perGuestRate)}`
    if (Number.isFinite(minimum) && minimum > 0) return (breakdown.appliedMinimum || breakdown.applied_minimum) ? `${base}; ${formatMoney(minimum)} minimum applied` : `${base}; ${formatMoney(minimum)} minimum`
    return `${base} = ${formatMoney(Number(breakdown.subtotal ?? quote?.total ?? quantity * perGuestRate))}`
  }
  return null
}

export function ProposalPackageItemsPanel({
  packageName,
  packageOptions,
  selectedPackageId,
  onSelectPackage,
  lineItems,
  customItems,
  optionalServices,
  catalogServices,
  addableServiceIds,
  lockedServiceIds,
  unavailableServiceIds,
  selectedServiceIds,
  includedServiceIds,
  servicePrices,
  serviceQuotes,
  pricingReady,
  finalEventPrice,
  refundableSecurityDeposit,
  onToggleService,
  onAddCustomItem,
  onUpdateCustomItem,
  onRemoveCustomItem,
}: ProposalPackageItemsPanelProps) {
  const [search, setSearch] = useState('')
  const [customDraft, setCustomDraft] = useState<CustomItemDraft | null>(null)
  const selectedServiceIdsSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds])
  const addableServiceIdsSet = useMemo(() => new Set(addableServiceIds || optionalServices.map((service) => service.id)), [addableServiceIds, optionalServices])
  const lockedServiceIdsSet = useMemo(() => new Set(lockedServiceIds || []), [lockedServiceIds])
  const includedServiceIdsSet = useMemo(() => new Set(includedServiceIds || []), [includedServiceIds])
  const unavailableServiceIdsSet = useMemo(() => new Set(unavailableServiceIds || []), [unavailableServiceIds])
  const allServices = catalogServices?.length ? catalogServices : optionalServices
  const searchTerm = search.trim().toLowerCase()
  const visibleServiceGroups = useMemo(() => groupByCategory(allServices.filter((service) => (
    !searchTerm || `${service.name} ${service.category} ${service.detail || ''}`.toLowerCase().includes(searchTerm)
  ))), [allServices, searchTerm])
  const displayedPackages = packageOptions?.length
    ? packageOptions
    : packageName
      ? [{ id: selectedPackageId || packageName, name: packageName, finalEventPrice }]
      : []
  const calculatedLineItems = customItems === undefined
    ? lineItems
    : lineItems.filter((item) => item.pricingRole !== 'custom')
  const proposalItems = [...calculatedLineItems, ...(customItems || [])]
  const itemGroups = groupByCategory(proposalItems)
  const customItemIds = useMemo(() => new Set((customItems || []).map((item) => item.id).filter((id): id is string => Boolean(id))), [customItems])

  const beginCustomItem = (item?: LuxorInvoiceLineItem) => {
    setCustomDraft(defaultCustomDraft(item))
  }

  const saveCustomItem = () => {
    if (!customDraft || !customDraft.description.trim()) return
    const quantity = Math.max(1, Math.floor(Number(customDraft.quantity) || 1))
    const unitPrice = Number(customDraft.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
    const lineItem: LuxorInvoiceLineItem = {
      id: customDraft.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: customDraft.category.trim() || 'Custom item',
      description: customDraft.description.trim(),
      ...(customDraft.detail.trim() ? { detail: customDraft.detail.trim() } : {}),
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
      pricingRole: 'custom',
      paymentBucket: customDraft.paymentBucket,
    }
    if (customDraft.id) onUpdateCustomItem?.(lineItem)
    else onAddCustomItem?.(lineItem)
    setCustomDraft(null)
  }

  if (!packageName && !displayedPackages.length) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-5 text-sm leading-6 text-amber-900 dark:text-amber-100">
        <p className="font-bold">Choose a package before building its item list.</p>
        <p className="mt-1">The selected package fills its required and included services first, then only compatible upgrades remain available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="flex flex-col gap-2 border-b border-[color:var(--portal-border)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Package selection</p>
            <h4 className="mt-1 text-base font-bold">Start from the package, then refine the details.</h4>
          </div>
          <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Package changes keep the service list in sync.</p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {displayedPackages.map((pkg) => {
            const selected = normalized(pkg.id) === normalized(selectedPackageId || packageName)
            const packagePrice = pkg.finalEventPrice
            const sharedClassName = `min-h-[126px] rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${selected ? 'border-[#caa24c]/60 bg-[#caa24c]/[0.09] shadow-sm shadow-[#caa24c]/10' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 hover:border-[#caa24c]/35'}`
            const contents = <>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{pkg.eyebrow || 'Package'}</span>
                {selected ? <span className="inline-flex items-center gap-1 rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] text-[#8c6529] dark:text-[#f1d27a]"><Check size={10} /> Selected</span> : null}
              </div>
              <p className="mt-2 text-sm font-bold leading-5 text-[color:var(--portal-text)]">{pkg.name}</p>
              {pricingReady && typeof packagePrice === 'number' ? (
                <p className="mt-2 font-mono text-sm font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(packagePrice)}</p>
              ) : (
                <PortalSkeleton className="mt-2 h-4 w-24 rounded" />
              )}
              {pkg.description ? <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">{pkg.description}</p> : null}
            </>
            return onSelectPackage ? (
              <button key={pkg.id} type="button" onClick={() => onSelectPackage(pkg.id)} aria-pressed={selected} className={sharedClassName}>
                {contents}
              </button>
            ) : <div key={pkg.id} className={sharedClassName}>{contents}</div>
          })}
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,.86fr)_minmax(0,1.14fr)]">
        <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <div className="border-b border-[color:var(--portal-border)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Service library</p>
                <h4 className="mt-1 text-base font-bold">Add services by category.</h4>
              </div>
              <span className="inline-flex items-center gap-1.5 pt-0.5 text-[10px] font-bold text-[color:var(--portal-muted)]"><CircleDollarSign size={13} /> Exact price</span>
            </div>
            <label className="mt-4 flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12">
              <Search size={14} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
              <span className="sr-only">Search services</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--portal-faint)]" />
              {search ? <button type="button" onClick={() => setSearch('')} className="rounded p-1 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]" aria-label="Clear service search"><X size={13} /></button> : null}
            </label>
          </div>

          <div className="space-y-4 p-3 sm:p-4">
            {visibleServiceGroups.length ? visibleServiceGroups.map(([category, services]) => (
              <section key={category} aria-label={category}>
                <p className="px-1 text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">{category}</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40">
                  {services.map((service, index) => {
                    const selected = selectedServiceIdsSet.has(service.id)
                    const required = service.required === true || lockedServiceIdsSet.has(service.id) || service.locked === true
                    const includedInPackage = includedServiceIdsSet.has(service.id)
                    const covered = required || includedInPackage
                    const active = selected || includedInPackage
                    const quote = serviceQuotes?.[service.id]
                    const needsPricingReview = !required && (unavailableServiceIdsSet.has(service.id) || quote?.available === false)
                    const canToggle = !required && !needsPricingReview && (selected || includedInPackage || addableServiceIdsSet.has(service.id))
                    const price = libraryPrice(service, calculatedLineItems, servicePrices)
                    const serviceState = required ? 'Required' : service.serviceLevel === 'upgrade' ? 'Upgrade' : service.serviceLevel === 'basic' ? 'Basic' : selected ? 'Added' : 'Add'
                    const perGuestMath = quoteMath(quote)
                    const displayPrice = covered && price === 0
                      ? 'Included'
                      : price !== null && price > 0
                        ? formatMoney(price)
                        : null
                    return (
                      <div key={service.id} className={`flex gap-3 px-3 py-3 ${index ? 'border-t border-[color:var(--portal-border)]' : ''} ${active ? 'bg-[#caa24c]/[0.055]' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold leading-5">{service.name}</p>
                            {pricingReady && displayPrice ? (
                              <p className="shrink-0 font-mono text-xs font-bold text-[color:var(--portal-text)]">{displayPrice}</p>
                            ) : pricingReady && needsPricingReview ? (
                              <p className="shrink-0 text-right text-[9px] font-black uppercase tracking-[0.09em] text-amber-800 dark:text-amber-200">Pricing review</p>
                            ) : pricingReady && covered ? (
                              <p className="shrink-0 text-right text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Included</p>
                            ) : pricingReady ? (
                              <p className="shrink-0 text-right text-[9px] font-bold text-[color:var(--portal-muted)]">Exact price pending</p>
                            ) : (
                              <PortalSkeleton className="mt-0.5 h-3.5 w-16 shrink-0 rounded" />
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {service.detail ? <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">{service.detail}</p> : null}
                            <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] ${service.required ? 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300' : service.serviceLevel === 'upgrade' ? 'border-[#caa24c]/25 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>{serviceState}</span>
                            {includedInPackage ? <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] text-emerald-700 dark:text-emerald-300">Included in package</span> : null}
                            {needsPricingReview ? <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/8 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] text-amber-800 dark:text-amber-200">Pricing rule needed</span> : null}
                            {perGuestMath ? <span className="basis-full text-[10px] leading-4 text-[color:var(--portal-muted)]">{perGuestMath}</span> : null}
                          </div>
                        </div>
                        {canToggle ? (
                          <button
                            type="button"
                            onClick={() => onToggleService(service.id)}
                            aria-pressed={active}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 self-center rounded-lg border px-2 text-[9px] font-black uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${active ? 'border-[#caa24c]/35 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a] hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[color:var(--portal-text)]'}`}
                          >
                            {active ? <><X size={12} /> Remove</> : <><Plus size={12} /> {service.serviceLevel === 'upgrade' ? 'Add upgrade' : service.serviceLevel === 'basic' ? 'Add basic' : 'Add'}</>}
                          </button>
                        ) : (
                          <span className="inline-flex h-8 shrink-0 items-center self-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">{needsPricingReview ? 'Pricing review' : required ? 'Required' : covered ? 'Included' : serviceState}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )) : (
              <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 py-8 text-center text-sm text-[color:var(--portal-muted)]">No services match “{search}”.</div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Your proposal</p>
                {pricingReady ? (
                  <span className="rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-0.5 text-[9px] font-bold text-[color:var(--portal-muted)]">{proposalItems.length} {proposalItems.length === 1 ? 'item' : 'items'}</span>
                ) : <PortalSkeleton className="h-5 w-16 rounded-full" />}
              </div>
              <h4 className="mt-1 text-base font-bold">{packageName}</h4>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Required rows are protected. Package components, add-ons, and owner items can be adjusted here with exact recalculation.</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.11em] text-[color:var(--portal-muted)]">Final event price</p>
                {pricingReady ? (
                  <p className="mt-1 font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(finalEventPrice)}</p>
                ) : <PortalSkeleton className="mt-2 ml-auto h-6 w-28 rounded" />}
              </div>
              {onAddCustomItem ? <button type="button" onClick={() => beginCustomItem()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#8c6529] transition hover:bg-[#caa24c]/16 dark:text-[#f1d27a]"><Plus size={13} /> Custom item</button> : null}
            </div>
          </div>

          {customDraft ? (
            <div className="border-b border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8c6529] dark:text-[#f1d27a]">Owner-only custom item</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">This editor is owner-only. Use client-ready wording because a charged item appears in the final proposal.</p>
                </div>
                <button type="button" onClick={() => setCustomDraft(null)} className="rounded p-1 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]" aria-label="Cancel custom item"><X size={15} /></button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Item name</span><input value={customDraft.description} onChange={(event) => setCustomDraft((current) => current ? { ...current, description: event.target.value } : current)} placeholder="Example: Ceremony draping" className="min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" /></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Category</span><input value={customDraft.category} onChange={(event) => setCustomDraft((current) => current ? { ...current, category: event.target.value } : current)} placeholder="Custom item" className="min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" /></label>
                <label className="block space-y-1.5 sm:col-span-2"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Client-ready detail</span><input value={customDraft.detail} onChange={(event) => setCustomDraft((current) => current ? { ...current, detail: event.target.value } : current)} placeholder="Optional detail shown with the item" className="min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" /></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Quantity</span><input type="number" min="1" step="1" inputMode="numeric" value={customDraft.quantity} onChange={(event) => setCustomDraft((current) => current ? { ...current, quantity: event.target.value } : current)} className="min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 font-mono text-sm outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/12" /></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Exact unit price</span><span className="flex min-h-10 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/12"><span className="pl-3 font-mono text-sm text-[color:var(--portal-muted)]">$</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={customDraft.unitPrice} onChange={(event) => setCustomDraft((current) => current ? { ...current, unitPrice: event.target.value } : current)} className="min-h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none" /></span></label>
                <label className="block space-y-1.5"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Payment bucket</span><PortalSelect value={customDraft.paymentBucket} onChange={(value) => setCustomDraft((current) => current ? { ...current, paymentBucket: value === 'venue' ? 'venue' : 'event' } : current)} options={[{ value: 'event', label: 'Event Services' }, { value: 'venue', label: 'Venue Services' }]} className="w-full" buttonClassName="min-h-10 px-3 text-sm font-semibold normal-case tracking-normal" /></label>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setCustomDraft(null)} className="inline-flex min-h-9 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)] transition hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]">Cancel</button><button type="button" onClick={saveCustomItem} disabled={!customDraft.description.trim() || !(Number(customDraft.unitPrice) > 0)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#b98a3e] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-45"><FilePenLine size={13} /> {customDraft.id ? 'Update item' : 'Add item'}</button></div>
            </div>
          ) : null}

          {pricingReady && itemGroups.length ? (
            <div className="divide-y divide-[color:var(--portal-border)]">
              {itemGroups.map(([category, categoryItems]) => {
                const categoryTotal = categoryItems.reduce((sum, item) => sum + lineAmount(item), 0)
                const hasPricedCategoryItems = categoryItems.some((item) => lineAmount(item) !== 0)
                return (
                  <section key={category} className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">{category}</p>
                      <p className="font-mono text-xs font-bold text-[color:var(--portal-text)]">{hasPricedCategoryItems ? formatMoney(categoryTotal) : 'Included'}</p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40">
                      {categoryItems.map((item, index) => {
                        const status = statusFor(item)
                        const amount = lineAmount(item)
                        const isCustom = item.pricingRole === 'custom' || Boolean(item.id && customItemIds.has(item.id))
                        const matchingService = !isCustom && item.pricingRole === 'add_on'
                          ? allServices.find((service) => selectedServiceIdsSet.has(service.id) && serviceMatchesLineItem(service, item))
                          : undefined
                        const canRemoveAddOn = Boolean(matchingService)
                        const isZeroIncludedValue = status.label === 'Included' && amount === 0
                        return (
                          <div key={`${item.id || item.catalogId || item.description}-${index}`} className={`flex gap-3 px-3 py-3 sm:px-4 ${index ? 'border-t border-[color:var(--portal-border)]' : ''}`}>
                            <div className="pt-0.5">
                              {isCustom ? <Pencil size={14} className="text-[#a8792f] dark:text-[#f1d27a]" aria-hidden="true" /> : status.label === 'Add-on' ? <PackageCheck size={14} className="text-[#a8792f] dark:text-[#f1d27a]" aria-hidden="true" /> : <LockKeyhole size={14} className="text-[color:var(--portal-muted)]" aria-hidden="true" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                <p className="text-sm font-semibold leading-5">{item.description}{Number(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}</p>
                                <p className="shrink-0 font-mono text-xs font-bold text-[color:var(--portal-text)]">{isZeroIncludedValue ? 'Included' : formatMoney(amount)}</p>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${statusClass(status.tone)}`}>{status.label}</span>
                                <span className="text-[10px] text-[color:var(--portal-muted)]">{isZeroIncludedValue ? 'Package value is part of the selected final price.' : `Qty ${Math.max(1, Number(item.quantity) || 1)} · ${formatMoney(item.unitPrice)} each`}</span>
                              </div>
                              {item.detail ? <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">{item.detail}</p> : null}
                              {isCustom || canRemoveAddOn ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {isCustom && onUpdateCustomItem ? <button type="button" onClick={() => beginCustomItem(item)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-black uppercase tracking-[0.09em] text-[#8c6529] transition hover:bg-[#caa24c]/10 dark:text-[#f1d27a]"><Pencil size={11} /> Edit</button> : null}
                                  {isCustom && item.id && onRemoveCustomItem ? <button type="button" onClick={() => onRemoveCustomItem(item.id as string)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-black uppercase tracking-[0.09em] text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300"><Trash2 size={11} /> Remove</button> : null}
                                  {canRemoveAddOn && matchingService ? <button type="button" onClick={() => onToggleService(matchingService.id)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-black uppercase tracking-[0.09em] text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300"><X size={11} /> Remove add-on</button> : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <PortalCalculationSkeleton label="Calculating the selected package items" rows={4} />
              <p className="mt-3 text-center text-xs leading-5 text-[color:var(--portal-muted)]">Calculating the package’s exact items and final price…</p>
            </div>
          )}

          <div className="grid gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-4 sm:grid-cols-2 sm:p-5">
            <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Price treatment</p><p className="mt-1 text-xs font-semibold">Retail rates, except Gold’s all-inclusive rates.</p></div>
            <div className="sm:text-right"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Refundable security deposit</p><p className="mt-1 font-mono text-sm font-black text-[color:var(--portal-text)]">{formatMoney(refundableSecurityDeposit ?? 750)}</p><p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">Collected separately after the agreement is signed.</p></div>
          </div>
        </section>
      </div>
    </div>
  )
}
