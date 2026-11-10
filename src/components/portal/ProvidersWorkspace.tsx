'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Building2 } from '@/lib/icons/phosphor-compat'
import { PortalModal } from '@/components/portal/PortalUI'
import VendorBillsProfile from '@/components/portal/VendorBillsProfile'
import BillDocumentPreview from '@/components/portal/BillDocumentPreview'
import type { LuxorBill, LuxorVendor } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'
import { groupUnlinkedRecurringProviders, suggestsRecurringBill, uniqueSavedProviderForGroup } from '@/lib/luxorRecurringBillSuggestion'
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

function CandidateWebsite({ suggestion }: { suggestion?: WebsiteSuggestion }) {
  if (!suggestion) return null
  return <p className="mb-3 text-sm leading-5 text-[color:var(--portal-muted)]">Possible website: <a href={suggestion.source} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">{new URL(suggestion.website).hostname} <ArrowUpRight size={12} /></a>. Check that it belongs to this provider.</p>
}

function CandidateSchedules({ schedules }: { schedules: LuxorExpenseTemplate[] }) {
  if (!schedules.length) return null
  return <section className="mb-4 space-y-2"><h4 className="text-sm font-semibold text-[color:var(--portal-text)]">Recurring costs</h4><p className="text-xs leading-5 text-[color:var(--portal-muted)]">These schedules are not linked to a saved provider yet. Add the provider or open an existing provider to review and link them.</p><ul className="divide-y divide-[color:var(--portal-border)]">{schedules.map((schedule) => <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm text-[color:var(--portal-text)]"><span><span className="block font-semibold">{schedule.name}</span><span className="block text-xs text-[color:var(--portal-muted)]">{schedule.frequency}</span></span><span className="tabular-nums">{schedule.is_variable ? 'Variable amount' : schedule.expected_amount == null || String(schedule.expected_amount).trim() === '' || !Number.isFinite(Number(schedule.expected_amount)) || Number(schedule.expected_amount) < 0 ? 'Amount unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(schedule.expected_amount))}</span></li>)}</ul><Link href="/portal/operations?tab=vendors" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Manage providers <ArrowUpRight size={12} /></Link></section>
}

function websiteSuggestionKey(vendorId: string) { return `v4:${vendorId}` }

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
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'recurring' | 'all'>('recurring')
  const [selected, setSelected] = useState<LuxorVendor | null>(null)
  const [candidateKey, setCandidateKey] = useState<string | null>(null)
  const [websiteSuggestions, setWebsiteSuggestions] = useState<Record<string, string>>({})
  const [candidateWebsites, setCandidateWebsites] = useState<Record<string, WebsiteSuggestion>>({})
  const [websiteSearchError, setWebsiteSearchError] = useState(false)
  const [websiteRetry, setWebsiteRetry] = useState(0)
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
      if (!response.ok) throw new Error('Providers could not be loaded.')
      const result = await response.json()
      if (!Array.isArray(result.vendors) || !Array.isArray(result.templates) || !Array.isArray(result.bills)) throw new Error('Provider records could not be verified.')
      setData({ vendors: result.vendors, templates: result.templates, bills: result.bills }); setError('')
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Providers could not be loaded.') }
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
  const candidatesByProvider = new Map(candidates.flatMap((group) => {
    const id = uniqueSavedProviderForGroup(group.key, data?.vendors || [])
    return id ? [[id, group] as const] : []
  }))
  const candidateWebsiteForVendor = (id: string) => {
    const group = candidatesByProvider.get(id)
    return group ? candidateWebsites[candidateWebsiteKey(group)]?.website : undefined
  }
  const selectedCandidate = candidates.find((group) => group.key === candidateKey)
  const vendors = data?.vendors.filter((vendor) => (view === 'all' || recurring.has(vendor.id) || suggested.has(vendor.id) || candidatesByProvider.has(vendor.id)) && [vendor.name, vendor.vendor_type, vendor.email, vendor.phone].some((value) => (value || '').toLowerCase().includes(needle))) || []
  const visibleCandidates = view === 'recurring' ? candidates.filter((group) => (!needle || `${group.name} ${group.bills.map((bill) => bill.service).join(' ')} ${group.schedules.map((schedule) => schedule.name).join(' ')}`.toLowerCase().includes(needle)) && !vendors.some((vendor) => vendor.id === uniqueSavedProviderForGroup(group.key, data?.vendors || []))) : []
  const unlinked = data?.templates.filter((item) => item.is_active && !item.vendor_id) || []
  return <div className="h-full overflow-y-auto pb-6 portal-scrollbar"><section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Providers</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Open a provider to see its bills, payments, documents, and recurring schedules.</p></div><Link href="/portal/operations?tab=vendors" className="text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">Manage providers <ArrowUpRight size={14} className="inline" /></Link></div>
    {error ? <p role="alert" className="mt-4 text-sm text-[color:var(--portal-text)]">{error} <button onClick={() => void load()} className="font-semibold underline">Try again</button></p> : !data ? <p role="status" className="mt-4 text-sm text-[color:var(--portal-muted)]">Loading providers…</p> : <>
      {unlinked.length ? <p className="mt-4 text-sm text-[color:var(--portal-text)]">{unlinked.length} active recurring {unlinked.length === 1 ? 'schedule needs' : 'schedules need'} a saved provider. Review the providers below or open All providers to link an existing one.</p> : null}
      <div className="mt-4 flex gap-2" role="group" aria-label="Provider list"><button type="button" aria-pressed={view === 'recurring'} onClick={() => setView('recurring')} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === 'recurring' ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}>Recurring</button><button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === 'all' ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}>All providers</button></div>
      <label className="mt-3 block"><span className="sr-only">Search providers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers" className="min-h-11 w-full max-w-md rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
      {websiteSearchError ? <p role="status" className="mt-2 text-xs text-[color:var(--portal-muted)]">Some provider websites could not be checked. <button type="button" onClick={() => { setWebsiteSearchError(false); setWebsiteRetry((value) => value + 1) }} className="min-h-11 font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">Try again</button></p> : null}
      {vendors.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{vendors.map((vendor) => <li key={vendor.id}><button type="button" onClick={() => setSelected(vendor)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-sm"><ProviderIcon key={vendor.business_website || websiteSuggestions[websiteSuggestionKey(vendor.id)] || candidateWebsiteForVendor(vendor.id) || ''} website={vendor.business_website || websiteSuggestions[websiteSuggestionKey(vendor.id)] || candidateWebsiteForVendor(vendor.id)} /><span className="min-w-0 flex-1"><span className="block font-semibold text-[color:var(--portal-text)]">{vendor.name}{vendor.archived_at ? ' · Archived' : ''}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{recurring.has(vendor.id) ? 'Recurring schedule' : suggested.has(vendor.id) ? 'Recurring bill suggested · review schedule' : vendor.vendor_type}{!vendor.business_website && (websiteSuggestions[websiteSuggestionKey(vendor.id)] || candidateWebsiteForVendor(vendor.id)) ? ' · Website suggested' : ''}{candidates.some((group) => uniqueSavedProviderForGroup(group.key, data.vendors) === vendor.id) ? ' · Possible unlinked records' : ''}{vendor.email ? ` · ${vendor.email}` : ''}</span></span><ArrowUpRight size={16} className="shrink-0 text-[#9a712e] dark:text-[#e6c77f]" /></button></li>)}</ul> : !visibleCandidates.length ? <p className="mt-5 text-sm text-[color:var(--portal-muted)]">{needle ? 'No providers match your search.' : view === 'recurring' ? 'No recurring providers yet. Open All providers to add a schedule.' : 'No providers yet. Add one to organize its bills and schedules.'}</p> : null}
      {visibleCandidates.length ? <section className="mt-5 border-t border-[color:var(--portal-border)] pt-4"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Providers to confirm</h3><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">These recurring costs and bills need a saved provider. Matching names are grouped for review; no records are merged.</p><ul className="mt-2 divide-y divide-[color:var(--portal-border)]">{visibleCandidates.map((group) => <li key={group.key}><button type="button" onClick={() => setCandidateKey(group.key)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left text-sm text-[color:var(--portal-text)]"><ProviderIcon key={candidateWebsites[candidateWebsiteKey(group)]?.website || ''} website={candidateWebsites[candidateWebsiteKey(group)]?.website} /><span className="min-w-0 flex-1"><span className="font-semibold">{group.name}</span><span className="block text-xs text-[color:var(--portal-muted)]">{candidateSummary(group)} · Confirm provider{candidateWebsites[candidateWebsiteKey(group)] ? ' · Website suggested' : ''}</span></span><ArrowUpRight size={16} className="shrink-0 text-[#9a712e] dark:text-[#e6c77f]" /></button></li>)}</ul></section> : null}
    </>}
  </section><PortalModal isOpen={Boolean(selected)} onClose={() => { setSelected(null); void load() }} title={selected?.name || 'Provider'} description="Bills, payment history, and recurring schedules" maxWidth="max-w-5xl" fullScreenOnMobile>{selected ? <VendorBillsProfile key={selected.id} vendorId={selected.id} embedded onWebsiteSuggested={onWebsiteSuggested} /> : null}</PortalModal><PortalModal isOpen={Boolean(selectedCandidate)} onClose={() => setCandidateKey(null)} title={selectedCandidate?.name || 'Possible provider'} description={selectedCandidate?.schedules.length ? "Review these recurring costs and any bills. Confirm the provider before linking records." : "Review each bill and confirm its provider. Matching names alone do not prove identity."} maxWidth="max-w-3xl" fullScreenOnMobile>{selectedCandidate ? <><CandidateWebsite suggestion={candidateWebsites[candidateWebsiteKey(selectedCandidate)]} /><CandidateSchedules schedules={selectedCandidate.schedules} /><ul className="divide-y divide-[color:var(--portal-border)]">{selectedCandidate.bills.map((bill) => <li key={bill.id} className="space-y-2 py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[color:var(--portal-text)]">{bill.service}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.due_date ? `Due ${bill.due_date}` : 'Due date unavailable'} · {bill.status === 'paid' ? 'Marked paid' : 'Needs review'}</p></div><p className="text-sm tabular-nums text-[color:var(--portal-text)]">{billAmount(bill)}</p></div><div className="flex flex-wrap items-center gap-4"><BillDocumentPreview bill={bill} /><Link onClick={() => setCandidateKey(null)} href={`/portal/finances?view=bill-review&bill=${encodeURIComponent(bill.id)}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Review and link provider <ArrowUpRight size={12} /></Link></div></li>)}</ul></> : null}</PortalModal></div>
}
