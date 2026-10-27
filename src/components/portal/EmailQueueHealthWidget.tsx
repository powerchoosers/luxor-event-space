'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'

type QueueStatusData = {
  status: 'healthy' | 'warning'
  queued: number
  sending: number
  sent: number
  failed: number
  dueQueued: number
  total: number
  failureWindowHours: number
  lastActivityAt: string | null
  provider: string
  worker: {
    lastAuthorizedAt: string | null
    lastProcessedAt: string | null
    status: 'healthy' | 'idle' | 'error' | 'unknown'
    stalled: boolean
    error: string | null
  }
}

function isQueueStatusData(value: unknown): value is QueueStatusData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<QueueStatusData>
  return (data.status === 'healthy' || data.status === 'warning')
    && ['queued', 'sending', 'sent', 'failed', 'dueQueued', 'total', 'failureWindowHours'].every((key) => Number.isFinite(data[key as keyof QueueStatusData]))
    && Boolean(data.worker && typeof data.worker === 'object')
}

export function EmailQueueHealthWidget() {
  const [data, setData] = useState<QueueStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const lifecycleRef = useRef<AbortController | null>(null)
  const requestRef = useRef<{ signal?: AbortSignal; needsCatchUp: boolean } | null>(null)
  const pendingRefreshRef = useRef<boolean | null>(null)

  const fetchStatus = useCallback(async (isManual = false, signal = lifecycleRef.current?.signal, queueIfBusy = false) => {
    if (signal?.aborted) return
    if (requestRef.current && !requestRef.current.signal?.aborted) {
      if (isManual || queueIfBusy) {
        pendingRefreshRef.current = Boolean(pendingRefreshRef.current || isManual)
        requestRef.current.needsCatchUp = false
        if (isManual) setRefreshing(true)
      }
      return
    }
    const request = { signal, needsCatchUp: document.visibilityState !== 'visible' }
    requestRef.current = request
    if (isManual) setRefreshing(true)
    try {
      const response = await fetch('/api/email/queue-status', { cache: 'no-store', signal })
      const payload = await response.json().catch(() => null)
      if (signal?.aborted) return
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Queue status is currently unavailable.')
      if (!isQueueStatusData(payload)) throw new Error('Queue status returned incomplete data.')
      setData(payload)
      setError('')
    } catch (caught) {
      if (signal?.aborted) return
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Queue status is currently unavailable.')
    } finally {
      if (requestRef.current !== request) return
      requestRef.current = null
      const pending = pendingRefreshRef.current
      pendingRefreshRef.current = null
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
        if (pending !== null && (pending || document.visibilityState === 'visible')) {
          void fetchStatus(pending, signal)
        }
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    lifecycleRef.current = controller
    void fetchStatus(false, controller.signal)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchStatus(false, controller.signal, Boolean(requestRef.current?.needsCatchUp))
      } else if (requestRef.current) {
        requestRef.current.needsCatchUp = true
      }
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchStatus(false, controller.signal)
    }, 45_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      controller.abort()
      pendingRefreshRef.current = null
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [fetchStatus])

  const warningMessage = data?.worker.stalled
    ? `Delivery worker has stopped responding while ${data.dueQueued} due email${data.dueQueued === 1 ? ' is' : 's are'} waiting.`
    : data?.worker.status === 'error'
      ? data.worker.error || 'The delivery worker reported an error.'
      : data?.failed
        ? `${data.failed} recent email${data.failed === 1 ? ' needs' : 's need'} attention.`
        : null
  const state = !data
    ? 'Unavailable'
    : data.status === 'warning'
      ? 'Attention required'
      : data.worker.status === 'healthy'
        ? 'Operational'
        : data.worker.status === 'idle'
          ? 'Worker idle'
          : 'Worker status unavailable'
  const healthy = state === 'Operational'
  const stateIcon = !data || state === 'Worker status unavailable'
    ? <XCircle size={17} />
    : data.status === 'warning'
      ? <AlertTriangle size={17} />
      : <CheckCircle2 size={17} />

  return (
    <section aria-labelledby="email-queue-status-title" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${healthy ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : data?.status === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`} aria-hidden="true">{stateIcon}</span>
          <div className="min-w-0">
            <h2 id="email-queue-status-title" className="text-sm font-semibold text-[color:var(--portal-text)]">Email system</h2>
            <p className={`mt-1 text-xs font-semibold ${healthy ? 'text-emerald-700 dark:text-emerald-300' : data?.status === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-[color:var(--portal-muted)]'}`} role="status">{loading && !data ? 'Checking status…' : state}</p>
            <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">{data?.provider || 'Provider unavailable'}</p>
            <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
              {data?.worker.lastAuthorizedAt
                ? `Authenticated worker check-in ${new Date(data.worker.lastAuthorizedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : 'No authenticated worker check-in recorded'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void fetchStatus(true)} disabled={refreshing}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] disabled:cursor-wait disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {data ? <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Queued" value={data.queued} />
        <Metric label="In flight" value={data.sending} />
        <Metric label="Sent (30 days)" value={data.sent} tone="success" />
        <Metric label={`Failed (${data.failureWindowHours}h)`} value={data.failed} tone={data.failed ? 'warning' : 'default'} />
      </dl> : loading ? <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[4.5rem] animate-pulse rounded-lg bg-[color:var(--portal-soft)]" />)}</div> : null}

      {warningMessage ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{warningMessage}</span></p> : null}
      {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-700 dark:text-rose-200">{data ? `Refresh failed; showing the last successful status. ${error}` : error}</p> : null}
      {data?.lastActivityAt ? <p className="mt-3 text-[10px] text-[color:var(--portal-muted)]">Latest queue update: {new Date(data.lastActivityAt).toLocaleString()}</p> : null}
    </section>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' | 'warning' }) {
  const toneClass = tone === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : tone === 'warning' && value > 0
      ? 'border-rose-500/20 bg-rose-500/5'
      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45'
  const valueClass = tone === 'success'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'warning' && value > 0
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-[color:var(--portal-text)]'
  return <div className={`rounded-lg border px-3 py-3 ${toneClass}`}><dt className="text-[11px] text-[color:var(--portal-muted)]">{label}</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{value.toLocaleString()}</dd></div>
}
