'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Eye,
  FileText,
  Mail,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import {
  catalogItemToLineItem,
  getPackagePresetTotal,
  LUXOR_PACKAGE_PRESETS,
  LUXOR_SERVICE_CATALOG,
  packagePresetToLineItems,
  type LuxorPackagePreset,
} from '@/lib/luxorServiceCatalog'
import { PortalDatePicker, PortalModal, PortalCloseButton } from '@/components/portal/PortalUI'

type ProposalSubmitAction = 'save' | 'email'

type ProposalBuilderModalProps = {
  isOpen: boolean
  onClose: () => void
  clientName: string
  clientEmail?: string | null
  eventType?: string | null
  eventDate?: string | null
  description: string
  onDescriptionChange: (value: string) => void
  dueDate: string
  onDueDateChange: (value: string) => void
  items: LuxorInvoiceLineItem[]
  onItemsChange: (items: LuxorInvoiceLineItem[]) => void
  notes: string
  onNotesChange: (value: string) => void
  taxRate: string
  onTaxRateChange: (value: string) => void
  submitting: boolean
  onSubmit: (action: ProposalSubmitAction) => void
}

const formatMoney = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: value % 1 === 0 ? 0 : 2,
}).format(value)

function formatEventDate(value?: string | null) {
  if (!value) return 'Date to be confirmed'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function isSamePreset(items: LuxorInvoiceLineItem[], preset: LuxorPackagePreset) {
  const currentIds = new Set(items.map((item) => item.catalogId).filter(Boolean))
  const presetItems = packagePresetToLineItems(preset)
  return currentIds.size === presetItems.length && presetItems.every((item) => currentIds.has(item.catalogId))
}

export function ProposalBuilderModal({
  isOpen,
  onClose,
  clientName,
  clientEmail,
  eventType,
  eventDate,
  description,
  onDescriptionChange,
  dueDate,
  onDueDateChange,
  items,
  onItemsChange,
  notes,
  onNotesChange,
  taxRate,
  onTaxRateChange,
  submitting,
  onSubmit,
}: ProposalBuilderModalProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [activeView, setActiveView] = useState<'builder' | 'details' | 'preview'>('builder')

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(LUXOR_SERVICE_CATALOG.map((item) => item.category)))],
    [],
  )

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return LUXOR_SERVICE_CATALOG.filter((item) => {
      const categoryMatches = activeCategory === 'All' || item.category === activeCategory
      const searchMatches = !query || `${item.name} ${item.category}`.toLowerCase().includes(query)
      return categoryMatches && searchMatches
    })
  }, [activeCategory, search])

  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const tax = subtotal * (Math.max(0, Number(taxRate) || 0) / 100)
  const total = subtotal + tax
  const selectedCatalogIds = new Set(items.map((item) => item.catalogId).filter(Boolean))
  const activePreset = LUXOR_PACKAGE_PRESETS.find((preset) => isSamePreset(items, preset))

  const applyPreset = (preset: LuxorPackagePreset) => {
    onItemsChange(packagePresetToLineItems(preset))
    if (!description.trim()) onDescriptionChange(`${eventType || 'Event'} — ${preset.name} package`)
  }

  const toggleCatalogItem = (catalogId: string) => {
    if (selectedCatalogIds.has(catalogId)) {
      const remaining = items.filter((item) => item.catalogId !== catalogId)
      onItemsChange(remaining.length ? remaining : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }])
      return
    }

    const catalogItem = LUXOR_SERVICE_CATALOG.find((item) => item.id === catalogId)
    if (!catalogItem) return
    const nextItem = catalogItemToLineItem(catalogItem)
    const replaceBlank = items.length === 1 && !items[0].description.trim() && items[0].unitPrice === 0
    onItemsChange(replaceBlank ? [nextItem] : [...items, nextItem])
  }

  const updateItem = (index: number, field: 'description' | 'quantity' | 'unitPrice', value: string) => {
    const next = [...items]
    const item = { ...next[index] }
    if (field === 'description') item.description = value
    if (field === 'quantity') item.quantity = Math.max(1, Number(value) || 1)
    if (field === 'unitPrice') item.unitPrice = Math.max(0, Number(value) || 0)
    item.total = item.quantity * item.unitPrice
    next[index] = item
    onItemsChange(next)
  }

  const addCustomItem = () => {
    const customItem: LuxorInvoiceLineItem = {
      category: 'Custom',
      description: 'Custom service',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    }
    const replaceBlank = items.length === 1 && !items[0].description.trim()
    onItemsChange(replaceBlank ? [customItem] : [...items, customItem])
  }

  const removeItem = (index: number) => {
    const remaining = items.filter((_, itemIndex) => itemIndex !== index)
    onItemsChange(remaining.length ? remaining : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }])
  }

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} ariaLabel="Proposal builder" maxWidth="max-w-[1560px]">
      <div className="flex h-[calc(100dvh-2rem)] max-h-[94vh] min-h-0 flex-col bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] sm:h-[90vh]">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a]">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#a8792f] dark:text-[#caa24c]">Luxor Event Space</p>
              <h2 className="truncate text-sm font-black uppercase tracking-[0.12em] sm:text-base">Proposal Builder</h2>
            </div>
          </div>

          {/* Tablet & Mobile View Switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1 xl:hidden">
            <button
              type="button"
              onClick={() => setActiveView('builder')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                activeView === 'builder'
                  ? 'bg-[#caa24c] text-black shadow-sm'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <Sparkles size={12} />
              <span className="hidden sm:inline">Services &</span> Items
            </button>
            <button
              type="button"
              onClick={() => setActiveView('details')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                activeView === 'details'
                  ? 'bg-[#caa24c] text-black shadow-sm'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <FileText size={12} />
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveView('preview')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                activeView === 'preview'
                  ? 'bg-[#caa24c] text-black shadow-sm'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <Eye size={12} />
              Preview
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] xl:inline-flex">
              Internal prices private
            </span>
            <PortalCloseButton onClick={onClose} aria-label="Close proposal builder" />
          </div>
        </header>

        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto xl:grid xl:grid-cols-[250px_minmax(520px,1fr)_320px] xl:overflow-hidden">
          {/* Left Column: Proposal details */}
          <aside className={`${activeView === 'details' ? 'block' : 'hidden'} xl:block border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 xl:overflow-y-auto xl:border-b-0 xl:border-r sm:p-5`}>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Proposal details</p>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Title</span>
                <input required value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Event proposal" className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/15" />
              </label>
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Valid until</span>
                <PortalDatePicker value={dueDate} onChange={onDueDateChange} className="w-full" placeholder="Select date" />
              </div>
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Client</p>
                <p className="mt-1 text-sm font-bold">{clientName}</p>
                <p className="mt-0.5 truncate text-[11px] text-[color:var(--portal-muted)]">{clientEmail || 'No email on file'}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Event</p>
                <p className="mt-1 text-sm font-bold">{eventType || 'Event booking'}</p>
                <p className="mt-0.5 text-[11px] text-[color:var(--portal-muted)]">{formatEventDate(eventDate)}</p>
              </div>
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Client notes</span>
                <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional note shown on the proposal" className="min-h-24 w-full resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-sm leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/15" />
              </label>
            </div>
          </aside>

          {/* Main Workspace Column: Package Presets, Service Library & Selected Items */}
          <main className={`${activeView === 'builder' ? 'block' : 'hidden'} xl:block min-h-0 flex-1 p-4 xl:overflow-y-auto sm:p-5 xl:p-6`}>
            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Start with a package</p>
                  <h3 className="mt-1 text-base font-black">Select everything at once, then adjust it</h3>
                </div>
                {activePreset ? <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 sm:flex"><Check size={12} /> {activePreset.name} selected</span> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {LUXOR_PACKAGE_PRESETS.map((preset) => {
                  const selected = activePreset?.id === preset.id
                  return (
                    <button key={preset.id} type="button" onClick={() => applyPreset(preset)} className={`min-h-24 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${selected ? 'border-[#caa24c] bg-[#caa24c]/12 shadow-[0_0_0_1px_rgba(202,162,76,0.15)]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/45'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">{preset.eyebrow}</span>
                        {selected ? <Check size={15} className="text-[#a8792f] dark:text-[#f1d27a]" /> : <ChevronRight size={15} className="text-[color:var(--portal-muted)]" />}
                      </div>
                      <p className="mt-2 text-sm font-black">{preset.name}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(getPackagePresetTotal(preset))}</p>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">Package prices use the Friday evening example. Change the rental or any service below for the actual event.</p>
            </section>

            <section className="mt-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Service library</p>
                  <h3 className="mt-1 text-base font-black">Tap to add or remove</h3>
                </div>
                <div className="relative sm:w-72">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services..." className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-9 pr-3 text-sm outline-none focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/15" />
                </div>
              </div>

              {/* Refined Category Filter Pills with Touch Scroll */}
              <div className="relative mt-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 touch-pan-x scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {categories.map((category) => {
                    const isActive = activeCategory === category
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setActiveCategory(category)}
                        className={`min-h-9 shrink-0 rounded-xl border px-3.5 text-[10px] uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${
                          isActive
                            ? 'border-[#caa24c] bg-[#caa24c]/15 text-[#8c6529] dark:text-[#f1d27a] font-black shadow-sm'
                            : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] font-bold hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                        }`}
                      >
                        {category}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleServices.map((service) => {
                  const selected = selectedCatalogIds.has(service.id)
                  return (
                    <button key={service.id} type="button" onClick={() => toggleCatalogItem(service.id)} className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${selected ? 'border-[#caa24c]/60 bg-[#caa24c]/10' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/35'}`}>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[11px] font-bold leading-4">{service.name}</span>
                        <span className="mt-1 block font-mono text-[10px] text-[color:var(--portal-muted)]">{service.unitPrice === null ? 'Set price' : formatMoney(service.unitPrice)}</span>
                      </span>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-[#caa24c] text-white' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                        {selected ? <Check size={14} /> : <Plus size={14} />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="mt-7 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Internal pricing</p>
                  <h3 className="mt-1 text-base font-black">Selected line items</h3>
                </div>
                <button type="button" onClick={addCustomItem} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#caa24c]/35 bg-[#caa24c]/10 px-4 text-[10px] font-black uppercase tracking-wider text-[#8c6529] dark:text-[#f1d27a]"><Plus size={15} /> Custom item</button>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div key={`${item.catalogId || 'custom'}-${index}`} className="grid gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:grid-cols-[minmax(180px,1fr)_76px_110px_90px_42px] sm:items-center">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">{item.category || 'Custom'}</span>
                      <input required value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs font-bold outline-none focus:border-[#caa24c]/60" />
                    </div>
                    {item.included ? (
                      <div className="sm:col-span-3"><span className="inline-flex min-h-9 items-center rounded-full bg-emerald-500/10 px-3 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Included</span></div>
                    ) : (
                      <>
                        <label><span className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Qty</span><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 text-center font-mono text-xs outline-none focus:border-[#caa24c]/60" /></label>
                        <label><span className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Unit price</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 text-right font-mono text-xs outline-none focus:border-[#caa24c]/60" /></label>
                        <div><span className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Line total</span><p className="mt-2.5 truncate text-right font-mono text-xs font-bold">{formatMoney(item.total)}</p></div>
                      </>
                    )}
                    <button type="button" onClick={() => removeItem(index)} aria-label={`Remove ${item.description || 'line item'}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 sm:flex-row sm:items-center sm:justify-end">
                <label className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] sm:justify-start">Tax rate <span className="flex items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><input type="number" min="0" step="0.01" value={taxRate} onChange={(event) => onTaxRateChange(event.target.value)} className="min-h-10 w-20 bg-transparent px-2 text-right font-mono text-xs outline-none" /><span className="pr-2">%</span></span></label>
                <span className="hidden h-8 w-px bg-[color:var(--portal-border)] sm:block" />
                <div className="flex items-baseline justify-between gap-4 sm:justify-start"><span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Internal total</span><span className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(total)}</span></div>
              </div>
            </section>
          </main>

          {/* Right Column: Client preview */}
          <aside className={`${activeView === 'preview' ? 'block' : 'hidden'} xl:block border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 xl:overflow-y-auto xl:border-l xl:border-t-0 sm:p-5`}>
            <div className="flex items-center justify-between">
              <div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Client preview</p><p className="mt-1 text-xs font-bold">What they will see</p></div>
              <Eye size={17} className="text-[#a8792f] dark:text-[#caa24c]" />
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl shadow-black/5">
              <div className="border-b border-[#caa24c]/20 bg-[#17110d] px-5 py-6 text-center text-white">
                <p className="font-serif text-lg tracking-[0.18em] text-[#f1d27a]">LUXOR</p>
                <p className="mt-1 text-[7px] uppercase tracking-[0.32em] text-white/65">Event Space</p>
              </div>
              <div className="p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f]">Event proposal</p>
                <h4 className="mt-2 text-lg font-black leading-6">{description || `${eventType || 'Event'} proposal`}</h4>
                <p className="mt-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">Prepared for {clientName}<br />{formatEventDate(eventDate)}</p>
                <div className="my-5 h-px bg-[color:var(--portal-border)]" />
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Included services</p>
                <ul className="mt-3 space-y-2.5">
                  {items.filter((item) => item.description.trim()).map((item, index) => (
                    <li key={`${item.description}-${index}`} className="flex gap-2 text-[11px] leading-4"><Check size={13} className="mt-0.5 shrink-0 text-[#a8792f]" /><span>{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</span></li>
                  ))}
                </ul>
                <div className="my-5 h-px bg-[color:var(--portal-border)]" />
                <div className="flex items-end justify-between gap-3"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Total investment</span><span className="font-mono text-xl font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(total)}</span></div>
                <p className="mt-3 rounded-lg bg-[#caa24c]/8 p-2.5 text-[9px] leading-4 text-[color:var(--portal-muted)]">Individual item prices are intentionally hidden from the client. Only this total appears in the proposal and invoice.</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-[10px] leading-4 text-emerald-800 dark:text-emerald-200"><PackageCheck size={15} className="mt-0.5 shrink-0" /><span>The emailed PDF uses this same client-safe item list.</span></div>
          </aside>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <div><p className="text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Proposal total</p><p className="font-mono text-lg font-black text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(total)}</p></div>
            <div className="hidden items-center gap-2 text-[10px] text-[color:var(--portal-muted)] lg:flex"><Sparkles size={14} className="text-[#a8792f]" /> Prices stay inside the CRM.</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={() => onSubmit('save')} disabled={submitting} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 text-[10px] font-black uppercase tracking-wider transition hover:border-[#caa24c]/45 disabled:opacity-40"><FileText size={15} /> Save proposal</button>
            <button type="button" onClick={() => onSubmit('email')} disabled={submitting || !clientEmail} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-[#b98a3e]/20 transition hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-40"><Mail size={15} /> {submitting ? 'Saving…' : 'Save & email'}</button>
          </div>
        </footer>
      </div>
    </PortalModal>
  )
}
