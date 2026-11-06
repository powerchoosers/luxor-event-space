'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

type Priority = { title: string; meta: string; href: string; isOverdue?: boolean; taskId?: string; bounce?: boolean }

export function TodayPriorities({ items }: { items: Priority[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function dismiss(taskId: string) {
    if (busyId) return
    setBusyId(taskId)
    setError('')
    try {
      const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskId, status: 'cancelled' }) })
      if (!response.ok) throw new Error('Could not dismiss this task. Please try again.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss this task. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return <div className="space-y-4">
    {items.length ? items.map((item) => <div key={item.taskId || `${item.href}-${item.title}`} className="flex items-center gap-2 border-b border-dashed border-[color:var(--portal-border)]/30 pb-3 last:border-b-0 last:pb-0">
      <Link href={item.href} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left no-underline hover:text-[#a8792f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]">
        <span className="text-xs font-medium text-[color:var(--portal-text)]">{item.title}</span>
        <span className={`shrink-0 text-[10px] font-bold tabular-nums ${item.isOverdue ? 'rounded bg-red-50 px-2 py-0.5 text-[#b93c3c] dark:bg-red-500/10' : 'text-[color:var(--portal-muted)]'}`}>{item.meta}</span>
      </Link>
      {item.bounce && item.taskId ? <button type="button" onClick={() => void dismiss(item.taskId!)} disabled={Boolean(busyId)} aria-label={`Dismiss ${item.title}`} title="Dismiss bounce review task" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50"><X size={15} /></button> : null}
    </div>) : <p className="py-8 text-center text-xs text-[color:var(--portal-muted)]">No priorities pending.</p>}
    {error ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}
  </div>
}
