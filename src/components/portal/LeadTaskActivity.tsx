'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LuxorTask } from '@/lib/luxorInquiryTypes'
import { Check, CheckCircle2 } from '@/lib/icons/phosphor-compat'
import { formatFollowUpDateLabel } from '@/lib/luxorFollowUpHelpers'
import { formatActivityAuthor } from '@/lib/luxorActivityAuthor'
import { LeadActivityDisclosure } from '@/components/portal/LeadActivityDisclosure'
import { PortalStatusBadge } from '@/components/portal/PortalUI'

export function LeadTaskActivity({ task, timestamp, onOpenTasks, onToggleTask, defaultOpen = false }: {
  task: LuxorTask
  timestamp: string
  onOpenTasks: () => void
  onToggleTask?: (task: LuxorTask) => void
  defaultOpen?: boolean
}) {
  const [optimistic, setOptimistic] = useState<{ baseStatus: string; done: boolean } | null>(null)
  const isDone = optimistic?.baseStatus === task.status ? optimistic.done : task.status === 'completed'

  const cleanDescription = (task.description || '').replace(/^\[follow-up:(?:email|phone)\]\s*/i, '').replace(/^\[post-tour\]\s*/i, '').trim()
  const dateLabel = formatFollowUpDateLabel(task.due_at ?? null, task.due_date ?? null)
  const due = dateLabel === 'No date' ? (task.due_at || task.due_date ? 'Date unavailable' : 'No due date') : `Due ${dateLabel}`
  const displayStatus = isDone ? 'completed' : task.status === 'completed' ? 'pending' : task.status

  const handleToggle = () => {
    if (!onToggleTask) {
      onOpenTasks()
      return
    }
    if (!isDone && !task.workflow_name) {
      setOptimistic({ baseStatus: task.status, done: true })
    } else if (isDone) {
      setOptimistic({ baseStatus: task.status, done: false })
    }
    onToggleTask(task)
  }

  const checkboxControl = (
    <button
      type="button"
      role="checkbox"
      aria-checked={isDone}
      onClick={handleToggle}
      aria-label={`Mark "${task.title}" ${isDone ? 'incomplete' : 'complete'}`}
      title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
      className={`portal-checkbox portal-inline-action relative flex !h-5 !w-5 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c] ${
        isDone
          ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-xs'
          : 'border-[color:var(--portal-muted)]/45 bg-[color:var(--portal-card)] hover:border-[#caa24c] hover:bg-[#caa24c]/10'
      }`}
    >
      <AnimatePresence>
        {isDone && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center justify-center"
          >
            <Check className="!h-3 !w-3 stroke-[3]" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )

  return (
    <LeadActivityDisclosure
      icon={<CheckCircle2 size={16} />}
      leadingControl={checkboxControl}
      label="Task"
      title={task.title}
      crossOff={isDone}
      description={due}
      timestamp={timestamp}
      badge={<PortalStatusBadge status={displayStatus} borderless />}
      defaultOpen={defaultOpen}
    >
      {cleanDescription && <p className="whitespace-pre-wrap break-words text-sm text-[color:var(--portal-text)]">{cleanDescription}</p>}
      <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Priority: {task.priority}{task.assigned_to ? ` · Assigned to ${formatActivityAuthor(task.assigned_to)}` : ''}{task.call_outcome ? ` · Outcome: ${task.call_outcome.replaceAll('_', ' ')}` : ''}</p>
      <button type="button" onClick={onOpenTasks} className="mt-3 min-h-9 text-xs font-semibold text-[#8c6424] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#f1d27a] cursor-pointer">Open task section</button>
    </LeadActivityDisclosure>
  )
}
