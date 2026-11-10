'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalPagination } from '@/components/portal/PortalUI'

type Status = 'active' | 'paused' | 'held' | 'completed' | 'stopped'
type Contact = { id: string; inquiry_id: string; name: string | null; email: string | null; status: Status; stepName: string | null; current_step_id: string | null; next_run_at: string | null; started_at: string }
type Payload = { contacts: Contact[]; counts: Record<Status, number>; pageSize: number; error?: string }
const labels: Record<Status, string> = { active: 'In progress', paused: 'Paused', held: 'Needs review', completed: 'Completed', stopped: 'Stopped' }

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(date)
}

export function WorkflowContacts({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<Payload | null>(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [retry, setRetry] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflowId)}/contacts?page=${page}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as Payload
        if (!response.ok) throw new Error(result.error || 'Workflow contacts could not be loaded.')
        setData(result)
      })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Workflow contacts could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, page, retry, workflowId])

  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0
  return (
    <section className="shrink-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:px-5" aria-labelledby="workflow-contacts-heading">
      <h2 id="workflow-contacts-heading"><button type="button" aria-expanded={open} aria-controls="workflow-contacts-content" onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span><span className="block text-sm font-semibold text-[color:var(--portal-text)]">Contacts and progress</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">See enrollments, their current step, and status.</span></span><ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button></h2>
      {open ? <div id="workflow-contacts-content" className="pt-4">
        {loading ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading workflow progress…</p> : error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Try again</button></p> : data ? <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[color:var(--portal-border)] pb-4 text-xs text-[color:var(--portal-muted)]"><span><strong className="tabular-nums text-[color:var(--portal-text)]">{total}</strong> enrollments</span>{(Object.keys(labels) as Status[]).map((status) => <span key={status}><strong className="tabular-nums text-[color:var(--portal-text)]">{data.counts[status]}</strong> {labels[status].toLowerCase()}</span>)}</div>
          <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Counts are enrollments, so a contact may appear more than once. Steps reflect the version each contact entered.</p>
          {data.contacts.length ? <ul className="mt-2 divide-y divide-[color:var(--portal-border)]">{data.contacts.map((contact) => <li key={contact.id} className="flex flex-col gap-1 py-3 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div className="min-w-0"><Link href={`/portal/leads/${encodeURIComponent(contact.inquiry_id)}`} className="break-words text-sm font-semibold text-[color:var(--portal-text)] hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">{contact.name || contact.email || 'Open contact'}</Link>{contact.name && contact.email ? <p className="mt-1 break-all text-[color:var(--portal-muted)]">{contact.email}</p> : null}</div><div className="sm:text-right"><p className="font-semibold text-[color:var(--portal-text)]">{labels[contact.status]}{contact.stepName ? ` · ${contact.stepName}` : contact.current_step_id ? ' · Step unavailable' : ''}</p><p className="mt-1 text-[color:var(--portal-muted)]">{contact.next_run_at && contact.status === 'active' ? `Next scheduled: ${dateTime(contact.next_run_at)} CT` : `Entered: ${dateTime(contact.started_at)} CT`}</p></div></li>)}</ul> : <p className="py-4 text-xs text-[color:var(--portal-muted)]">No contacts are enrolled in this workflow yet.</p>}
          <PortalPagination currentPage={page} totalPages={Math.ceil(total / data.pageSize)} onPageChange={setPage} scrollToTop={false} />
        </> : null}
      </div> : null}
    </section>
  )
}
