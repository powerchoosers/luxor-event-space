'use client'

import type { LuxorTask } from '@/lib/luxorInquiryTypes'
import { CheckCircle2 } from '@/lib/icons/phosphor-compat'
import { formatFollowUpDateLabel } from '@/lib/luxorFollowUpHelpers'
import { LeadActivityDisclosure } from '@/components/portal/LeadActivityDisclosure'
import { PortalStatusBadge } from '@/components/portal/PortalUI'

export function LeadTaskActivity({ task, timestamp, onOpenTasks, defaultOpen = false }: {
  task: LuxorTask
  timestamp: string
  onOpenTasks: () => void
  defaultOpen?: boolean
}) {
  const cleanDescription = (task.description || '').replace(/^\[follow-up:(?:email|phone)\]\s*/i, '').replace(/^\[post-tour\]\s*/i, '').trim()
  const dateLabel = formatFollowUpDateLabel(task.due_at ?? null, task.due_date ?? null)
  const due = dateLabel === 'No date' ? (task.due_at || task.due_date ? 'Date unavailable' : 'No due date') : `Due ${dateLabel}`
  return <LeadActivityDisclosure icon={<CheckCircle2 size={16} />} label="Task" title={task.title} description={due} timestamp={timestamp} badge={<PortalStatusBadge status={task.status} borderless />} defaultOpen={defaultOpen}>
    {cleanDescription && <p className="whitespace-pre-wrap break-words text-sm text-[color:var(--portal-text)]">{cleanDescription}</p>}
    <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Priority: {task.priority}{task.call_outcome ? ` · Outcome: ${task.call_outcome.replaceAll('_', ' ')}` : ''}</p>
    <button type="button" onClick={onOpenTasks} className="mt-3 min-h-10 text-xs font-semibold text-[#8c6424] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#f1d27a]">Open task section</button>
  </LeadActivityDisclosure>
}
