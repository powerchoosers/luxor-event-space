'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ExternalLink, RefreshCw, Save } from 'lucide-react'
import { PortalButton, PortalSkeleton } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { catalogNumber, catalogValue, setCatalogValue, type PricingCatalog } from '@/lib/luxorPricingCatalog'
import { OFFICIAL_DECOR_SERVICES } from '@/lib/luxorDecorCatalog'
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
  { id: 'monday_thursday', label: 'Monday - Thursday', minimumHours: 3, minimumPrice: 1200, additionalHourRate: 200 },
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
    description: 'These are official Luxor charges. They appear in the final event price, agreement, payment schedule, and payment link.',
    fields: [
      { label: 'Booking payment due at signing', path: ['luxor_costs', 'booking_payment', 'amount'], step: '0.01' },
      ...[0, 1, 2].map((index) => ({ label: `Cleaning ${index === 0 ? '1–75' : index === 1 ? '76–150' : '151–200'} guests`, path: ['luxor_costs', 'required_fees', 'cleaning', 'retail', index, 'amount'] })),
      { label: 'Security rate', path: ['luxor_costs', 'required_fees', 'security', 'hourly_rate'], suffix: '/ guard / hour', step: '1' },
      { label: 'Refundable security deposit', path: ['luxor_costs', 'security_deposit', 'amount'] },
    ],
    subgroups: [
      {
        title: 'Decor packages',
        description: 'The price covers the entire package, including all listed items. Choose one package per event.',
        fields: OFFICIAL_DECOR_SERVICES.filter((service) => service.category === 'decor_packages').map((service) => ({
          label: service.name, path: ['luxor_costs', 'official_decor', service.id, 'amount'], suffix: '/ package', step: '0.01',
        })),
      },
      {
        title: 'Decor add-ons',
        description: 'Additional quantities are charged separately. Items already included with a package do not create extra charges. Marquee Letters have a 2-letter minimum.',
        fields: OFFICIAL_DECOR_SERVICES.filter((service) => service.category === 'decor_add_ons').map((service) => ({
          label: service.name, path: ['luxor_costs', 'official_decor', service.id, 'amount'], suffix: service.unit === 'letter' ? '/ letter' : '/ each', step: '0.01',
        })),
      },
    ],
  },
  {
    title: 'Preferred Vendor Collection — estimated pricing',
    description: 'Planning estimates only. They never become Luxor charges, invoices, contracts, or payment links.',
    fields: [
      { label: 'Essential decor starting investment', path: ['preferred_vendor_estimates', 'decor', 'essential', 'starting_investment'] },
      { label: 'Full decor & planning starting investment', path: ['preferred_vendor_estimates', 'decor', 'full_decor_and_planning', 'starting_investment'] },
      { label: 'Buffet starting per guest', path: ['preferred_vendor_estimates', 'catering', 'buffet', 'starting_per_guest'], step: '0.01' },
      { label: 'Plated meal starting per guest', path: ['preferred_vendor_estimates', 'catering', 'plated', 'starting_per_guest'], step: '0.01' },
      { label: 'DJ starting investment', path: ['preferred_vendor_estimates', 'dj', 'starting_investment'] },
      { label: 'Signature photo booth starting investment', path: ['preferred_vendor_estimates', 'photo_booth', 'signature_experience', 'starting_investment'] },
      { label: 'Celebration photo booth starting investment', path: ['preferred_vendor_estimates', 'photo_booth', 'celebration_experience', 'starting_investment'] },
      { label: 'Forever photo booth starting investment', path: ['preferred_vendor_estimates', 'photo_booth', 'forever_experience', 'starting_investment'] },
    ],
  },
  {
    title: 'Preferred Vendor Collection — bar estimates',
    description: 'Estimated vendor pricing by guest count and minimums. Clients confirm final details directly with the vendor.',
    fields: [
      ...[0, 1, 2].flatMap((index) => [
        { label: `Bartending starting estimate ${index === 0 ? '1–75' : index === 1 ? '76–150' : '151–200'} guests`, path: ['preferred_vendor_estimates', 'bartending', 'staffing', index, 'amount'] },
      ]),
      { label: 'Additional hour per bartender', path: ['preferred_vendor_estimates', 'bartending', 'additional_hour_per_bartender'] },
      ...(['signature_byob', 'premium_byob', 'non_alcoholic'] as const).flatMap((bar) => {
        const label = bar === 'signature_byob' ? 'Signature BYOB' : bar === 'premium_byob' ? 'Premium BYOB' : 'Non-alcoholic bar'
        return [
          { label: `${label} starting per guest`, path: ['preferred_vendor_estimates', 'bartending', 'bars', bar, 'starting_per_guest'] },
          { label: `${label} minimum`, path: ['preferred_vendor_estimates', 'bartending', 'bars', bar, 'minimum'] },
        ]
      }),
    ],
  },
]

const inputClass = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10'

function MoneyInput({ draft, field, onChange, valueOverride }: { draft: PricingCatalog; field: FieldDefinition; onChange: (path: FieldDefinition['path'], value: number | null) => void; valueOverride?: number | null }) {
  const value = valueOverride !== undefined ? valueOverride : catalogValue(draft, ...field.path)
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{field.label}</span>
      <span className="relative block">
        {!field.hideDollar ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[color:var(--portal-faint)]">$</span> : null}
        <input aria-label={field.label} type="number" min="0" step={field.step || '1'} value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(field.path, event.target.value === '' ? null : Number(event.target.value))} className={`${inputClass} ${field.hideDollar ? 'pl-3' : 'pl-7'} ${field.suffix ? 'pr-28' : ''}`} />
        {field.suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-bold text-[color:var(--portal-faint)]">{field.suffix}</span> : null}
      </span>
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

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => Boolean(record && draft && JSON.stringify(record.config) !== JSON.stringify(draft)), [draft, record])
  const update = (path: Array<string | number>, value: unknown) => setDraft((current) => current ? setCatalogValue(current, path, value) : current)
  const toggleCustomTimeDay = (path: Array<string | number>, enabled: boolean) => setDraft((current) => {
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
        const rate = hourlyRateValue === null ? null : catalogNumber(next, ...path, 'hourly_rate') ?? (price !== undefined && catalogNumber(next, ...path, 'minimum_hours') ? Math.round(price / catalogNumber(next, ...path, 'minimum_hours')! * 100) / 100 : day.minimumPrice / day.minimumHours)
        if (catalogValue(next, ...path, 'minimum_hours') === undefined || catalogValue(next, ...path, 'minimum_hours') === null) next = setCatalogValue(next, [...path, 'minimum_hours'], hours)
        next = setCatalogValue(next, [...path, 'hourly_rate'], rate)
        if (price === undefined || price === null) next = setCatalogValue(next, [...path, 'minimum_price'], rate === null ? null : Math.round(rate * hours * 100) / 100)
      } else {
        if (catalogValue(next, ...path, 'minimum_hours') === undefined || catalogValue(next, ...path, 'minimum_hours') === null) next = setCatalogValue(next, [...path, 'minimum_hours'], day.minimumHours)
        if (catalogValue(next, ...path, 'minimum_price') === undefined || catalogValue(next, ...path, 'minimum_price') === null) next = setCatalogValue(next, [...path, 'minimum_price'], day.minimumPrice)
      }
      if (catalogValue(next, ...path, 'additional_hour_rate') === undefined || catalogValue(next, ...path, 'additional_hour_rate') === null) next = setCatalogValue(next, [...path, 'additional_hour_rate'], day.additionalHourRate)
    }
    return next
  })

  const updateWeekdayCustomTime = (field: 'minimum_hours' | 'hourly_rate', value: number | null) => setDraft((current) => current ? updateLuxorCustomTimeWeekdayPricingV4(current, field, value) : current)

  const save = async () => {
    if (!record || !draft) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/proposal-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, version: record.version, config: draft }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not save pricing changes.')
      setRecord(payload)
      setDraft(structuredClone(payload.config))
      notify({ title: 'Pricing updated across Luxor.', variant: 'success' })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save pricing changes.')
    } finally {
      setSaving(false)
    }
  }

  if (state === 'loading') return <div className="space-y-4" aria-busy="true"><PortalSkeleton className="h-28 rounded-2xl" /><PortalSkeleton className="h-72 rounded-2xl" /></div>

  if (!draft || !record) return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-200">
      <p className="font-bold">Pricing catalog unavailable</p><p className="mt-1 text-xs">{error}</p>
      <PortalButton variant="secondary" className="mt-4" onClick={() => void load()}><RefreshCw size={14} /> Try again</PortalButton>
    </div>
  )

  return (
    <section className="min-w-0 space-y-5">
      <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#9a6d26] dark:text-[#e0bd67]"><Check size={15} /><span className="text-[10px] font-black uppercase tracking-[0.16em]">One approved catalog</span></div>
            <h3 className="mt-2 text-lg font-bold text-[color:var(--portal-text)]">Pricing that updates everywhere</h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Saving here updates new proposal calculations, Elena&apos;s pricing context, and venue brochure package figures. Existing saved proposals keep their original pricing snapshot.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <PortalButton type="button" variant="ghost" onClick={() => { setDraft(structuredClone(record.config)); setError(null) }} disabled={!dirty || saving}>Discard</PortalButton>
            <PortalButton type="button" variant="primary" onClick={() => void save()} disabled={!dirty || saving}><Save size={14} /> {saving ? 'Saving…' : 'Save pricing'}</PortalButton>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[color:var(--portal-border)] pt-3 text-[10px] text-[color:var(--portal-faint)]">
          <span>Catalog version {record.version}</span><span>Last updated {new Date(record.updated_at).toLocaleString()}</span>{dirty ? <span className="font-bold text-amber-700 dark:text-amber-300">Unsaved changes</span> : null}
        </div>
      </div>

      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-200"><AlertTriangle size={15} className="shrink-0" />{error}</div> : null}

      <details open className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Venue rental rates</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">These are the rates guests see and the base venue amounts used in new proposals.</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-[color:var(--portal-border)] p-4 sm:p-6">
          <div className="grid gap-4 xl:grid-cols-2">
            {DAY_GROUPS.map((day) => (
              <article key={day.id} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)]">{day.label}</h4>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {PERIODS.map((period) => (
                    <div key={period.id} className="min-w-0 space-y-2">
                      <MoneyInput draft={draft} field={{ label: period.label, path: ['luxor_costs', 'rental_rates', day.id, period.id] }} onChange={update} />
                      <label className="flex min-h-8 items-center gap-2 text-[10px] font-semibold text-[color:var(--portal-muted)]"><input type="checkbox" checked={catalogValue(draft, 'luxor_costs', 'rental_rate_rules', day.id, period.id, 'public') !== false} onChange={(event) => update(['luxor_costs', 'rental_rate_rules', day.id, period.id, 'public'], event.target.checked)} className="h-4 w-4 accent-[#caa24c]" /> Show publicly</label>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 border-t border-[color:var(--portal-border)] pt-4 sm:grid-cols-2">
                  <MoneyInput draft={draft} field={{ label: 'Additional hour', path: ['luxor_costs', 'additional_time_rates', day.id], optional: true }} onChange={update} />
                  {day.id === 'monday_thursday' ? <>
                    <MoneyInput draft={draft} field={{ label: 'Daytime hourly rate', path: ['luxor_costs', 'rental_rate_rules', day.id, 'morning', 'hourly_rate'] }} onChange={update} />
                    <label className="block space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Minimum hours</span><input type="number" min="1" step="1" value={String(catalogNumber(draft, 'luxor_costs', 'rental_rate_rules', day.id, 'morning', 'minimum_hours') ?? '')} onChange={(event) => update(['luxor_costs', 'rental_rate_rules', day.id, 'morning', 'minimum_hours'], Number(event.target.value))} className={inputClass} /></label>
                    {!customTimeV4Ready ? <div className="sm:col-span-2 rounded-lg border border-[#caa24c]/20 bg-[color:var(--portal-card)] p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">Custom Time pricing</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <MoneyInput draft={draft} field={{ label: 'Base hourly rate', path: ['luxor_costs', 'weekday_custom_rental', 'hourly_rate'], suffix: 'for the initial hours' }} onChange={update} />
                        <label className="block space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Minimum billed hours</span><input type="number" min="1" max="19" step="1" value={String(catalogNumber(draft, 'luxor_costs', 'weekday_custom_rental', 'minimum_hours') ?? '')} onChange={(event) => update(['luxor_costs', 'weekday_custom_rental', 'minimum_hours'], Number(event.target.value))} className={inputClass} /></label>
                        <MoneyInput draft={draft} field={{ label: 'Minimum rental price', path: ['luxor_costs', 'weekday_custom_rental', 'minimum_price'] }} onChange={update} />
                        <MoneyInput draft={draft} field={{ label: 'Each additional hour', path: ['luxor_costs', 'weekday_custom_rental', 'additional_hour_rate'] }} onChange={update} />
                      </div>
                      <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">Custom rentals shorter than the minimum billed hours still use the minimum price. Extra whole hours use the additional-hour rate. Existing sent proposals retain their saved totals.</p>
                    </div> : null}
                  </> : null}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 grid gap-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:grid-cols-3">
            {PERIODS.map((period) => <div key={period.id} className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{period.label} access</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[9px] font-bold text-[color:var(--portal-faint)]">Starts<input type="time" value={String(catalogValue(draft, 'luxor_costs', 'rental_access', period.id, 'start') || '')} onChange={(event) => update(['luxor_costs', 'rental_access', period.id, 'start'], event.target.value)} className={`${inputClass} mt-1 px-2 text-xs`} /></label><label className="text-[9px] font-bold text-[color:var(--portal-faint)]">Ends<input type="time" value={String(catalogValue(draft, 'luxor_costs', 'rental_access', period.id, 'end') || '')} onChange={(event) => update(['luxor_costs', 'rental_access', period.id, 'end'], event.target.value)} className={`${inputClass} mt-1 px-2 text-xs`} /></label></div></div>)}
          </div>
        </div>
      </details>

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Custom Time rates by day</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">{customTimeV4Ready ? 'These are the current Custom Time rates. Existing fixed rental rates and sent proposals are unchanged.' : 'V4 rates are staged for the reviewed booking guard. The weekday settings above remain current until both V4 gates are ready.'} Weekend rentals use the configured minimum hours at the day-specific base price, then the configured additional-hour rate.</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:grid-cols-2 sm:p-6">
          {DAY_GROUPS.map((day) => {
            const path = ['luxor_costs', 'custom_time_rental_v4', day.id]
            const enabled = catalogValue(draft, ...path, 'enabled') === true
            const minimumPrice = catalogNumber(draft, ...path, 'minimum_price')
            const minimumHours = catalogNumber(draft, ...path, 'minimum_hours')
            const weekdayHourlyRateValue = catalogValue(draft, ...path, 'hourly_rate')
            const weekdayHourlyRate = weekdayHourlyRateValue === null ? null : catalogNumber(draft, ...path, 'hourly_rate') ?? (minimumPrice != null && minimumHours ? Math.round(minimumPrice / minimumHours * 100) / 100 : day.id === 'monday_thursday' ? 400 : null)
            const shownMinimumHours = minimumHours ?? (day.id === 'monday_thursday' && catalogValue(draft, ...path, 'minimum_hours') === undefined ? day.minimumHours : null)
            const shownMinimumPrice = minimumPrice ?? (day.id === 'monday_thursday' && catalogValue(draft, ...path, 'minimum_price') === undefined ? Math.round((weekdayHourlyRate ?? 400) * (shownMinimumHours ?? day.minimumHours) * 100) / 100 : null)
            return <article key={day.id} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)]">{day.label}</h4><label className="flex min-h-10 items-center gap-2 text-[10px] font-semibold text-[color:var(--portal-muted)]"><input type="checkbox" checked={enabled} onChange={(event) => toggleCustomTimeDay(path, event.target.checked)} className="h-4 w-4 accent-[#caa24c]" /> Enable Custom Time</label></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {day.id === 'monday_thursday' ? <MoneyInput draft={draft} field={{ label: 'Base hourly rate', path: [...path, 'hourly_rate'], step: '0.01' }} onChange={(_fieldPath, value) => updateWeekdayCustomTime('hourly_rate', value)} valueOverride={weekdayHourlyRate} /> : <MoneyInput draft={draft} field={{ label: 'Minimum rental price', path: [...path, 'minimum_price'], optional: true }} onChange={update} />}
                <label className="block space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Minimum billed hours</span><input type="number" min="1" max="19" step="1" value={String(shownMinimumHours ?? '')} onChange={(event) => day.id === 'monday_thursday' ? updateWeekdayCustomTime('minimum_hours', event.target.value === '' ? null : Number(event.target.value)) : update([...path, 'minimum_hours'], event.target.value === '' ? null : Number(event.target.value))} className={inputClass} /></label>
                <MoneyInput draft={draft} field={{ label: 'Each additional hour', path: [...path, 'additional_hour_rate'], optional: true }} onChange={update} />
                <label className="flex min-h-11 items-center gap-2 self-end text-[10px] font-semibold text-[color:var(--portal-muted)]"><input type="checkbox" checked={catalogValue(draft, ...path, 'show_publicly') === true} onChange={(event) => update([...path, 'show_publicly'], event.target.checked)} className="h-4 w-4 accent-[#caa24c]" /> Show Custom Time starting price publicly</label>
              </div>
                  <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">{day.id === 'monday_thursday' ? `The minimum price is ${shownMinimumPrice != null ? `$${shownMinimumPrice.toFixed(2)}` : 'set by the base hourly rate'} for ${shownMinimumHours ?? 'the configured'} minimum billed hours; each additional hour uses the editable extra-hour rate.` : `The base price covers the first ${minimumHours ?? 'configured'} minimum billed hours, then each additional hour uses the editable extra-hour rate.`} Venue access is 6:00 AM-1:00 AM the next day. Security uses the actual guest arrival to event end at the configured hourly rate.</p>
              {enabled && !catalogNumber(draft, ...path, 'minimum_price') ? <p role="status" className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Set {day.id === 'monday_thursday' ? 'the' : `${day.label}'s`} base price before enabling this Custom Time day.</p> : null}
            </article>
          })}
        </div>
      </details>

      {MONEY_GROUPS.map((group) => (
        <details key={group.title} className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">{group.title}</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">{group.description}</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
          <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">{group.fields.map((field) => <MoneyInput key={field.path.join('.')} draft={draft} field={field} onChange={update} />)}</div>
          {group.subgroups?.map((subgroup) => (
            <div key={subgroup.title} className="border-t border-[color:var(--portal-border)] p-4 sm:p-6">
              <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--portal-text)]">{subgroup.title}</h4>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{subgroup.description}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{subgroup.fields.map((field) => <MoneyInput key={field.path.join('.')} draft={draft} field={field} onChange={update} />)}</div>
            </div>
          ))}
        </details>
      ))}

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Proposal packages</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">These versioned settings price the new Essentials, Signature, Luxor, and Customized proposal choices. Saving here affects new proposals; sent proposals retain their saved pricing snapshot.</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:p-6 xl:grid-cols-2">
          {LUXOR_PROPOSAL_PACKAGE_IDS.map((packageId) => {
            const optionPath = ['luxor_costs', 'package_selection_v1', 'options', packageId]
            const tiers = (catalogValue(draft, ...optionPath, 'price_tiers') as Array<Record<string, unknown>> | undefined) || []
            return <article key={packageId} className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)]">{String(catalogValue(draft, ...optionPath, 'name') || packageId)}</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([
                  ['Name', 'name'], ['Positioning', 'positioning'], ['Description', 'description'],
                  ['Card heading', 'summary_title'], ['Card summary', 'summary'],
                ] as const).map(([label, field]) => <label key={field} className="block min-w-0 space-y-1.5">
                  <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{label}</span>
                  {field === 'description' || field === 'summary' ? <textarea value={String(catalogValue(draft, ...optionPath, field) || '')} onChange={(event) => update([...optionPath, field], event.target.value)} className={`${inputClass} min-h-20 resize-y py-2`} /> : <input type="text" value={String(catalogValue(draft, ...optionPath, field) || '')} onChange={(event) => update([...optionPath, field], event.target.value)} className={inputClass} />}
                </label>)}
                {packageId === 'luxor' ? <label className="block min-w-0 space-y-1.5 sm:col-span-2"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Most Popular badge</span><input type="text" value={String(catalogValue(draft, ...optionPath, 'most_popular_label') || '')} onChange={(event) => update([...optionPath, 'most_popular_label'], event.target.value)} className={inputClass} /></label> : null}
                <label className="block min-w-0 space-y-1.5 sm:col-span-2"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Inclusions (one per line; use %rental_hours% for venue hours)</span><textarea value={Array.isArray(catalogValue(draft, ...optionPath, 'inclusions')) ? (catalogValue(draft, ...optionPath, 'inclusions') as string[]).join('\n') : ''} onChange={(event) => update([...optionPath, 'inclusions'], event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} className={`${inputClass} min-h-32 resize-y py-2`} /></label>
              </div>
              {tiers.map((tier, index) => <div key={`${packageId}-tier-${index}`} className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:grid-cols-3">
                <label className="block space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Tier {index + 1} starts at guests</span><input type="number" min="0" step="1" value={String(tier.min_guests ?? '')} onChange={(event) => update([...optionPath, 'price_tiers', index, 'min_guests'], event.target.value === '' ? null : Number(event.target.value))} className={inputClass} /></label>
                <label className="block space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Tier {index + 1} ends at guests</span><input type="number" min="0" step="1" value={String(tier.max_guests ?? '')} onChange={(event) => update([...optionPath, 'price_tiers', index, 'max_guests'], event.target.value === '' ? null : Number(event.target.value))} className={inputClass} /></label>
                <MoneyInput draft={draft} field={{ label: `Tier ${index + 1} package fee`, path: [...optionPath, 'price_tiers', index, 'amount'] }} onChange={update} />
              </div>)}
              {tiers.length === 0 ? <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">No package fee. Customized additions use their existing approved catalog prices.</p> : null}
            </article>
          })}
        </div>
      </details>

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Sales tax</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Stored as a percentage and applied to taxable proposal line items.</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-[color:var(--portal-border)] p-4 sm:p-6"><label className="block max-w-xs space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Sales tax rate</span><span className="relative block"><input aria-label="Sales tax rate" type="number" min="0" max="100" step="0.01" value={String((catalogNumber(draft, 'luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate') ?? 0) * 100)} onChange={(event) => update(['luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate'], Number(event.target.value) / 100)} className={`${inputClass} pr-9`} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--portal-faint)]">%</span></span></label></div>
      </details>
    </section>
  )
}
