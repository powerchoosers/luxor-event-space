'use client'

import React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { Check, ChevronDown, LoaderCircle, Save, Workflow } from 'lucide-react'
import {
  CUSTOM_WORKFLOW_TRIGGER_LABELS,
  type CustomWorkflowDefinition,
  type CustomWorkflowStep,
} from '@/lib/luxorCustomWorkflowDefinition'
import { WorkflowVariableText } from './WorkflowTokenEditor'

export type ElenaWorkflowDraftPayload = {
  name: string
  explanation: string
  definition: CustomWorkflowDefinition
  source: 'ai' | 'heuristic'
  canSave: boolean
  savedWorkflowId?: string
  savedWorkflowName?: string
}

type ElenaWorkflowDraftCardProps = {
  draft: ElenaWorkflowDraftPayload
  onSaved: (workflow: { id: string; name: string }) => void
}

function stepKind(step: CustomWorkflowStep) {
  switch (step.type) {
    case 'call_task': return 'Call task'
    case 'email': return 'Email'
    case 'text': return 'Text'
    case 'wait': return 'Wait'
    case 'condition': return 'Condition'
    case 'end': return 'End'
  }
}

function stepDescription(step: CustomWorkflowStep) {
  switch (step.type) {
    case 'call_task':
      return `${step.priority} priority · due within ${step.dueWithinHours} hours${step.assignee ? ` · ${step.assignee}` : ''}`
    case 'email':
      return step.mode === 'existing_inquiry_acknowledgment'
        ? 'Uses the existing inquiry acknowledgment.'
        : `Subject: ${step.subject || 'AI generated from the step instructions'}`
    case 'text':
      return step.generationMode === 'ai' ? `AI drafted from: ${step.aiPrompt || 'No prompt provided'}` : step.body
    case 'wait':
      return step.amount === null ? 'Delay needs to be configured.' : `Wait ${step.amount} ${step.unit}`
    case 'condition':
      return `Continue only when ${step.condition.replaceAll('_', ' ')} is true; otherwise stop.`
    case 'end':
      return 'No further steps.'
  }
}

function StepDetails({ step }: { step: CustomWorkflowStep }) {
  if (step.type === 'email' && step.mode !== 'existing_inquiry_acknowledgment') {
    return <div className="mt-2 space-y-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--portal-muted)]">
      {step.previewText ? <p>Preview: <WorkflowVariableText value={step.previewText} /></p> : null}
      {step.body ? <p><WorkflowVariableText value={step.body} /></p> : step.aiPrompt ? <p>AI copy instructions: <WorkflowVariableText value={step.aiPrompt} /></p> : null}
      {step.ctaText ? <p>Button: <WorkflowVariableText value={step.ctaText} /> · <WorkflowVariableText value={step.ctaUrl} /></p> : null}
    </div>
  }
  if (step.type === 'call_task' && step.scriptNotes) {
    return <WorkflowVariableText value={step.scriptNotes} className="mt-2 block whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--portal-muted)]" />
  }
  return null
}

export function ElenaWorkflowDraftCard({ draft, onSaved }: ElenaWorkflowDraftCardProps) {
  const reduceMotion = useReducedMotion()
  const [isSequenceOpen, setIsSequenceOpen] = React.useState(false)
  const sequenceDetailsId = React.useId()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const savedId = draft.savedWorkflowId
  const [savedWorkflow, setSavedWorkflow] = React.useState(savedId ? {
    id: savedId,
    name: draft.savedWorkflowName || draft.name,
  } : null)

  async function saveDraft() {
    if (saving || savedWorkflow || !draft.canSave) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/marketing/custom-workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, definition: draft.definition }),
      })
      const result = await response.json().catch(() => ({})) as {
        workflow?: { id?: string; name?: string }
        error?: string
      }
      if (!response.ok || !result.workflow?.id) {
        throw new Error(result.error || 'Could not save this workflow draft.')
      }
      const workflow = { id: result.workflow.id, name: result.workflow.name || draft.name }
      setSavedWorkflow(workflow)
      onSaved(workflow)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this workflow draft.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-2 w-full min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[color:var(--portal-text)] sm:p-4" aria-label="Custom workflow draft">
      <div className="flex min-w-0 items-start gap-3">
        <Workflow size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a8792f]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Workflow draft</p>
          <h4 className="mt-1 break-words text-sm font-semibold">{draft.name}</h4>
          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{draft.explanation}</p>
          <p className="mt-2 break-words text-[11px] font-medium text-[color:var(--portal-text)]">
            Trigger: {CUSTOM_WORKFLOW_TRIGGER_LABELS[draft.definition.trigger].label} · {draft.definition.steps.length} steps
          </p>
        </div>
      </div>

      <div className="group mt-3 border-t border-[color:var(--portal-border)] pt-2">
        <button
          type="button"
          aria-expanded={isSequenceOpen}
          aria-controls={sequenceDetailsId}
          onClick={() => setIsSequenceOpen((open) => !open)}
          className="flex min-h-10 w-full cursor-pointer list-none items-center justify-between gap-2 text-left text-xs font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
        >
          Review sequence and message copy
          <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 ${isSequenceOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {isSequenceOpen ? (
            <motion.div
              id={sequenceDetailsId}
              key="workflow-sequence-details"
              aria-hidden={!isSequenceOpen}
              inert={!isSequenceOpen}
              initial={reduceMotion ? false : { height: 0 }}
              animate={{ height: 'auto' }}
              exit={{
                height: 0,
                transition: {
                  duration: reduceMotion ? 0 : 0.5,
                  ease: [0.4, 0, 0.2, 1],
                },
              }}
              transition={{
                duration: reduceMotion ? 0 : 0.5,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="overflow-hidden"
            >
              <ol className="mt-1 space-y-2">
                {draft.definition.steps.map((step, index) => (
                  <li key={`${step.id}-${index}`} className="min-w-0 rounded-lg bg-[color:var(--portal-soft)] p-2.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[10px] font-semibold tabular-nums text-[color:var(--portal-muted)]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-xs font-semibold">{step.name}</p>
                        <p className="mt-0.5 break-words text-[11px] leading-4 text-[color:var(--portal-muted)]">{stepKind(step)} · <WorkflowVariableText value={stepDescription(step)} /></p>
                        <StepDetails step={step} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p className="mt-3 border-t border-[color:var(--portal-border)] pt-3 text-[11px] leading-4 text-[color:var(--portal-muted)]">
        Saving creates a draft only. It will not enroll contacts or send messages. To change the sequence or copy, tell Elena what to adjust before saving.
      </p>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {savedWorkflow ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
          <p className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check size={14} aria-hidden="true" /> Saved as a draft</p>
          <Link href={`/portal/marketing/custom-workflows/${encodeURIComponent(savedWorkflow.id)}`} className="inline-flex min-h-10 items-center rounded-md px-3 text-xs font-semibold text-[#8c6424] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#f1d27a]">
            Open draft
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
          {!draft.canSave ? <p className="text-xs text-[color:var(--portal-muted)]">Workflow draft saving is disabled by the current Luxor controls.</p> : null}
          <button type="button" onClick={() => void saveDraft()} disabled={saving || !draft.canSave} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] transition hover:bg-[#d6b45f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none">
            {saving ? <LoaderCircle size={14} aria-hidden="true" className="animate-spin" /> : <Save size={14} aria-hidden="true" />}
            {saving ? 'Saving draft…' : 'Save draft'}
          </button>
        </div>
      )}
    </section>
  )
}
