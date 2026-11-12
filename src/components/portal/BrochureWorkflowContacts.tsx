'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalPagination, PortalSkeleton } from '@/components/portal/PortalUI'

type Status = 'active' | 'paused' | 'completed' | 'stopped'
type Contact = { id: string; inquiryId: string; name: string | null; email: string | null; status: Status; startedAt: string; nextAction: { name: string; scheduledAt: string; status: string; channel: string } | null }
type Data = { contacts: Contact[]; counts: Record<Status, number>; pageSize: number; error?: string }
const labels: Record<Status, string> = { active: 'In progress', paused: 'Paused', completed: 'Completed', stopped: 'Stopped' }
const actionLabels: Record<string, string> = { scheduled: 'Scheduled', processing: 'Processing', email_queued: 'Email queued', task_created: 'Call task open', failed: 'Failed' }

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(date)
}

export function BrochureWorkflowContacts() {
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [retry, setRetry] = React.useState(0)
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/marketing/automation-contacts?id=brochure_lead&page=${page}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as Data; if (!response.ok) throw new Error(payload.error || 'Contacts could not load.'); setData(payload) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Contacts could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, page, retry])
  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5" aria-labelledby="brochure-contacts-heading">
    <h2 id="brochure-contacts-heading"><button type="button" aria-expanded={open} aria-controls="brochure-contacts" onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span><span className="block text-base font-bold text-[color:var(--portal-text)]">Contacts and progress</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">See who entered this sequence and what needs attention.</span></span><ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button></h2>
    {open ? <div id="brochure-contacts" className="pt-4">{loading ? <div className="space-y-3 pt-1"><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-32 rounded" /><PortalSkeleton className="h-4 w-28 rounded" /></div><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-4 w-24 rounded" /></div><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-36 rounded" /><PortalSkeleton className="h-4 w-32 rounded" /></div></div> : error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Try again</button></p> : data ? <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[color:var(--portal-border)] pb-4 text-xs text-[color:var(--portal-muted)]"><span><strong className="tabular-nums text-[color:var(--portal-text)]">{total}</strong> enrollments</span>{(Object.keys(labels) as Status[]).map((status) => <span key={status}><strong className="tabular-nums text-[color:var(--portal-text)]">{data.counts[status]}</strong> {labels[status].toLowerCase()}</span>)}</div>
      <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Shows the earliest unresolved action for each contact. Other actions may also be scheduled.</p>
      {data.contacts.length ? <ul className="mt-2 divide-y divide-[color:var(--portal-border)]">{data.contacts.map((contact) => <li key={contact.id} className="flex flex-col gap-1 py-3 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div className="min-w-0"><Link href={`/portal/leads/${encodeURIComponent(contact.inquiryId)}`} className="break-words text-sm font-semibold text-[color:var(--portal-text)] hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">{contact.name || contact.email || 'Open contact'}</Link>{contact.name && contact.email ? <p className="mt-1 break-all text-[color:var(--portal-muted)]">{contact.email}</p> : null}</div><div className="sm:text-right"><p className="font-semibold text-[color:var(--portal-text)]">{labels[contact.status]}{contact.nextAction ? ` · ${contact.nextAction.name}` : ''}</p><p className="mt-1 text-[color:var(--portal-muted)]">{contact.nextAction ? `${actionLabels[contact.nextAction.status] || 'Action pending'} · ${dateTime(contact.nextAction.scheduledAt)} CT` : `Entered ${dateTime(contact.startedAt)} CT`}</p></div></li>)}</ul> : <p className="py-4 text-xs text-[color:var(--portal-muted)]">No contacts have entered this sequence.</p>}
      <PortalPagination currentPage={page} totalPages={Math.ceil(total / data.pageSize)} onPageChange={setPage} scrollToTop={false} />
    </> : null}</div> : null}
  </section>
}
