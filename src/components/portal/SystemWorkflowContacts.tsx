'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalPagination, PortalSkeleton } from '@/components/portal/PortalUI'

type Job = { id: string; inquiry_id: string | null; name: string | null; stepName: string; status: string; deliveryStatus?: string | null; created_at: string; scheduled_for: string | null; sent_at: string | null }
type Data = { contacts: Job[]; counts: Record<string, number>; pageSize: number; direct?: boolean; error?: string }
const labels: Record<string, string> = { pending: 'Pending', queued: 'Queued', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', undelivered: 'Undelivered', failed: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped' }
function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(date)
}

export function SystemWorkflowContacts({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<Data | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [retry, setRetry] = React.useState(0)
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/marketing/system-messages/contacts?workflow=${encodeURIComponent(workflowId)}&page=${page}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const result = await response.json() as Data; if (!response.ok) throw new Error(result.error || 'Message history could not load.'); setData(result) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Message history could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, page, retry, workflowId])
  const total = data ? Object.values(data.counts).reduce((sum, value) => sum + value, 0) : 0
  const historyNote = workflowId === 'system-tour-request-email'
    ? 'Shows identified tour-request receipt jobs, not enrollments. Older receipts without a source marker are excluded because they cannot be reliably distinguished from other tour emails. Sent means accepted for sending.'
    : workflowId === 'system-payment-request-email' ? 'Shows identified payment-request reminder jobs, not workflow enrollments. Older messages without the origin marker are excluded. A person can appear more than once. Sent means accepted for sending.'
    : workflowId === 'system-offer-email' ? 'Shows identified proposal offer reminder jobs, not workflow enrollments. Older messages without the origin marker are excluded. A person can appear more than once. Sent means accepted for sending.'
    : workflowId === 'system-planner-verification' ? 'Shows verification emails with a linked booking. Sent bodies may be erased for privacy; counts reflect job status only.'
    : workflowId === 'system-agreement-owner' ? 'Shows owner audit copies with a linked booking. Only owner accounts with planner and finance access can open this history.'
    : workflowId === 'system-proposal-breakdown' ? 'Shows sent package comparison emails from saved breakdown records, not queue jobs.'
    : workflowId === 'system-calendar-messages' ? 'Shows calendar cancellation and unbranded update jobs. Branded tour confirmations are excluded.'
    : data?.direct ? 'Counts show direct automation attempts. Provider delivery status appears when a linked message is recorded. Test simulations are not included.' : 'Shows message jobs linked to non-test inquiries, not workflow enrollments. A person can appear more than once. Sent means accepted for sending; delivery is shown only when recorded.'
  return <section className="shrink-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:px-5" aria-labelledby="system-workflow-contacts-heading">
    <h2 id="system-workflow-contacts-heading"><button type="button" aria-expanded={open} aria-controls="system-workflow-contacts" onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span><span className="block text-sm font-semibold text-[color:var(--portal-text)]">Contacts and message history</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">See recorded messages and their delivery status.</span></span><ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button></h2>
    {open ? <div id="system-workflow-contacts" className="pt-4">{loading ? <div className="space-y-3 pt-1"><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-32 rounded" /><PortalSkeleton className="h-4 w-28 rounded" /></div><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-4 w-24 rounded" /></div><div className="flex justify-between items-center"><PortalSkeleton className="h-4 w-36 rounded" /><PortalSkeleton className="h-4 w-32 rounded" /></div></div> : error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Try again</button></p> : data ? <><div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[color:var(--portal-border)] pb-4 text-xs text-[color:var(--portal-muted)]"><span><strong className="tabular-nums text-[color:var(--portal-text)]">{total}</strong> messages</span>{Object.entries(data.counts).map(([status, count]) => <span key={status}><strong className="tabular-nums text-[color:var(--portal-text)]">{count}</strong> {(labels[status] || status).toLowerCase()}</span>)}</div><p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">{historyNote}</p>{data.contacts.length ? <ul className="mt-2 divide-y divide-[color:var(--portal-border)]">{data.contacts.map((job) => <li key={job.id} className="flex flex-col gap-1 py-3 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-4">{job.inquiry_id ? <Link href={`/portal/leads/${encodeURIComponent(job.inquiry_id)}`} className="break-words text-sm font-semibold text-[color:var(--portal-text)] hover:text-[#a8792f]">{job.name || 'Open contact'}</Link> : <span className="break-words text-sm font-semibold text-[color:var(--portal-text)]">{job.name || 'Contact unavailable'}</span>}<div className="sm:text-right"><p className="font-semibold text-[color:var(--portal-text)]">{job.stepName} · {labels[job.status] || job.status}{job.deliveryStatus ? ` · Delivery: ${labels[job.deliveryStatus] || job.deliveryStatus}` : ''}</p><p className="mt-1 text-[color:var(--portal-muted)]">{job.status === 'queued' && job.scheduled_for ? `Scheduled ${dateTime(job.scheduled_for)} CT` : job.sent_at ? `Sent ${dateTime(job.sent_at)} CT` : `Created ${dateTime(job.created_at)} CT`}</p></div></li>)}</ul> : <p className="py-4 text-xs text-[color:var(--portal-muted)]">No matching message jobs have been recorded.</p>}<PortalPagination currentPage={page} totalPages={Math.ceil(total / data.pageSize)} onPageChange={setPage} scrollToTop={false} /></> : null}</div> : null}
  </section>
}
