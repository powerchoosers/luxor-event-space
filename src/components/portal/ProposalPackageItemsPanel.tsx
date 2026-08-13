'use client'

import { Check, CircleDollarSign, LockKeyhole, PackageCheck, Plus } from 'lucide-react'
import type { LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'

export type ProposalPackageServiceOption = {
  id: string
  name: string
  category: string
  detail?: string
  exclusiveGroup?: 'decor' | 'catering' | 'photo_booth' | 'bar'
  quantityLabel?: string
}

type ProposalPackageItemsPanelProps = {
  packageName?: string | null
  lineItems: LuxorInvoiceLineItem[]
  optionalServices: ProposalPackageServiceOption[]
  selectedServiceIds: string[]
  pricingReady: boolean
  finalEventPrice?: number | null
  refundableSecurityDeposit?: number | null
  onToggleService: (serviceId: string) => void
}

const formatMoney = (value: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  // Keep every line-item amount contract-ready and visually consistent.
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0))

const lineAmount = (item: LuxorInvoiceLineItem) => {
  const total = Number(item.total)
  return Number.isFinite(total) ? total : Number(item.quantity || 1) * Number(item.unitPrice || 0)
}

function statusFor(item: LuxorInvoiceLineItem) {
  if (item.pricingRole === 'discount' || lineAmount(item) < 0) return { label: 'Adjustment', tone: 'rose' }
  if (item.pricingRole === 'tax') return { label: 'Tax', tone: 'slate' }
  if (item.included || item.pricingRole === 'included') return { label: 'Included', tone: 'emerald' }
  if (item.required || item.pricingRole === 'required') return { label: 'Required', tone: 'blue' }
  return { label: 'Add-on', tone: 'gold' }
}

function statusClass(tone: ReturnType<typeof statusFor>['tone']) {
  if (tone === 'emerald') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (tone === 'blue') return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (tone === 'rose') return 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (tone === 'slate') return 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
  return 'border-[#caa24c]/25 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]'
}

function groupByCategory(items: LuxorInvoiceLineItem[]) {
  const groups = new Map<string, LuxorInvoiceLineItem[]>()
  for (const item of items) {
    const category = item.category || 'Package details'
    const grouped = groups.get(category) || []
    grouped.push(item)
    groups.set(category, grouped)
  }
  return [...groups.entries()]
}

function groupServicesByCategory(services: ProposalPackageServiceOption[]) {
  const groups = new Map<string, ProposalPackageServiceOption[]>()
  for (const service of services) {
    const grouped = groups.get(service.category) || []
    grouped.push(service)
    groups.set(service.category, grouped)
  }
  return [...groups.entries()]
}

export function ProposalPackageItemsPanel({
  packageName,
  lineItems,
  optionalServices,
  selectedServiceIds,
  pricingReady,
  finalEventPrice,
  refundableSecurityDeposit,
  onToggleService,
}: ProposalPackageItemsPanelProps) {
  const selectedServiceIdsSet = new Set(selectedServiceIds)
  const itemGroups = groupByCategory(lineItems)
  const serviceGroups = groupServicesByCategory(optionalServices)

  if (!packageName) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-5 text-sm leading-6 text-amber-900 dark:text-amber-100">
        <p className="font-bold">Choose a package before building its item list.</p>
        <p className="mt-1">The selected package will prefill its included and required services here, so an item is never charged twice.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Your package, prefilled</p>
            <h4 className="mt-1 text-base font-bold">{packageName}</h4>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Included and required items are locked to the selected package. Only genuine optional upgrades can be changed below.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
            <PackageCheck size={14} /> {lineItems.length || 0} calculated items
          </span>
        </div>

        {pricingReady && itemGroups.length ? (
          <div className="divide-y divide-[color:var(--portal-border)]">
            {itemGroups.map(([category, categoryItems]) => {
              const categoryTotal = categoryItems.reduce((sum, item) => sum + lineAmount(item), 0)
              return (
                <section key={category} className="px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">{category}</p>
                    <p className="font-mono text-xs font-bold text-[color:var(--portal-text)]">{formatMoney(categoryTotal)}</p>
                  </div>
                  <div className="mt-3 divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45">
                    {categoryItems.map((item, index) => {
                      const status = statusFor(item)
                      const amount = lineAmount(item)
                      return (
                        <div key={`${item.id || item.catalogId || item.description}-${index}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5 sm:px-4">
                          <LockKeyhole size={14} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{item.description}{Number(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}</p>
                            {item.detail ? <p className="mt-0.5 text-[11px] leading-4 text-[color:var(--portal-muted)]">{item.detail}</p> : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-xs font-bold">{status.label === 'Included' && amount === 0 ? 'Included' : formatMoney(amount)}</p>
                            <span className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${statusClass(status.tone)}`}>{status.label}</span>
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
          <div className="px-5 py-9 text-center text-sm text-[color:var(--portal-muted)]">Complete the event details and wait for the pricing calculation to load this package’s exact item list.</div>
        )}
      </section>

      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-2 border-b border-[color:var(--portal-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c]">Available add-ons</p>
            <h4 className="mt-1 text-base font-bold">Only services not already included in {packageName}</h4>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Their exact price updates from the date and guest count. Package replacements that need an approved rule are intentionally not offered here.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 text-[10px] font-bold text-[color:var(--portal-muted)]"><CircleDollarSign size={13} /> Exact calculation, no manual prices</span>
        </div>

        {serviceGroups.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {serviceGroups.map(([category, services]) => (
              <section key={category} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3">
                <p className="px-1 text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">{category}</p>
                <div className="mt-2 space-y-2">
                  {services.map((service) => {
                    const selected = selectedServiceIdsSet.has(service.id)
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => onToggleService(service.id)}
                        aria-pressed={selected}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${selected ? 'border-[#caa24c]/55 bg-[#caa24c]/10' : 'border-transparent bg-[color:var(--portal-card)] hover:border-[#caa24c]/35'}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>
                          {selected ? <Check size={13} /> : <Plus size={13} />}
                        </span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{service.name}</span>{service.detail ? <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--portal-muted)]">{service.detail}</span> : null}</span>
                        <span className={`shrink-0 text-[9px] font-black uppercase tracking-[0.1em] ${selected ? 'text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}>{selected ? 'Added' : 'Add'}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-5 text-sm leading-6 text-[color:var(--portal-muted)]">Every currently configured service is already included in this package. No optional upgrades are available.</p>
        )}
      </section>

      <section className="grid gap-3 rounded-2xl border border-[#caa24c]/24 bg-[#caa24c]/[0.055] p-4 sm:grid-cols-3 sm:p-5">
        <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final event price</p><p className="mt-1 font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{pricingReady ? formatMoney(finalEventPrice) : 'Calculating…'}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Refundable security deposit</p><p className="mt-1 font-mono text-lg font-black">{formatMoney(refundableSecurityDeposit ?? 750)}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Next</p><p className="mt-1 text-sm font-bold">Review the selected proposal</p><p className="mt-1 text-[11px] leading-4 text-[color:var(--portal-muted)]">The client-facing version stays read-only.</p></div>
      </section>
    </div>
  )
}
