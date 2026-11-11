'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, RefreshCw, Save } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalCheckbox, PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { catalogNumber, catalogValue, setCatalogValue, type PricingCatalog } from '@/lib/luxorPricingCatalog'
import { LuxorDecorCatalogEditor } from '@/components/portal/LuxorDecorCatalogEditor'
import { LUXOR_DECOR_CATALOG_KEY, readLuxorDecorCatalog, type LuxorDecorCatalogItem } from '@/lib/luxorDecorCatalogV2'
import { updateLuxorCustomTimeWeekdayPricingV4 } from '@/lib/luxorCustomTimeRentalV4'
import { getLuxorProposalPackageSettings, LUXOR_PROPOSAL_PACKAGE_IDS } from '@/lib/luxorProposalPackages'

type PricingRecord = {
  id: string
  version: number
  updated_at: string
  config: PricingCatalog
}

type FieldDefinition = {
  label: string
  path: Array<string | number>
  suffix?: string
  step?: string
  optional?: boolean
  hideDollar?: boolean
}

type FieldGroup = {
  title: string
  description: string
  fields: FieldDefinition[]
  subgroups?: Array<{ title: string; description: string; fields: FieldDefinition[] }>
}

const DAY_GROUPS = [
  { id: 'monday_thursday', label: 'Monday – Thursday', minimumHours: 3, minimumPrice: 1200, additionalHourRate: 200 },
  { id: 'friday', label: 'Friday', minimumHours: 6, minimumPrice: 1700, additionalHourRate: 350 },
  { id: 'saturday', label: 'Saturday', minimumHours: 6, minimumPrice: 2100, additionalHourRate: 350 },
  { id: 'sunday', label: 'Sunday', minimumHours: 6, minimumPrice: 1400, additionalHourRate: 350 },
] as const

const PERIODS = [
  { id: 'morning', label: 'Daytime' },
  { id: 'evening', label: 'Evening' },
  { id: 'full_day', label: 'All day' },
] as const

const MONEY_GROUPS: FieldGroup[] = [
  {
    title: 'Confirmed Luxor charges',
    description: 'Official Luxor charges used in event totals, agreements, and payment links.',
    fields: [
      { label: 'Booking payment due at signing', path: ['luxor_costs', 'booking_payment', 'amount'], step: '0.01' },
      ...[0, 1, 2].map((index) => ({
        label: `Cleaning (${index === 0 ? '1–75' : index === 1 ? '76–150' : '151–200'} guests)`,
        path: ['luxor_costs', 'required_fees', 'cleaning', 'retail', index, 'amount'],
      })),
      { label: 'Security rate', path: ['luxor_costs', 'required_fees', 'security', 'hourly_rate'], suffix: '/ guard / hr', step: '1' },
      { label: 'Refundable security deposit', path: ['luxor_costs', 'security_deposit', 'amount'] },
    ],
  },
  {
    title: 'Preferred Vendor Collection — estimated pricing',
    description: 'Planning estimates only; never billed as Luxor charges or payment links.',
    fields: [
      { label: 'Essential decor starting', path: ['preferred_vendor_estimates', 'decor', 'essential', 'starting_investment'] },
      { label: 'Full decor & planning starting', path: ['preferred_vendor_estimates', 'decor', 'full_decor_and_planning', 'starting_investment'] },
      { label: 'Buffet starting per guest', path: ['preferred_vendor_estimates', 'catering', 'buffet', 'starting_per_guest'], step: '0.01' },
      { label: 'Plated meal starting per guest', path: ['preferred_vendor_estimates', 'catering', 'plated', 'starting_per_guest'], step: '0.01' },
      { label: 'DJ starting investment', path: ['preferred_vendor_estimates', 'dj', 'starting_investment'] },
      { label: 'Signature photo booth starting', path: ['preferred_vendor_estimates', 'photo_booth', 'signature_experience', 'starting_investment'] },
      { label: 'Celebration photo booth starting', path: ['preferred_vendor_estimates', 'photo_booth', 'celebration_experience', 'starting_investment'] },
      { label: 'Forever photo booth starting', path: ['preferred_vendor_estimates', 'photo_booth', 'forever_experience', 'starting_investment'] },
    ],
  },
  {
    title: 'Preferred Vendor Collection — bar estimates',
    description: 'Estimated vendor bar pricing by guest count and package minimums.',
    fields: [
      ...[0, 1, 2].map((index) => ({
        label: `Bartending (${index === 0 ? '1–75' : index === 1 ? '76–150' : '151–200'} guests)`,
        path: ['preferred_vendor_estimates', 'bartending', 'staffing', index, 'amount'],
      })),
      { label: 'Additional hour per bartender', path: ['preferred_vendor_estimates', 'bartending', 'additional_hour_per_bartender'] },
      ...(['signature_byob', 'premium_byob', 'non_alcoholic'] as const).flatMap((bar) => {
        const label = bar === 'signature_byob' ? 'Signature BYOB' : bar === 'premium_byob' ? 'Premium BYOB' : 'Non-alcoholic bar'
        return [
          { label: `${label} per guest`, path: ['preferred_vendor_estimates', 'bartending', 'bars', bar, 'starting_per_guest'] },
          { label: `${label} minimum`, path: ['preferred_vendor_estimates', 'bartending', 'bars', bar, 'minimum'] },
        ]
      }),
    ],
  },
]

const inputClass =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm font-medium tabular-nums text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

const labelClass = 'block text-xs font-medium text-[color:var(--portal-muted)]'

function MoneyInput({
  draft,
  loading = false,
  field,
  onChange,
  valueOverride,
}: {
  draft: PricingCatalog | null
  loading?: boolean
  field: FieldDefinition
  onChange: (path: FieldDefinition['path'], value: number | null) => void
  valueOverride?: number | null
}) {
  const value = valueOverride !== undefined ? valueOverride : draft ? catalogValue(draft, ...field.path) : undefined
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className={labelClass}>{field.label}</span>
      <PortalSkeletonTransition
        loading={loading || !draft}
        overlap
        skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
      >
        <span className="relative block">
          {!field.hideDollar ? (
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-[color:var(--portal-faint)]">
              $
            </span>
          ) : null}
          <input
            aria-label={field.label}
            type="number"
            min="0"
            step={field.step || '1'}
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(event) => onChange(field.path, event.target.value === '' ? null : Number(event.target.value))}
            className={`${inputClass} ${field.hideDollar ? 'pl-3.5' : 'pl-7'} ${field.suffix ? 'pr-24' : ''}`}
          />
          {field.suffix ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-[color:var(--portal-faint)]">
              {field.suffix}
            </span>
          ) : null}
        </span>
      </PortalSkeletonTransition>
    </label>
  )
}

export function ProposalPricingManager() {
  const { notify } = useToast()
  const [record, setRecord] = useState<PricingRecord | null>(null)
  const [draft, setDraft] = useState<PricingCatalog | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [customTimeV4Ready, setCustomTimeV4Ready] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const response = await fetch('/api/proposal-pricing', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load the pricing catalog.')
      let loadedConfig = structuredClone(payload.config)
      setCustomTimeV4Ready(payload.custom_time_v4_ready === true)
      if (catalogValue(loadedConfig, 'luxor_costs', 'required_fees', 'security', 'hourly_rate') === undefined) {
        loadedConfig = setCatalogValue(loadedConfig, ['luxor_costs', 'required_fees', 'security', 'hourly_rate'], 30)
      }
      if (catalogValue(loadedConfig, 'luxor_costs', 'required_fees', 'security', 'minimum_hours') === undefined) {
        loadedConfig = setCatalogValue(loadedConfig, ['luxor_costs', 'required_fees', 'security', 'minimum_hours'], 4)
      }
      loadedConfig = setCatalogValue(loadedConfig, ['luxor_costs', 'package_selection_v1'], getLuxorProposalPackageSettings(loadedConfig))
      setRecord({ ...payload, config: loadedConfig })
      setDraft(loadedConfig)
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the pricing catalog.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(() => Boolean(record && draft && JSON.stringify(record.config) !== JSON.stringify(draft)), [draft, record])
  const update = (path: Array<string | number>, value: unknown) =>
    setDraft((current) => (current ? setCatalogValue(current, path, value) : current))
  const decorCatalog = readLuxorDecorCatalog(draft, true)

  const toggleCustomTimeDay = (path: Array<string | number>, enabled: boolean) =>
    setDraft((current) => {
      if (!current) return current
      let next = setCatalogValue(current, [...path, 'enabled'], enabled)
      if (!enabled) return next
      for (const [key, value] of Object.entries({
        time_increment_minutes: 60,
        reset_window_policy: 'allowed',
        booking_policy: 'one_per_date',
        cleanup_buffer_minutes: 0,
        security_hours_policy: 'arrival_to_end',
        selection_surface: 'portal_only',
      })) {
        if (catalogValue(next, ...path, key) === undefined || catalogValue(next, ...path, key) === null) {
          next = setCatalogValue(next, [...path, key], value)
        }
      }
      const day = DAY_GROUPS.find((entry) => entry.id === path[path.length - 1])
      if (day) {
        if (day.id === 'monday_thursday') {
          const hours = catalogNumber(next, ...path, 'minimum_hours') ?? day.minimumHours
          const price = catalogNumber(next, ...path, 'minimum_price')
          const hourlyRateValue = catalogValue(next, ...path, 'hourly_rate')
          const rate =
            hourlyRateValue === null
              ? null
              : catalogNumber(next, ...path, 'hourly_rate') ??
                (price !== undefined && catalogNumber(next, ...path, 'minimum_hours')
                  ? Math.round((price / catalogNumber(next, ...path, 'minimum_hours')!) * 100) / 100
                  : day.minimumPrice / day.minimumHours)
          if (catalogValue(next, ...path, 'minimum_hours') === undefined || catalogValue(next, ...path, 'minimum_hours') === null) {
            next = setCatalogValue(next, [...path, 'minimum_hours'], hours)
          }
          next = setCatalogValue(next, [...path, 'hourly_rate'], rate)
          if (price === undefined || price === null) {
            next = setCatalogValue(next, [...path, 'minimum_price'], rate === null ? null : Math.round(rate * hours * 100) / 100)
          }
        } else {
          if (catalogValue(next, ...path, 'minimum_hours') === undefined || catalogValue(next, ...path, 'minimum_hours') === null) {
            next = setCatalogValue(next, [...path, 'minimum_hours'], day.minimumHours)
          }
          if (catalogValue(next, ...path, 'minimum_price') === undefined || catalogValue(next, ...path, 'minimum_price') === null) {
            next = setCatalogValue(next, [...path, 'minimum_price'], day.minimumPrice)
          }
        }
        if (catalogValue(next, ...path, 'additional_hour_rate') === undefined || catalogValue(next, ...path, 'additional_hour_rate') === null) {
          next = setCatalogValue(next, [...path, 'additional_hour_rate'], day.additionalHourRate)
        }
      }
      return next
    })

  const updateWeekdayCustomTime = (field: 'minimum_hours' | 'hourly_rate', value: number | null) =>
    setDraft((current) => (current ? updateLuxorCustomTimeWeekdayPricingV4(current, field, value) : current))

  const save = async () => {
    if (!record || !draft) return
    setSaving(true)
    setError(null)
    try {
      let configToSave = structuredClone(draft)
      for (const packageId of LUXOR_PROPOSAL_PACKAGE_IDS) {
        const optionPath = ['luxor_costs', 'package_selection_v1', 'options', packageId] as const
        const rawInclusions = catalogValue(configToSave, ...optionPath, 'inclusions')
        if (Array.isArray(rawInclusions)) {
          configToSave = setCatalogValue(
            configToSave,
            [...optionPath, 'inclusions'],
            rawInclusions.map((line) => String(line).trim()).filter(Boolean),
          )
        }
      }
      const response = await fetch('/api/proposal-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, version: record.version, config: configToSave }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(payload.details)
          ? payload.details.filter((detail: unknown): detail is string => typeof detail === 'string')
          : []
        throw new Error([payload.error || 'Could not save pricing changes.', ...details].join(' '))
      }
      setRecord(payload)
      setDraft(structuredClone(payload.config))
      notify({ title: 'Pricing updated across Luxor.', variant: 'success' })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save pricing changes.')
    } finally {
      setSaving(false)
    }
  }

  if (state === 'error' && (!draft || !record)) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-200">
        <p className="font-bold">Pricing catalog unavailable</p>
        <p className="mt-1 text-xs">{error}</p>
        <PortalButton variant="secondary" className="mt-4" onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </PortalButton>
      </div>
    )
  }

  const isLoading = state === 'loading' && (!draft || !record)
  const rawTaxRate = draft ? catalogNumber(draft, 'luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate') : undefined
  const displayTaxPercent = rawTaxRate === undefined ? '' : String(Math.round(rawTaxRate * 100 * 10000) / 10000)

  return (
    <section className="min-w-0 space-y-5">
      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h3 className="text-base font-bold text-[color:var(--portal-text)]">Pricing catalog</h3>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
              Updates new proposals, Elena&apos;s pricing context, and brochure packages. Sent proposals keep their original snapshot.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <PortalButton
              type="button"
              variant="ghost"
              onClick={() => {
                if (record) setDraft(structuredClone(record.config))
                setError(null)
              }}
              disabled={!dirty || saving || isLoading}
            >
              Discard
            </PortalButton>
            <PortalButton type="button" variant="primary" onClick={() => void save()} disabled={!dirty || saving || isLoading}>
              <Save size={14} aria-hidden="true" />
              {saving ? 'Saving…' : 'Save pricing'}
            </PortalButton>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--portal-border)] pt-3 text-xs tabular-nums text-[color:var(--portal-muted)]">
          <PortalSkeletonTransition
            loading={isLoading}
            overlap
            className="inline-flex items-center"
            skeleton={<PortalSkeleton className="h-4 w-56 rounded" />}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Version {record?.version ?? '—'}</span>
              <span>
                Updated {record ? new Date(record.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </span>
              {dirty ? <span className="font-semibold text-amber-700 dark:text-amber-300">Unsaved changes</span> : null}
            </div>
          </PortalSkeletonTransition>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-bold text-[color:var(--portal-text)]">Decor add-on catalog</span>
              <span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">
                Manage the active catalog used for new proposals. Deactivating an item keeps its saved proposal history intact.
              </span>
            </span>
            <PortalSkeleton className="h-4 w-16 rounded" />
          </div>
        </div>
      ) : (
        <LuxorDecorCatalogEditor
          items={decorCatalog}
          onChange={(items: LuxorDecorCatalogItem[]) =>
            update(['luxor_costs', LUXOR_DECOR_CATALOG_KEY], { schema_version: 1, items })
          }
        />
      )}

      <details open className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <span>
            <span className="block text-sm font-bold text-[color:var(--portal-text)]">Venue rental rates</span>
            <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">
              Base rates shown publicly and used in new proposals.
            </span>
          </span>
          <ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-[color:var(--portal-border)] p-4 sm:p-6">
          <div className="grid gap-4">
            {DAY_GROUPS.map((day) => (
              <article key={day.id} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
                <h4 className="text-sm font-bold text-[color:var(--portal-text)]">{day.label}</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {PERIODS.map((period) => (
                    <div key={period.id} className="min-w-0 space-y-2">
                      <MoneyInput
                        draft={draft}
                        loading={isLoading}
                        field={{ label: period.label, path: ['luxor_costs', 'rental_rates', day.id, period.id] }}
                        onChange={update}
                      />
                      <PortalSkeletonTransition
                        loading={isLoading}
                        overlap
                        skeleton={<PortalSkeleton className="h-4 w-24 rounded" />}
                      >
                        <PortalCheckbox
                          checked={draft ? catalogValue(draft, 'luxor_costs', 'rental_rate_rules', day.id, period.id, 'public') !== false : true}
                          onChange={(checked) => update(['luxor_costs', 'rental_rate_rules', day.id, period.id, 'public'], checked)}
                          label={<span className="whitespace-nowrap">Show publicly</span>}
                        />
                      </PortalSkeletonTransition>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:grid-cols-2">
                  <MoneyInput
                    draft={draft}
                    loading={isLoading}
                    field={{ label: 'Additional hour', path: ['luxor_costs', 'additional_time_rates', day.id], optional: true }}
                    onChange={update}
                  />
                  {day.id === 'monday_thursday' ? (
                    <>
                      <MoneyInput
                        draft={draft}
                        loading={isLoading}
                        field={{ label: 'Daytime hourly rate', path: ['luxor_costs', 'rental_rate_rules', day.id, 'morning', 'hourly_rate'] }}
                        onChange={update}
                      />
                      <label className="block space-y-1.5">
                        <span className={labelClass}>Minimum hours</span>
                        <PortalSkeletonTransition
                          loading={isLoading}
                          overlap
                          skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                        >
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={draft ? String(catalogNumber(draft, 'luxor_costs', 'rental_rate_rules', day.id, 'morning', 'minimum_hours') ?? '') : ''}
                            onChange={(event) =>
                              update(
                                ['luxor_costs', 'rental_rate_rules', day.id, 'morning', 'minimum_hours'],
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                            className={inputClass}
                          />
                        </PortalSkeletonTransition>
                      </label>
                      {!customTimeV4Ready ? (
                        <div className="rounded-xl border border-[#caa24c]/25 bg-[color:var(--portal-card)] p-3.5 sm:col-span-2">
                          <p className="text-xs font-bold text-[#8c6529] dark:text-[#f1d27a]">Custom Time pricing</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <MoneyInput
                              draft={draft}
                              loading={isLoading}
                              field={{ label: 'Base hourly rate', path: ['luxor_costs', 'weekday_custom_rental', 'hourly_rate'], suffix: 'initial hrs' }}
                              onChange={update}
                            />
                            <label className="block space-y-1.5">
                              <span className={labelClass}>Minimum billed hours</span>
                              <PortalSkeletonTransition
                                loading={isLoading}
                                overlap
                                skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                              >
                                <input
                                  type="number"
                                  min="1"
                                  max="19"
                                  step="1"
                                  value={draft ? String(catalogNumber(draft, 'luxor_costs', 'weekday_custom_rental', 'minimum_hours') ?? '') : ''}
                                  onChange={(event) =>
                                    update(
                                      ['luxor_costs', 'weekday_custom_rental', 'minimum_hours'],
                                      event.target.value === '' ? null : Number(event.target.value),
                                    )
                                  }
                                  className={inputClass}
                                />
                              </PortalSkeletonTransition>
                            </label>
                            <MoneyInput
                              draft={draft}
                              loading={isLoading}
                              field={{ label: 'Minimum rental price', path: ['luxor_costs', 'weekday_custom_rental', 'minimum_price'] }}
                              onChange={update}
                            />
                            <MoneyInput
                              draft={draft}
                              loading={isLoading}
                              field={{ label: 'Each additional hour', path: ['luxor_costs', 'weekday_custom_rental', 'additional_hour_rate'] }}
                              onChange={update}
                            />
                          </div>
                          <p className="mt-2.5 text-xs text-[color:var(--portal-muted)]">
                            Rentals shorter than minimum hours use the minimum price; extra whole hours use the additional-hour rate.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:grid-cols-3">
            {PERIODS.map((period) => (
              <div key={period.id} className="min-w-0 space-y-2">
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">{period.label} access hours</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-[color:var(--portal-muted)]">
                    <span>Starts</span>
                    <PortalSkeletonTransition
                      loading={isLoading}
                      overlap
                      skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                    >
                      <input
                        type="time"
                        value={draft ? String(catalogValue(draft, 'luxor_costs', 'rental_access', period.id, 'start') || '') : ''}
                        onChange={(event) => update(['luxor_costs', 'rental_access', period.id, 'start'], event.target.value)}
                        className={`${inputClass} px-2.5 text-xs`}
                      />
                    </PortalSkeletonTransition>
                  </label>
                  <label className="space-y-1 text-xs text-[color:var(--portal-muted)]">
                    <span>Ends</span>
                    <PortalSkeletonTransition
                      loading={isLoading}
                      overlap
                      skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                    >
                      <input
                        type="time"
                        value={draft ? String(catalogValue(draft, 'luxor_costs', 'rental_access', period.id, 'end') || '') : ''}
                        onChange={(event) => update(['luxor_costs', 'rental_access', period.id, 'end'], event.target.value)}
                        className={`${inputClass} px-2.5 text-xs`}
                      />
                    </PortalSkeletonTransition>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <span>
            <span className="block text-sm font-bold text-[color:var(--portal-text)]">Custom Time rates by day</span>
            <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">
              {customTimeV4Ready
                ? 'Active Custom Time rates. Fixed rentals and sent proposals are unchanged.'
                : 'Staged Custom Time rates. Weekday settings above remain active until enabled.'}
            </span>
          </span>
          <ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:grid-cols-2 sm:p-6">
          {DAY_GROUPS.map((day) => {
            const path = ['luxor_costs', 'custom_time_rental_v4', day.id]
            const enabled = draft ? catalogValue(draft, ...path, 'enabled') === true : false
            const minimumPrice = draft ? catalogNumber(draft, ...path, 'minimum_price') : undefined
            const minimumHours = draft ? catalogNumber(draft, ...path, 'minimum_hours') : undefined
            const weekdayHourlyRateValue = draft ? catalogValue(draft, ...path, 'hourly_rate') : undefined
            const weekdayHourlyRate =
              weekdayHourlyRateValue === null
                ? null
                : (draft ? catalogNumber(draft, ...path, 'hourly_rate') : undefined) ??
                  (minimumPrice != null && minimumHours
                    ? Math.round((minimumPrice / minimumHours) * 100) / 100
                    : day.id === 'monday_thursday'
                      ? 400
                      : null)
            const shownMinimumHours =
              minimumHours ?? (day.id === 'monday_thursday' && draft && catalogValue(draft, ...path, 'minimum_hours') === undefined ? day.minimumHours : null)
            const shownMinimumPrice =
              minimumPrice ??
              (day.id === 'monday_thursday' && draft && catalogValue(draft, ...path, 'minimum_price') === undefined
                ? Math.round((weekdayHourlyRate ?? 400) * (shownMinimumHours ?? day.minimumHours) * 100) / 100
                : null)
            return (
              <article key={day.id} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-[color:var(--portal-text)]">{day.label}</h4>
                  <PortalCheckbox
                    checked={enabled}
                    disabled={isLoading}
                    onChange={(checked) => toggleCustomTimeDay(path, checked)}
                    label="Enable Custom Time"
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {day.id === 'monday_thursday' ? (
                    <MoneyInput
                      draft={draft}
                      loading={isLoading}
                      field={{ label: 'Base hourly rate', path: [...path, 'hourly_rate'], step: '0.01' }}
                      onChange={(_fieldPath, value) => updateWeekdayCustomTime('hourly_rate', value)}
                      valueOverride={weekdayHourlyRate}
                    />
                  ) : (
                    <MoneyInput
                      draft={draft}
                      loading={isLoading}
                      field={{ label: 'Minimum rental price', path: [...path, 'minimum_price'], optional: true }}
                      onChange={update}
                    />
                  )}
                  <label className="block space-y-1.5">
                    <span className={labelClass}>Minimum billed hours</span>
                    <PortalSkeletonTransition
                      loading={isLoading}
                      overlap
                      skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                    >
                      <input
                        type="number"
                        min="1"
                        max="19"
                        step="1"
                        value={String(shownMinimumHours ?? '')}
                        onChange={(event) =>
                          day.id === 'monday_thursday'
                            ? updateWeekdayCustomTime('minimum_hours', event.target.value === '' ? null : Number(event.target.value))
                            : update([...path, 'minimum_hours'], event.target.value === '' ? null : Number(event.target.value))
                        }
                        className={inputClass}
                      />
                    </PortalSkeletonTransition>
                  </label>
                  <MoneyInput
                    draft={draft}
                    loading={isLoading}
                    field={{ label: 'Each additional hour', path: [...path, 'additional_hour_rate'], optional: true }}
                    onChange={update}
                  />
                  <div className="flex items-end pb-2">
                    <PortalCheckbox
                      checked={draft ? catalogValue(draft, ...path, 'show_publicly') === true : false}
                      disabled={isLoading}
                      onChange={(checked) => update([...path, 'show_publicly'], checked)}
                      label="Show starting price publicly"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs tabular-nums text-[color:var(--portal-muted)]">
                  {day.id === 'monday_thursday'
                    ? `Minimum ${shownMinimumPrice != null ? `$${shownMinimumPrice.toFixed(2)}` : 'from hourly rate'} for ${shownMinimumHours ?? 'configured'} hrs; access 6:00 AM–1:00 AM.`
                    : `Base covers ${minimumHours ?? 'configured'} hrs; access 6:00 AM–1:00 AM. Security billed from arrival to end.`}
                </p>
                {draft && enabled && !catalogNumber(draft, ...path, 'minimum_price') ? (
                  <p role="status" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Set {day.id === 'monday_thursday' ? 'the' : `${day.label}'s`} base price before enabling.
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      </details>

      {MONEY_GROUPS.map((group) => (
        <details key={group.title} className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6">
            <span>
              <span className="block text-sm font-bold text-[color:var(--portal-text)]">{group.title}</span>
              <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">{group.description}</span>
            </span>
            <ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {group.fields.map((field) => (
              <MoneyInput key={field.path.join('.')} draft={draft} loading={isLoading} field={field} onChange={update} />
            ))}
          </div>
          {group.subgroups?.map((subgroup) => (
            <div key={subgroup.title} className="border-t border-[color:var(--portal-border)] p-4 sm:p-6">
              <h4 className="text-sm font-bold text-[color:var(--portal-text)]">{subgroup.title}</h4>
              <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">{subgroup.description}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {subgroup.fields.map((field) => (
                  <MoneyInput key={field.path.join('.')} draft={draft} loading={isLoading} field={field} onChange={update} />
                ))}
              </div>
            </div>
          ))}
        </details>
      ))}

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <span>
            <span className="block text-sm font-bold text-[color:var(--portal-text)]">Proposal packages</span>
            <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">
              Tier settings for Essentials, Signature, Luxor, and Customized proposals.
            </span>
          </span>
          <ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:p-6 xl:grid-cols-2">
          {LUXOR_PROPOSAL_PACKAGE_IDS.map((packageId) => {
            const optionPath = ['luxor_costs', 'package_selection_v1', 'options', packageId]
            const tiers = draft ? (catalogValue(draft, ...optionPath, 'price_tiers') as Array<Record<string, unknown>> | undefined) || [] : []
            return (
              <article key={packageId} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
                <h4 className="text-sm font-bold capitalize text-[color:var(--portal-text)]">
                  {draft ? String(catalogValue(draft, ...optionPath, 'name') || packageId) : packageId}
                </h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {([
                    ['Name', 'name'],
                    ['Positioning', 'positioning'],
                    ['Description', 'description'],
                    ['Card heading', 'summary_title'],
                    ['Card summary', 'summary'],
                  ] as const).map(([label, field]) => (
                    <label key={field} className="block min-w-0 space-y-1.5">
                      <span className={labelClass}>{label}</span>
                      <PortalSkeletonTransition
                        loading={isLoading}
                        overlap
                        skeleton={<PortalSkeleton className={field === 'description' || field === 'summary' ? 'h-20 w-full rounded-xl' : 'h-10 w-full rounded-xl'} />}
                      >
                        {field === 'description' || field === 'summary' ? (
                          <textarea
                            value={draft ? String(catalogValue(draft, ...optionPath, field) || '') : ''}
                            onChange={(event) => update([...optionPath, field], event.target.value)}
                            className={`${inputClass} min-h-20 resize-y py-2 font-normal`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={draft ? String(catalogValue(draft, ...optionPath, field) || '') : ''}
                            onChange={(event) => update([...optionPath, field], event.target.value)}
                            className={`${inputClass} font-normal`}
                          />
                        )}
                      </PortalSkeletonTransition>
                    </label>
                  ))}
                  {packageId === 'luxor' ? (
                    <label className="block min-w-0 space-y-1.5 sm:col-span-2">
                      <span className={labelClass}>Most Popular badge</span>
                      <PortalSkeletonTransition
                        loading={isLoading}
                        overlap
                        skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                      >
                        <input
                          type="text"
                          value={draft ? String(catalogValue(draft, ...optionPath, 'most_popular_label') || '') : ''}
                          onChange={(event) => update([...optionPath, 'most_popular_label'], event.target.value)}
                          className={`${inputClass} font-normal`}
                        />
                      </PortalSkeletonTransition>
                    </label>
                  ) : null}
                  <label className="block min-w-0 space-y-1.5 sm:col-span-2">
                    <span className={labelClass}>Inclusions (one per line; use %rental_hours% for venue hours)</span>
                    <PortalSkeletonTransition
                      loading={isLoading}
                      overlap
                      skeleton={<PortalSkeleton className="h-28 w-full rounded-xl" />}
                    >
                      <textarea
                        value={
                          draft && Array.isArray(catalogValue(draft, ...optionPath, 'inclusions'))
                            ? (catalogValue(draft, ...optionPath, 'inclusions') as string[]).join('\n')
                            : ''
                        }
                        onChange={(event) => update([...optionPath, 'inclusions'], event.target.value.split('\n'))}
                        onBlur={(event) =>
                          update(
                            [...optionPath, 'inclusions'],
                            event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                          )
                        }
                        className={`${inputClass} min-h-28 resize-y py-2 font-normal`}
                      />
                    </PortalSkeletonTransition>
                  </label>
                </div>
                {tiers.map((tier, index) => (
                  <div key={`${packageId}-tier-${index}`} className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:grid-cols-3">
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Tier {index + 1} min guests</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={String(tier.min_guests ?? '')}
                        onChange={(event) =>
                          update(
                            [...optionPath, 'price_tiers', index, 'min_guests'],
                            event.target.value === '' ? null : Number(event.target.value),
                          )
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Tier {index + 1} max guests</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={String(tier.max_guests ?? '')}
                        onChange={(event) =>
                          update(
                            [...optionPath, 'price_tiers', index, 'max_guests'],
                            event.target.value === '' ? null : Number(event.target.value),
                          )
                        }
                        className={inputClass}
                      />
                    </label>
                    <MoneyInput
                      draft={draft}
                      loading={isLoading}
                      field={{ label: `Tier ${index + 1} fee`, path: [...optionPath, 'price_tiers', index, 'amount'] }}
                      onChange={update}
                    />
                  </div>
                ))}
                {!isLoading && tiers.length === 0 ? (
                  <p className="mt-3 text-xs text-[color:var(--portal-muted)]">
                    No package fee. Customized selections use individual catalog prices.
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      </details>

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <span>
            <span className="block text-sm font-bold text-[color:var(--portal-text)]">Sales tax</span>
            <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">
              Percentage applied to taxable proposal line items.
            </span>
          </span>
          <ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[color:var(--portal-border)] p-4 sm:p-6">
          <label className="block max-w-xs space-y-1.5">
            <span className={labelClass}>Sales tax rate</span>
            <PortalSkeletonTransition
              loading={isLoading}
              overlap
              skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
            >
              <span className="relative block">
                <input
                  aria-label="Sales tax rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={displayTaxPercent}
                  onChange={(event) =>
                    update(
                      ['luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate'],
                      event.target.value === '' ? null : Number(event.target.value) / 100,
                    )
                  }
                  className={`${inputClass} pr-9`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-[color:var(--portal-faint)]">
                  %
                </span>
              </span>
            </PortalSkeletonTransition>
          </label>
        </div>
      </details>
    </section>
  )
}
