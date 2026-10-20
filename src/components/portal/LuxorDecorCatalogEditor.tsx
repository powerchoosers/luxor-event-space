'use client'

import { Plus, Trash2 } from 'lucide-react'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { LUXOR_DECOR_CATEGORIES, type LuxorDecorCatalogItem, type LuxorDecorPricingUnit } from '@/lib/luxorDecorCatalogV2'

const inputClass = 'min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10'
const packageOptions = [
  { id: 'essentials', name: 'Essentials' },
  { id: 'signature', name: 'Signature' },
  { id: 'luxor', name: 'Luxor' },
  { id: 'customized', name: 'Customized' },
] as const
const unitOptions = [
  { value: 'order', label: 'Per order' },
  { value: 'set', label: 'Per set' },
  { value: 'each', label: 'Each' },
  { value: 'letter', label: 'Per letter' },
  { value: 'arch', label: 'Per arch' },
] as const

export function LuxorDecorCatalogEditor({ items, onChange }: { items: LuxorDecorCatalogItem[]; onChange: (items: LuxorDecorCatalogItem[]) => void }) {
  const update = (id: string, patch: Partial<LuxorDecorCatalogItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const add = () => {
    const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replaceAll('-', '') : Date.now().toString(36)
    const item: LuxorDecorCatalogItem = {
      id: 'addon_' + token,
      name: '',
      description: '',
      category: 'premium_add_ons',
      amount: 1,
      pricing_unit: 'order',
      minimum_quantity: 1,
      active: true,
      included_in_packages: [],
      display_order: items.reduce((max, current) => Math.max(max, current.display_order), 0) + 1,
    }
    onChange([...items, item])
  }

  return <details className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 sm:px-6"><span><span className="block text-sm font-bold text-[color:var(--portal-text)]">Decor add-on catalog</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Manage the active catalog used for new proposals. Deactivating an item keeps its saved proposal history intact.</span></span><span className="text-xs text-[color:var(--portal-muted)]">{items.filter((item) => item.active).length} active</span></summary>
    <div className="space-y-5 border-t border-[color:var(--portal-border)] p-4 sm:p-6">
      {LUXOR_DECOR_CATEGORIES.map((category) => <section key={category.id} aria-label={category.label}>
        <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6529] dark:text-[#f1d27a]">{category.label}</h4>
        <div className="mt-3 space-y-3">
          {items.filter((item) => item.category === category.id).sort((a, b) => a.display_order - b.display_order).map((item) => <article key={item.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Item name</span><input aria-label={`${item.id} item name`} value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} className={inputClass} /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Description</span><input aria-label={`${item.id} description`} value={item.description} onChange={(event) => update(item.id, { description: event.target.value })} className={inputClass} /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Category</span><PortalSelect value={item.category} onChange={(value) => update(item.id, { category: value as LuxorDecorCatalogItem['category'] })} options={LUXOR_DECOR_CATEGORIES.map((entry) => ({ value: entry.id, label: entry.label }))} className="w-full" /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Price</span><input aria-label={`${item.id} price`} type="number" min="0.01" step="0.01" value={Number.isFinite(item.amount) ? item.amount : ''} onChange={(event) => update(item.id, { amount: event.target.value === '' ? Number.NaN : Number(event.target.value) })} className={inputClass} /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Pricing unit</span><PortalSelect value={item.pricing_unit} onChange={(value) => update(item.id, { pricing_unit: value as LuxorDecorPricingUnit })} options={[...unitOptions]} className="w-full" /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Minimum quantity</span><input aria-label={`${item.id} minimum quantity`} type="number" min="1" step="1" value={item.minimum_quantity} onChange={(event) => update(item.id, { minimum_quantity: Number(event.target.value) })} className={inputClass} /></label>
              <label className="block space-y-1"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Display order</span><input aria-label={`${item.id} display order`} type="number" min="1" step="1" value={item.display_order} onChange={(event) => update(item.id, { display_order: Number(event.target.value) })} className={inputClass} /></label>
              <div className="flex items-end justify-between gap-3"><label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-[color:var(--portal-text)]"><input type="checkbox" checked={item.active} onChange={(event) => update(item.id, { active: event.target.checked })} className="h-4 w-4 accent-[#caa24c]" />Active</label><PortalButton type="button" variant="ghost" onClick={() => update(item.id, { active: false })} disabled={!item.active} aria-label={`Remove ${item.name || 'add-on'} from active catalog`}><Trash2 size={14} /> Deactivate</PortalButton></div>
            </div>
            <fieldset className="mt-3 border-t border-[color:var(--portal-border)] pt-3"><legend className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Included in packages</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{packageOptions.map((pkg) => <label key={pkg.id} className="flex items-center gap-2 text-xs text-[color:var(--portal-text)]"><input type="checkbox" checked={item.included_in_packages.includes(pkg.id)} onChange={(event) => update(item.id, { included_in_packages: event.target.checked ? [...new Set([...item.included_in_packages, pkg.id])] : item.included_in_packages.filter((id) => id !== pkg.id) })} className="h-4 w-4 accent-[#caa24c]" />{pkg.name}</label>)}</div></fieldset>
          </article>)}
          {!items.some((item) => item.category === category.id) ? <p className="rounded-lg border border-dashed border-[color:var(--portal-border)] px-3 py-4 text-xs text-[color:var(--portal-muted)]">No add-ons in this category.</p> : null}
        </div>
      </section>)}
      <PortalButton type="button" variant="secondary" onClick={add}><Plus size={14} /> Add Add-on</PortalButton>
    </div>
  </details>
}
