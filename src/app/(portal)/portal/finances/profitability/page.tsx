'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Menu } from '@/lib/icons/phosphor-compat'
import { FinanceBrowseViews } from '@/components/portal/FinanceBrowseViews'
import { EventProfitability, type ProfitabilityEvent } from '@/components/portal/EventProfitability'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

export default function EventProfitabilityPage() {
  const [data, setData] = useState<{ events: ProfitabilityEvent[]; issues: string[] } | null>(null)
  const [error, setError] = useState('')
  const [browseOpen, setBrowseOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let generation = 0
    const refresh = () => {
      const current = ++generation
      fetch('/api/portal/event-profitability', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? 'Financial Center access is required.' : 'Financial records could not be verified. Refresh to retry.')
        const result: unknown = await response.json()
        if (!result || typeof result !== 'object' || !Array.isArray((result as { events?: unknown }).events) || !Array.isArray((result as { issues?: unknown }).issues)) throw new Error('Financial records could not be verified. Refresh to retry.')
        if (current === generation) { setData(result as { events: ProfitabilityEvent[]; issues: string[] }); setError('') }
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted && current === generation) { setData(null); setError(reason instanceof Error ? reason.message : 'Financial records could not be verified.') } })
    }
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refreshVisible)
    const timer = window.setInterval(refreshVisible, 60_000)
    return () => { controller.abort(); window.removeEventListener('focus', refreshVisible); window.clearInterval(timer) }
  }, [])
  return <PortalPageFrame>
    <PortalPageHeader title="Event profitability" description="Understand what each event brings in and what its direct costs are." actions={<button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} aria-label="Browse views. Currently viewing Event profitability" className="hidden min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:inline-flex"><Menu size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" /><span><span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)] leading-none">Browse views</span><span className="mt-0.5 block text-xs font-bold">Event profitability</span></span><ChevronDown size={15} className="text-[color:var(--portal-muted)]" aria-hidden="true" /></button>} />
    <button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] md:hidden"><Menu size={18} className="shrink-0 text-[#a8792f]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span><span className="mt-0.5 block text-sm font-bold">Event profitability</span></span><ChevronDown size={17} className="text-[color:var(--portal-muted)]" aria-hidden="true" /></button>
    <FinanceBrowseViews open={browseOpen} close={() => setBrowseOpen(false)} currentView="profitability" />
    {error ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error}</p> : !data ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading event financials…</p> : <>
      {data.issues.length > 0 && <div role="status" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm text-[color:var(--portal-text)]"><p className="font-semibold">Some financial figures need review.</p><ul className="mt-2 list-inside list-disc text-[color:var(--portal-muted)]">{data.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <EventProfitability events={data.events} />
    </>}
  </PortalPageFrame>
}
