'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type Priority = {
  id?: string
  title: string
  meta: string
  href: string
  isOverdue?: boolean
  completed?: boolean
  taskId?: string
  bounce?: boolean
  reasoning?: string
  actionType?: string
}

export function TodayPriorities({ items }: { items: Priority[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Map of item key to completed status for instant optimistic UI
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    items.forEach((item) => {
      const key = item.id || item.taskId || `${item.href}-${item.title}`
      initial[key] = Boolean(item.completed)
    })
    return initial
  })

  async function toggleComplete(item: Priority) {
    const key = item.id || item.taskId || `${item.href}-${item.title}`
    const nextState = !completedMap[key]

    // Optimistically update
    setCompletedMap((prev) => ({ ...prev, [key]: nextState }))
    setError('')

    try {
      if (item.id && !item.id.startsWith('local-')) {
        const res = await fetch('/api/portal/daily-priorities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, completed: nextState }),
        })
        if (!res.ok) throw new Error('Could not update priority state.')
      } else if (item.taskId) {
        await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.taskId,
            status: nextState ? 'completed' : 'pending',
          }),
        })
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setCompletedMap((prev) => ({ ...prev, [key]: !nextState }))
      setError(err instanceof Error ? err.message : 'Could not update priority.')
    }
  }

  async function dismiss(taskId: string) {
    if (busyId) return
    setBusyId(taskId)
    setError('')
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'cancelled' }),
      })
      if (!response.ok) throw new Error('Could not dismiss this task.')
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss this task.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3.5">
      {items.length ? (
        items.map((item) => {
          const key = item.id || item.taskId || `${item.href}-${item.title}`
          const isDone = Boolean(completedMap[key])

          return (
            <div
              key={key}
              className="group relative flex items-center gap-2.5 border-b border-dashed border-[color:var(--portal-border)]/35 pb-3 last:border-b-0 last:pb-0"
            >
              {/* Checkbox button: clean, balanced circular check target */}
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                onClick={() => void toggleComplete(item)}
                aria-label={`Mark "${item.title}" ${isDone ? 'incomplete' : 'complete'}`}
                title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                className={`portal-checkbox portal-inline-action relative flex !h-4 !w-4 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded-full border transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c] ${
                  isDone
                    ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-xs'
                    : 'border-[color:var(--portal-border)]/90 bg-transparent hover:border-[#caa24c] hover:bg-[#caa24c]/10'
                }`}
              >
                <AnimatePresence>
                  {isDone && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-center"
                    >
                      <Check className="!h-2.5 !w-2.5 stroke-[3]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              {/* Priority Title & Meta Link */}
              <Link
                href={item.href}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left no-underline hover:text-[#a8792f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]"
                title={item.reasoning || item.title}
              >
                <div className="relative min-w-0 flex-1 py-0.5">
                  <span
                    className={`block text-xs font-medium leading-relaxed transition-colors duration-200 ${
                      isDone
                        ? 'text-[color:var(--portal-muted)] opacity-55'
                        : 'text-[color:var(--portal-text)]'
                    }`}
                  >
                    {item.title}
                  </span>

                  {/* Animated organic pencil strikethrough across text */}
                  {isDone && (
                    <svg
                      className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 w-full overflow-visible"
                      preserveAspectRatio="none"
                      viewBox="0 0 100 10"
                    >
                      <motion.path
                        d="M 0 5.2 Q 25 3.2, 50 6.2 T 100 4.6"
                        fill="none"
                        stroke="#caa24c"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.9 }}
                        exit={{ pathLength: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </svg>
                  )}
                </div>

                <span
                  className={`shrink-0 text-[10px] font-semibold tabular-nums transition-opacity duration-200 ${
                    isDone
                      ? 'text-[color:var(--portal-muted)] opacity-40 line-through'
                      : item.isOverdue
                        ? 'rounded bg-red-50 px-2 py-0.5 text-[#b93c3c] dark:bg-red-500/10 dark:text-red-400'
                        : item.meta.toLowerCase().includes('inquiry') || item.meta.toLowerCase().includes('new')
                          ? 'rounded bg-[#caa24c]/15 px-2 py-0.5 text-[#9a6e25] dark:bg-[#caa24c]/20 dark:text-[#dfbd68]'
                          : item.meta.toLowerCase().includes('today')
                            ? 'rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'text-[color:var(--portal-muted)]'
                  }`}
                >
                  {item.meta}
                </span>
              </Link>

              {/* Dismiss button for bounce tasks */}
              {item.bounce && item.taskId ? (
                <button
                  type="button"
                  onClick={() => void dismiss(item.taskId!)}
                  disabled={Boolean(busyId)}
                  aria-label={`Dismiss ${item.title}`}
                  title="Dismiss bounce review task"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          )
        })
      ) : (
        <p className="py-8 text-center text-xs text-[color:var(--portal-muted)]">
          No priorities pending.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  )
}
