'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import { DYNAMIC_VARIABLE_CHIPS } from '@/lib/luxorCustomWorkflowDefinition'

export interface WorkflowVariableChipsBarProps {
  onInsert: (token: string) => void
  className?: string
}

export function WorkflowVariableChipsBar({ onInsert, className = '' }: WorkflowVariableChipsBarProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
          Insert Dynamic Variable Chip
        </span>
        <span className="text-[10px] text-[color:var(--portal-muted)]">
          Click to insert at cursor
        </span>
      </div>
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {DYNAMIC_VARIABLE_CHIPS.map((chip) => (
          <button
            key={chip.token}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onInsert(chip.token)}
            title={`Preview: ${chip.preview}`}
            className="group inline-flex !min-h-9 items-center gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 py-0 text-[11px] font-medium text-[color:var(--portal-text)] transition hover:border-[#caa24c]/60 hover:bg-[#caa24c]/10 hover:text-[#8c6424] dark:hover:text-[#f1d27a] sm:!min-h-0 sm:py-1"
          >
            <Plus size={10} className="text-[#a8792f] transition group-hover:scale-125" />
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
