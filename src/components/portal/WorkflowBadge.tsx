'use client'

import React from 'react'
import { Workflow } from '@/lib/icons/phosphor-compat'

interface WorkflowBadgeProps {
  workflowName: string | null | undefined
  workflowType?: 'system' | 'custom' | 'post_tour' | 'manual' | 'meeting' | string | null
  className?: string
  size?: 'sm' | 'md'
}

export function WorkflowBadge({
  workflowName,
  workflowType,
  className = '',
  size = 'sm',
}: WorkflowBadgeProps) {
  if (!workflowName?.trim()) return null

  let toneStyle = 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300'
  if (workflowType === 'system') {
    toneStyle = 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
  } else if (workflowType === 'post_tour') {
    toneStyle = 'border-[#caa24c]/30 bg-[#caa24c]/15 text-[#8c6529] dark:text-[#f1d27a]'
  } else if (workflowType === 'manual') {
    toneStyle = 'border-stone-500/25 bg-stone-500/10 text-stone-700 dark:text-stone-300'
  } else if (workflowType === 'meeting') {
    toneStyle = 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  }

  const paddingStyle = size === 'md'
    ? 'px-2.5 py-1 text-xs gap-1.5'
    : 'px-2 py-0.5 text-[10px] gap-1'

  return (
    <span
      title={`Workflow: ${workflowName}`}
      className={`inline-flex shrink-0 items-center rounded-full border font-semibold tracking-wide transition-colors ${toneStyle} ${paddingStyle} ${className}`}
    >
      <Workflow size={size === 'md' ? 13 : 11} className="shrink-0 opacity-80" aria-hidden="true" />
      <span className="truncate max-w-[200px]">{workflowName}</span>
    </span>
  )
}
