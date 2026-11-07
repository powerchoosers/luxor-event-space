'use client'

import React from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Workflow,
  X,
  Zap,
} from '@/lib/icons/phosphor-compat'
import { PortalModal, PortalButton } from '@/components/portal/PortalUI'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export interface ElenaWorkflowArchitectModalProps {
  isOpen: boolean
  onClose: () => void
  definition?: CustomWorkflowDefinition
  workflowName?: string
  onApplyWorkflow: (result: { name: string; definition: CustomWorkflowDefinition }) => void
}

const SUGGESTED_PROMPTS = [
  'Use a saved HTML template for a warm tour invitation. Have Elena personalize the copy and layout for each client.',
  'Write a fresh personal email for each new inquiry, using their event details and one easy question about a tour.',
  'Send a tour reminder with our address from Settings, then create a call task if the client misses the visit.',
]

export function ElenaWorkflowArchitectModal({
  isOpen,
  onClose,
  definition,
  workflowName,
  onApplyWorkflow,
}: ElenaWorkflowArchitectModalProps) {
  const [prompt, setPrompt] = React.useState('')
  const [generating, setGenerating] = React.useState(false)
  const [generatedResult, setGeneratedResult] = React.useState<{
    name: string
    explanation: string
    definition: CustomWorkflowDefinition
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const requestRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    if (!isOpen) {
      requestRef.current?.abort()
      setPrompt('')
      setGenerating(false)
      setGeneratedResult(null)
      setError(null)
    }
  }, [isOpen])

  async function handleGenerate(customPrompt?: string) {
    const textToSubmit = (customPrompt || prompt).trim()
    if (!textToSubmit) return

    setGenerating(true)
    setError(null)
    setGeneratedResult(null)
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    try {
      const response = await fetch('/api/marketing/custom-workflows/ai-architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflowName ? `Current workflow: ${workflowName}. ${textToSubmit}` : textToSubmit, definition }),
        signal: controller.signal,
      })

      const data = (await response.json().catch(() => ({}))) as {
        name?: string
        explanation?: string
        definition?: CustomWorkflowDefinition
        error?: string
      }

      if (!response.ok || !data.definition || !data.name) {
        throw new Error(data.error || 'Elena could not architect this workflow.')
      }

      setGeneratedResult({
        name: data.name,
        explanation: data.explanation || 'Draft ready for review.',
        definition: data.definition,
      })
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'The draft could not be generated.')
    } finally {
      if (requestRef.current === controller) setGenerating(false)
    }
  }

  function handleApply() {
    if (!generatedResult) return
    onApplyWorkflow({
      name: generatedResult.name,
      definition: generatedResult.definition,
    })
    onClose()
  }

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Build with Elena">
      <div className="relative overflow-hidden border-b border-[color:var(--portal-border)] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]">
              <Workflow size={22} />
            </div>
            <div>
              <h2 className="mt-0.5 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">
                Build with Elena
              </h2>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                Describe the follow-up you want. Elena uses venue settings, saved templates, and this draft.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close workflow builder"
            className="rounded-lg p-2 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-y-auto portal-scrollbar p-6 sm:p-8 space-y-6">
        {/* Prompt Input Box */}
        <div className="relative rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm focus-within:border-[#caa24c] focus-within:ring-2 focus-within:ring-[#caa24c]/20">
          <textarea
            value={prompt}
            aria-label="Workflow instructions"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleGenerate()
              }
            }}
            placeholder="e.g. Create a 3-touch wedding follow-up that sends a warm welcome email immediately, queues a high-priority call task for Arianna in 2 hours with talking points on date holds, and sends a follow-up text next morning..."
            rows={3}
            disabled={generating}
            className="w-full resize-none border-0 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--portal-border)] pt-3">
            <span className="text-[11px] text-[color:var(--portal-muted)]">
              Press <kbd className="rounded border border-[color:var(--portal-border)] px-1 py-0.5 font-mono text-[10px]">Ctrl+Enter</kbd> to generate
            </span>
            <PortalButton
              variant="primary"
              onClick={() => handleGenerate()}
              disabled={!prompt.trim() || generating}
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Preparing draft…
                </>
              ) : (
                <>
                  <Zap size={14} /> Generate draft
                </>
              )}
            </PortalButton>
          </div>
        </div>

        {/* Suggested Prompts */}
        {!generating && !generatedResult ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
              Quick Starting Points
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPrompt(p)
                  }}
                  className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-left text-xs text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 hover:bg-[color:var(--portal-soft)]"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {generating ? <div role="status" className="flex items-center gap-3 rounded-xl border border-[color:var(--portal-border)] p-4 text-xs leading-5 text-[color:var(--portal-muted)]"><RefreshCw size={16} className="shrink-0 animate-spin" /> Preparing a draft with your instructions, venue settings, and saved templates.</div> : null}

        {/* Error message */}
        {error ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-500">
            {error}
          </div>
        ) : null}

        {/* Generated Result Card */}
        {generatedResult && !generating ? (
          <div className="relative rounded-2xl border-2 border-[#caa24c]/70 bg-[color:var(--portal-card)] p-5 sm:p-6 shadow-sm">

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="rounded-full bg-[#caa24c]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8c6424] dark:text-[#f1d27a]">
                  Proposed workflow
                </span>
                <h3 className="mt-2 font-serif text-xl font-semibold text-[color:var(--portal-text)]">
                  {generatedResult.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">
                  {generatedResult.explanation}
                </p>
              </div>
              <span className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--portal-text)]">
                Trigger: {generatedResult.definition.trigger.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Steps Preview */}
            <div className="mt-5 space-y-2.5 border-t border-[color:var(--portal-border)] pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                Configured Sequence ({generatedResult.definition.steps.length} Steps)
              </p>
              <div className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40">
                {generatedResult.definition.steps.map((step, idx) => (
                  <div key={step.id || idx} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--portal-border)] font-mono text-[10px] font-bold text-[color:var(--portal-muted)]">
                        {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {step.type === 'email' ? (
                          <Mail size={14} className="text-[#a8792f]" />
                        ) : step.type === 'text' ? (
                          <MessageSquare size={14} className="text-sky-500" />
                        ) : step.type === 'call_task' ? (
                          <Phone size={14} className="text-emerald-500" />
                        ) : step.type === 'wait' ? (
                          <Clock size={14} className="text-amber-500" />
                        ) : (
                          <CheckCircle2 size={14} className="text-stone-400" />
                        )}
                        <span className="font-semibold text-[color:var(--portal-text)]">
                          {step.name}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-[11px] text-[color:var(--portal-muted)] uppercase">
                      {step.type === 'call_task' ? `Call (${step.priority})` : step.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[color:var(--portal-muted)]">Applying replaces the current unsaved draft. Review the sender, content, and timing before saving. No contacts are enrolled and no messages are sent.</p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[color:var(--portal-border)] pt-4">
              <PortalButton
                variant="secondary"
                onClick={() => setGeneratedResult(null)}
              >
                Refine Prompt
              </PortalButton>
              <PortalButton
                variant="primary"
                onClick={handleApply}
              >
                Apply to this draft <ArrowRight size={14} />
              </PortalButton>
            </div>
          </div>
        ) : null}
      </div>
    </PortalModal>
  )
}
