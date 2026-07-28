'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, RefreshCw, Mail, Activity } from 'lucide-react'

type QueueStatusData = {
  status: 'healthy' | 'warning'
  queued: number
  sending: number
  sent: number
  failed: number
  total: number
  lastActivityAt: string | null
  provider: string
}

export function EmailQueueHealthWidget() {
  const [data, setData] = useState<QueueStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/email/queue-status', { cache: 'no-store' })
      if (res.ok) {
        const payload = (await res.json()) as QueueStatusData
        setData(payload)
      }
    } catch (err) {
      console.warn('Failed to load email queue status:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchStatus()
    const timer = setInterval(() => void fetchStatus(), 45_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="flex h-16 items-center justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 shadow-sm animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full bg-[color:var(--portal-soft)]" />
          <div className="h-3 w-44 rounded bg-[color:var(--portal-soft)]" />
        </div>
      </div>
    )
  }

  const isHealthy = data?.status !== 'warning'

  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${isHealthy ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </span>
          <div>
            <h4 className="text-xs font-bold text-[color:var(--portal-text)] flex items-center gap-1.5">
              <span>Email Queue Status</span>
              <span className="text-[10px] font-normal text-[color:var(--portal-muted)]">({data?.provider || 'Zoho Mail'})</span>
            </h4>
            <p className="text-[10px] text-[color:var(--portal-muted)]">
              {data?.lastActivityAt
                ? `Last processed ${new Date(data.lastActivityAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                : 'Background job dispatch active'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)]">
              <span className="text-[color:var(--portal-muted)]">Queued:</span>
              <span className="font-bold text-[color:var(--portal-text)]">{data?.queued ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)]">
              <span className="text-[color:var(--portal-muted)]">In Flight:</span>
              <span className="font-bold text-[color:var(--portal-text)]">{data?.sending ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <span>Sent (30d):</span>
              <span className="font-bold">{data?.sent ?? 0}</span>
            </div>
            {Boolean(data?.failed) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-500">
                <span>Failed:</span>
                <span className="font-bold">{data?.failed}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void fetchStatus(true)}
            disabled={refreshing}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] cursor-pointer"
            title="Refresh queue metrics"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
    </div>
  )
}
