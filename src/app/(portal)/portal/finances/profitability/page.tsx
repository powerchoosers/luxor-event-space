'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EventProfitability, type ProfitabilityEvent } from '@/components/portal/EventProfitability'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

export default function EventProfitabilityPage() {
  const [data, setData] = useState<{ events: ProfitabilityEvent[]; issues: string[] } | null>(null)
  const [error, setError] = useState('')
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
    <PortalPageHeader title="Event profitability" description="Understand what each event brings in and what its direct costs are." />
    <Link href="/portal/finances" className="w-fit text-sm font-semibold text-[#9a712e] underline-offset-4 hover:underline dark:text-[#e6c77f]">Financial Center</Link>
    {error ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error}</p> : !data ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading event financials…</p> : <>
      {data.issues.length > 0 && <div role="status" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm text-[color:var(--portal-text)]"><p className="font-semibold">Some financial figures need review.</p><ul className="mt-2 list-inside list-disc text-[color:var(--portal-muted)]">{data.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <EventProfitability events={data.events} />
    </>}
  </PortalPageFrame>
}
