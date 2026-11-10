'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import BillDetailsPanel from '@/components/portal/BillDetailsPanel'
import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'
import { ArrowUpRight, Building2, ChevronRight } from '@/lib/icons/phosphor-compat'
import { PortalFilterBar, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import VendorBillsProfile from '@/components/portal/VendorBillsProfile'
import type { LuxorBill, LuxorVendor } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'
import { groupUnlinkedRecurringProviders, suggestsRecurringBill } from '@/lib/luxorRecurringBillSuggestion'
import { lookupBillProviderWebsite, lookupProviderWebsite, lookupScheduleProviderWebsite, type WebsiteSuggestion } from '@/lib/luxorProviderWebsiteLookupClient'

function billAmount(bill: LuxorBill) {
  if (bill.amount_state !== 'known' || bill.amount == null || String(bill.amount).trim() === '' || !Number.isFinite(Number(bill.amount)) || Number(bill.amount) < 0) return 'Amount unknown'
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: bill.currency || 'USD' }).format(Number(bill.amount)) }
  catch { return `${Number(bill.amount).toFixed(2)} ${bill.currency || 'USD'}` }
}

function candidateWebsiteKey(group: ReturnType<typeof groupUnlinkedRecurringProviders>[number]) {
  const bill = group.bills.find(suggestsRecurringBill)
  if (bill) return JSON.stringify(['v4', group.key, 'bill', bill.id, bill.updated_at])
  const schedule = group.schedules[0]
  return schedule ? JSON.stringify(['v4', group.key, 'schedule', schedule.id, schedule.updated_at]) : ''
}

function candidateSummary(group: ReturnType<typeof groupUnlinkedRecurringProviders>[number]) {
  const parts: string[] = []
  if (group.schedules.length) parts.push(`${group.schedules.length} recurring ${group.schedules.length === 1 ? 'cost' : 'costs'}`)
  if (group.bills.length) parts.push(`${group.bills.length} ${group.bills.length === 1 ? 'bill' : 'bills'}`)
  return parts.join(' · ')
}

function candidateSummaryShort(group: ReturnType<typeof groupUnlinkedRecurringProviders>[number]) {
  const schedules = group.schedules.map((schedule) => schedule.name.trim()).filter(Boolean)
  const bills = group.bills.map((bill) => bill.service?.trim()).filter((name): name is string => Boolean(name))
  const parts = [
    schedules.length ? `Recurring: ${schedules.join(', ')}` : '',
    group.bills.length ? `Bills: ${bills.length ? [...new Set(bills)].join(', ') : `${group.bills.length} to review`}` : '',
  ]
  return parts.filter(Boolean).join(' · ') || candidateSummary(group)
}

function vendorSavedSubtitle(vendor: LuxorVendor) {
  return vendor.vendor_type?.trim() || 'Saved company'
}

function CandidateWebsite({
  suggestion,
  websiteSearchError,
  onRetryLookup,
  onDismiss,
}: {
  suggestion?: WebsiteSuggestion
  websiteSearchError?: boolean
  onRetryLookup?: () => void
  onDismiss?: () => void
}) {
  if (!suggestion && !websiteSearchError) return null
  let hostname = ''
  if (suggestion) {
    try { hostname = new URL(suggestion.website).hostname } catch { hostname = suggestion.website }
  }
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[color:var(--portal-border)] pb-5">
      {suggestion ? (
        <div className="flex min-w-0 items-center gap-3"><ProviderIcon key={suggestion.website} website={suggestion.website} /><div className="min-w-0"><p className="text-xs font-medium text-[color:var(--portal-muted)]">Suggested website</p><a href={suggestion.website} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[color:var(--portal-text)] hover:underline">{hostname}<ArrowUpRight size={14} /></a></div></div>
      ) : null}
      {suggestion ? (
        <div className="flex flex-wrap items-center gap-x-4 text-xs">
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className="min-h-11 font-medium text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
              Not this site
            </button>
          ) : null}
        </div>
      ) : null}
      {websiteSearchError ? (
        <p role="status" className="mt-2 text-xs text-[color:var(--portal-muted)]">
          Some company websites could not be checked.{' '}
          {onRetryLookup ? (
            <button type="button" onClick={onRetryLookup} className="min-h-11 font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

function CandidateReview({ group, onOpenBill, onOpenSchedule }: { group: ReturnType<typeof groupUnlinkedRecurringProviders>[number]; onOpenBill: (id: string) => void; onOpenSchedule: (id: string) => void }) {
  return <section className="space-y-3" aria-label="Records">
    <h3 className="text-sm font-bold text-[color:var(--portal-text)]">Records</h3>
    <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Open a record to review its details.</p>
    <ul className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)]">
      {group.schedules.map((schedule) => <li key={`schedule:${schedule.id}`}><button type="button" onClick={() => onOpenSchedule(schedule.id)} className="flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-[color:var(--portal-text)]">{schedule.name}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">Recurring cost · {schedule.frequency}</span></span><ChevronRight size={16} className="shrink-0 text-[color:var(--portal-muted)]" /></button></li>)}
      {group.bills.map((bill) => <li key={`bill:${bill.id}`}><button type="button" onClick={() => onOpenBill(bill.id)} className="flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-[color:var(--portal-text)]">{bill.service || 'Bill'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">Bill · {billAmount(bill)}</span></span><ChevronRight size={16} className="shrink-0 text-[color:var(--portal-muted)]" /></button></li>)}
    </ul>
  </section>
}

function websiteSuggestionKey(vendorId: string) { return `v4:${vendorId}` }

function ProviderListGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{title}</p>
        <span className="text-[9px] text-[color:var(--portal-faint)]">{count}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)]">{children}</div>
    </div>
  )
}

function ProviderIcon({ website }: { website?: string | null }) {
  const [failed, setFailed] = useState(false)
  let domain = ''
  try {
    const url = new URL(website || '')
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) domain = url.hostname
  } catch { /* A provider without a saved website uses the fallback. */ }
  return <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">{domain && !failed ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} alt="" referrerPolicy="no-referrer" className="h-6 w-6 object-contain" onError={() => setFailed(true)} /> : <Building2 size={18} />}</span>
}

export default function ProvidersWorkspace() {
  const [data, setData] = useState<{ vendors: LuxorVendor[]; templates: LuxorExpenseTemplate[]; bills: LuxorBill[] } | null>(null)
  const [panelBillId, setPanelBillId] = useState<string | null>(null)
  const [panelScheduleId, setPanelScheduleId] = useState<string | null>(null)
  const [panelExpenseId, setPanelExpenseId] = useState<string | null>(null)
  const [importBillId, setImportBillId] = useState<string | null>(null)
  const [billRefreshKey, setBillRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'recurring' | 'all'>('recurring')
  const [selected, setSelected] = useState<LuxorVendor | null>(null)
  const [selectedOpen, setSelectedOpen] = useState(false)
  const [candidateOpen, setCandidateOpen] = useState(false)
  const [candidateSnapshot, setCandidateSnapshot] = useState<ReturnType<typeof groupUnlinkedRecurringProviders>[number] | null>(null)
  const [candidateKey, setCandidateKey] = useState<string | null>(null)
  const [websiteSuggestions, setWebsiteSuggestions] = useState<Record<string, string>>({})
  const [candidateWebsites, setCandidateWebsites] = useState<Record<string, WebsiteSuggestion>>({})
  const [websiteSearchError, setWebsiteSearchError] = useState(false)
  const [websiteRetry, setWebsiteRetry] = useState(0)
  const [dismissedCandidateWebsites, setDismissedCandidateWebsites] = useState<Record<string, true>>({})
  const onWebsiteSuggested = useCallback((vendorId: string, suggestion: { website: string; source: string } | null) => {
    setWebsiteSuggestions((current) => {
      const key = websiteSuggestionKey(vendorId)
      if (!suggestion) { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next }
      return current[key] === suggestion.website ? current : { ...current, [key]: suggestion.website }
    })
  }, [])
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/portal/bill-center', { cache: 'no-store' })
      if (!response.ok) throw new Error('Companies could not be loaded.')
      const result = await response.json()
      if (!Array.isArray(result.vendors) || !Array.isArray(result.templates) || !Array.isArray(result.bills)) throw new Error('Company records could not be verified.')
      setData({ vendors: result.vendors, templates: result.templates, bills: result.bills }); setError('')
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Companies could not be loaded.') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!data) return
    let live = true
    const recurringIds = new Set(data.templates.filter((item) => item.is_active && item.vendor_id).map((item) => item.vendor_id))
    for (const bill of data.bills) if (bill.vendor_id && suggestsRecurringBill(bill)) recurringIds.add(bill.vendor_id)
    const candidates = data.vendors.filter((vendor) => recurringIds.has(vendor.id) && !vendor.archived_at && !vendor.business_website && vendor.business_website !== undefined)
    // Search one at a time so opening the list cannot create an unbounded burst.
    // A confirmed website is never replaced and ambiguous results remain empty.
    void (async () => {
      let failed = false
      for (const vendor of candidates) {
        if (!live) return
        try {
          const suggestion = await lookupProviderWebsite(vendor)
          if (live) onWebsiteSuggested(vendor.id, suggestion)
        } catch { failed = true /* One failed lookup should not hide later providers. */ }
      }
      const names = data.vendors.filter((vendor) => recurringIds.has(vendor.id)).map((vendor) => vendor.name)
      for (const group of groupUnlinkedRecurringProviders(data.bills, data.templates, names)) {
        if (!live) return
        const bill = group.bills.find(suggestsRecurringBill)
        const schedule = group.schedules[0]
        if (!bill && !schedule) continue
        try {
          const suggestion = bill ? await lookupBillProviderWebsite(bill.id, bill.provider, bill.updated_at) : schedule ? await lookupScheduleProviderWebsite(schedule.id, schedule.vendor_name || '', schedule.updated_at) : null
          const key = candidateWebsiteKey(group)
          if (live && key) setCandidateWebsites((current) => {
            if (!suggestion) { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next }
            return current[key]?.website === suggestion.website && current[key]?.source === suggestion.source ? current : { ...current, [key]: suggestion }
          })
        } catch { failed = true }
      }
      if (live) setWebsiteSearchError(failed)
    })()
    return () => { live = false }
  }, [data, onWebsiteSuggested, websiteRetry])
  const needle = query.trim().toLowerCase()
  const recurring = new Set(data?.templates.filter((item) => item.is_active && item.vendor_id).map((item) => item.vendor_id))
  const suggested = new Set(data?.bills.filter((bill) => bill.vendor_id && suggestsRecurringBill(bill)).map((bill) => bill.vendor_id))
  const candidateNames = data?.vendors.filter((vendor) => recurring.has(vendor.id) || suggested.has(vendor.id)).map((vendor) => vendor.name) || []
  const candidates = groupUnlinkedRecurringProviders(data?.bills || [], data?.templates || [], candidateNames)
  // Same names do not establish that a preferred event vendor is an operating-cost provider.
  const selectedCandidate = candidates.find((group) => group.key === candidateKey) || candidateSnapshot
  const financeCompanyIds = new Set([...(data?.bills.filter((bill) => !bill.archived_at && bill.vendor_id).map((bill) => bill.vendor_id) || []), ...(data?.templates.filter((template) => template.is_active && template.vendor_id).map((template) => template.vendor_id) || [])])
  const vendors = data?.vendors.filter((vendor) => !vendor.archived_at && financeCompanyIds.has(vendor.id) && (view === 'all' || recurring.has(vendor.id) || suggested.has(vendor.id)) && [vendor.name, vendor.vendor_type, vendor.email, vendor.phone].some((value) => (value || '').toLowerCase().includes(needle))) || []
  const visibleCandidates = candidates.filter((group) => (!needle || `${group.name} ${group.bills.map((bill) => bill.service).join(' ')} ${group.schedules.map((schedule) => schedule.name).join(' ')}`.toLowerCase().includes(needle)))
  const resultCount = vendors.length + visibleCandidates.length
  const statusLine = data ? `${resultCount.toLocaleString()} ${resultCount === 1 ? 'company' : 'companies'}` : ''
  const selectedCandidateSiteKey = selectedCandidate ? candidateWebsiteKey(selectedCandidate) : ''
  const selectedCandidateSuggestion =
    selectedCandidate && selectedCandidateSiteKey && !dismissedCandidateWebsites[selectedCandidateSiteKey]
      ? candidateWebsites[selectedCandidateSiteKey]
      : undefined
  const retryWebsiteLookup = () => {
    setWebsiteSearchError(false)
    setWebsiteRetry((value) => value + 1)
  }
  const savedSectionTitle = 'Company profiles'

  return <div className="h-full overflow-y-auto pb-6 portal-scrollbar"><section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm">
    <div className="border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-6">
    <PortalFilterBar
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder="Search companies"
      resultLabel={<span className="hidden sm:inline">{statusLine}</span>}
      activeFilters={view === 'all' ? [{ id: 'scope', label: 'All companies', onRemove: () => setView('recurring') }] : []}
      onClearFilters={() => setView('recurring')}
    >
      <PortalSelect value={view} onChange={(value) => setView(value as 'recurring' | 'all')} aria-label="Company list scope" className="w-full sm:w-72" options={[{ value: 'recurring', label: 'Recurring costs' }, { value: 'all', label: 'All companies' }]} />
    </PortalFilterBar>
    {data ? <p className="mt-2 text-xs font-medium tabular-nums text-[color:var(--portal-muted)] sm:hidden">{statusLine}</p> : null}
    </div>
    {error ? <p role="alert" className="border-b border-[color:var(--portal-border)] px-4 py-4 text-sm text-[color:var(--portal-text)] sm:px-6">{error} <button onClick={() => void load()} className="font-semibold underline">Try again</button></p> : !data ? <p role="status" className="px-4 py-6 text-sm text-[color:var(--portal-muted)] sm:px-6">Loading companies…</p> : <>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {visibleCandidates.length ? <p className="mb-3 px-1 text-xs leading-5 text-[color:var(--portal-muted)]">Find company contact details, websites, and documents here. Bills and recurring costs stay in their own lists.</p> : null}
        <ProviderListGroup title="From bills & recurring costs" count={visibleCandidates.length}>
          {visibleCandidates.map((group) => (
            <button key={group.key} type="button" onClick={() => { setCandidateSnapshot(group); setCandidateKey(group.key); setCandidateOpen(true) }} className="flex w-full items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-left last:border-b-0 hover:bg-[color:var(--portal-soft)] sm:grid sm:grid-cols-[auto_minmax(0,1fr)_6rem_1.25rem] sm:items-center">
              <ProviderIcon website={candidateWebsites[candidateWebsiteKey(group)]?.website} />
              <div className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[color:var(--portal-text)]">{group.name}</span>
                <span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">{candidateSummaryShort(group)}</span>
              </div>
              <span className="ml-auto text-[11px] font-semibold text-[#9a712e] dark:text-[#e6c77f] sm:text-right">View details</span>
              <ChevronRight size={15} className="hidden text-[color:var(--portal-faint)] sm:block" aria-hidden />
            </button>
          ))}
        </ProviderListGroup>
        <ProviderListGroup title={savedSectionTitle} count={vendors.length}>
          {vendors.map((vendor) => {
            const subtitle = vendorSavedSubtitle(vendor)
            const iconWebsite = vendor.business_website || websiteSuggestions[websiteSuggestionKey(vendor.id)]
            return (
              <button key={vendor.id} type="button" onClick={() => { setSelected(vendor); setSelectedOpen(true) }} className="flex w-full items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-left last:border-b-0 hover:bg-[color:var(--portal-soft)] sm:grid sm:grid-cols-[auto_minmax(0,1fr)_1.25rem] sm:items-center">
                <ProviderIcon website={iconWebsite} />
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-[color:var(--portal-text)]">{vendor.name}{vendor.archived_at ? ' · Archived' : ''}</span>
                  <span className="mt-1 block truncate text-[10px] text-[color:var(--portal-muted)]">
                    {subtitle}
                    {vendor.email ? ` · ${vendor.email}` : ''}
                  </span>
                </div>
                <ChevronRight size={15} className="hidden text-[color:var(--portal-faint)] sm:block" aria-hidden />
              </button>
            )
          })}
        </ProviderListGroup>
        {!vendors.length && !visibleCandidates.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] text-center">
            <Building2 size={22} className="text-[color:var(--portal-faint)]" />
            <p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">{needle ? 'No companies match your search' : 'No companies in this view'}</p>
            <p className="mt-1 max-w-xs text-[10px] text-[color:var(--portal-muted)]">{needle ? 'Clear the search or switch to All companies.' : view === 'recurring' ? 'Switch to All companies to see other saved company details.' : 'Company details appear here when a bill is assigned to a saved company.'}</p>
          </div>
        ) : null}
      </div>
    </>}
  </section><PortalModal isOpen={selectedOpen && Boolean(selected)} onClose={() => { setSelectedOpen(false); void load() }} title={selected?.name || 'Company details'} headerIcon={selected ? <ProviderIcon key={selected.business_website || websiteSuggestions[websiteSuggestionKey(selected.id)] || selected.id} website={selected.business_website || websiteSuggestions[websiteSuggestionKey(selected.id)]} /> : undefined} description="Bills and payment history" maxWidth="max-w-[600px]" className="[&_[data-portal-modal-scroller]]:[overflow-anchor:none]" sidePanel headerBack animateClose fullScreenOnMobile>{selected ? <><VendorBillsProfile key={selected.id} vendorId={selected.id} embedded hideUnlinkedBills onWebsiteSuggested={onWebsiteSuggested} /></> : null}</PortalModal><PortalModal isOpen={candidateOpen && Boolean(selectedCandidate)} onClose={() => setCandidateOpen(false)} title={selectedCandidate?.name || 'Company details'} headerIcon={selectedCandidate ? <ProviderIcon key={selectedCandidateSuggestion?.website || selectedCandidate.key} website={selectedCandidateSuggestion?.website} /> : undefined} description="Review the recorded bills and recurring costs." maxWidth="max-w-[600px]" className="[&_[data-portal-modal-scroller]]:[overflow-anchor:none]" sidePanel headerBack animateClose fullScreenOnMobile>{selectedCandidate ? <><CandidateWebsite suggestion={selectedCandidateSuggestion} websiteSearchError={websiteSearchError} onRetryLookup={retryWebsiteLookup} onDismiss={selectedCandidateSiteKey ? () => setDismissedCandidateWebsites((current) => ({ ...current, [selectedCandidateSiteKey]: true })) : undefined} /><CandidateReview key={selectedCandidate.key} group={selectedCandidate} onOpenBill={setPanelBillId} onOpenSchedule={setPanelScheduleId} /></> : null}</PortalModal>
    {panelBillId ? <BillDetailsPanel billId={panelBillId} refreshKey={billRefreshKey} onClose={() => { setPanelBillId(null); void load() }} onOpenExpense={setPanelExpenseId} onCreateExpense={setImportBillId} /> : null}
    {panelScheduleId ? <ExpenseManagement key={panelScheduleId} view="recurring" embedded panelOnly initialTemplateId={panelScheduleId} onBack={() => setPanelScheduleId(null)} onOpenBill={(id) => { setPanelScheduleId(null); setBillRefreshKey(value => value + 1); setPanelBillId(id) }} /> : null}
      {importBillId ? <ExpenseManagement key={importBillId} view="business" embedded panelOnly initialBillId={importBillId} onBack={() => { setImportBillId(null); setBillRefreshKey(value => value + 1) }} /> : null}
    <PortalModal isOpen={Boolean(panelExpenseId)} onClose={() => { setPanelExpenseId(null); setBillRefreshKey(value => value + 1) }} title="Expense & payments" sidePanel headerBack animateClose maxWidth="max-w-[600px]">
      {panelExpenseId ? <ExpenseManagement view="detail" expenseId={panelExpenseId} embedded onBack={() => { setPanelExpenseId(null); setBillRefreshKey(value => value + 1) }} onOpenBill={(id) => { setPanelExpenseId(null); setPanelBillId(id); setBillRefreshKey(value => value + 1) }} /> : null}
    </PortalModal>
  </div>
}
