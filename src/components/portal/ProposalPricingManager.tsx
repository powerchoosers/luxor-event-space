'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ExternalLink, RefreshCw, Save } from 'lucide-react'
import { PortalButton, PortalSkeleton } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { catalogNumber, catalogValue, setCatalogValue, type PricingCatalog } from '@/lib/luxorPricingCatalog'

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
}

type FieldGroup = {
  title: string
  description: string
  fields: FieldDefinition[]
}

const DAY_GROUPS = [
  { id: 'monday_thursday', label: 'Monday – Thursday' },
  { id: 'friday', label: 'Friday' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday', label: 'Sunday' },
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
      ...[0, 1, 2].map((index) => ({ label: `Cleaning ${index === 0 ? '1–75' : index === 1 ? '76–150' : '151–200'} guests`, path: ['luxor_costs', 'required_fees', 'cleaning', 'retail', index, 'amount'] })),
      ...[0, 1].map((index) => ({ label: `Security ${index === 0 ? '1–150' : '151–200'} guests`, path: ['luxor_costs', 'required_fees', 'security', 'retail', index, 'amount'] })),
      { label: 'Refundable security deposit', path: ['luxor_costs', 'security_deposit', 'amount'] },
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

function MoneyInput({ draft, field, onChange }: { draft: PricingCatalog; field: FieldDefinition; onChange: (path: FieldDefinition['path'], value: number | null) => void }) {
  const value = catalogValue(draft, ...field.path)
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{field.label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[color:var(--portal-faint)]">$</span>
        <input aria-label={field.label} type="number" min="0" step={field.step || '1'} value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(field.path, event.target.value === '' ? null : Number(event.target.value))} className={`${inputClass} pl-7 ${field.suffix ? 'pr-14' : ''}`} />
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

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const response = await fetch('/api/proposal-pricing', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load the pricing catalog.')
      setRecord(payload)
      setDraft(structuredClone(payload.config))
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the pricing catalog.')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => Boolean(record && draft && JSON.stringify(record.config) !== JSON.stringify(draft)), [draft, record])
  const update = (path: Array<string | number>, value: unknown) => setDraft((current) => current ? setCatalogValue(current, path, value) : current)

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
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Saving here updates new proposal calculations, Elena’s pricing context, and the customer-facing rental rates page. Proposals already published keep their original pricing snapshot.</p>
            <a href="/pricing" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#9a6d26] hover:text-[#caa24c] dark:text-[#e0bd67]">Preview customer pricing <ExternalLink size={12} /></a>
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

      {MONEY_GROUPS.map((group) => (
        <details key={group.title} className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">{group.title}</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">{group.description}</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
          <div className="grid gap-4 border-t border-[color:var(--portal-border)] p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">{group.fields.map((field) => <MoneyInput key={field.path.join('.')} draft={draft} field={field} onChange={update} />)}</div>
        </details>
      ))}

      <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Sales tax</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Stored as a percentage and applied to taxable proposal line items.</span></span><ChevronDown size={17} className="mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-[color:var(--portal-border)] p-4 sm:p-6"><label className="block max-w-xs space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Sales tax rate</span><span className="relative block"><input aria-label="Sales tax rate" type="number" min="0" max="100" step="0.01" value={String((catalogNumber(draft, 'luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate') ?? 0) * 100)} onChange={(event) => update(['luxor_costs', 'taxes_and_processing_fees', 'sales_tax_rate'], Number(event.target.value) / 100)} className={`${inputClass} pr-9`} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--portal-faint)]">%</span></span></label></div>
      </details>
    </section>
  )
}
