'use client'

import React from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  CornerDownLeft,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { PortalModal, PortalButton } from '@/components/portal/PortalUI'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export interface ElenaWorkflowArchitectModalProps {
  isOpen: boolean
  onClose: () => void
  onApplyWorkflow: (result: { name: string; definition: CustomWorkflowDefinition }) => void
}

const SUGGESTED_PROMPTS = [
  'Quinceañera dream inquiry VIP nurture with priority call within 2 hours',
  'SMS opt-in instant welcome + photo gallery link + next day phone check-in',
  'Tour 24h reminder with directions & parking details',
  'Post-tour proposal follow-up with custom package options',
  'Tour no-show gentle re-engagement and easy reschedule link',
]

const SYNTHESIS_LOGS = [
  'Ingesting workflow intent and sales cadence rules...',
  'Evaluating optimal event trigger...',
  'Injecting Luxor dynamic variable tokens ({{first_name}}, {{event_type}})...',
  'Drafting operator call task script notes for Arianna...',
  'Enforcing TCPA & SMS marketing consent boundaries...',
  'Calibrating wait delays and sequence completion nodes...',
]

export function ElenaWorkflowArchitectModal({
  isOpen,
  onClose,
  onApplyWorkflow,
}: ElenaWorkflowArchitectModalProps) {
  const [prompt, setPrompt] = React.useState('')
  const [generating, setGenerating] = React.useState(false)
  const [activeLogIndex, setActiveLogIndex] = React.useState(0)
  const [generatedResult, setGeneratedResult] = React.useState<{
    name: string
    explanation: string
    definition: CustomWorkflowDefinition
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Animated beam container and refs
  const containerRef = React.useRef<HTMLDivElement>(null)
  const coreRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const commsRef = React.useRef<HTMLDivElement>(null)
  const taskRef = React.useRef<HTMLDivElement>(null)
  const goalRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!isOpen) {
      setPrompt('')
      setGenerating(false)
      setGeneratedResult(null)
      setError(null)
    }
  }, [isOpen])

  React.useEffect(() => {
    if (!generating) return
    const interval = setInterval(() => {
      setActiveLogIndex((prev) => (prev + 1) % SYNTHESIS_LOGS.length)
    }, 700)
    return () => clearInterval(interval)
  }, [generating])

  async function handleGenerate(customPrompt?: string) {
    const textToSubmit = (customPrompt || prompt).trim()
    if (!textToSubmit) return

    setGenerating(true)
    setError(null)
    setGeneratedResult(null)
    setActiveLogIndex(0)

    try {
      const response = await fetch('/api/marketing/custom-workflows/ai-architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToSubmit }),
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

      // Small pause to let the visual animation conclude satisfyingly
      await new Promise((resolve) => setTimeout(resolve, 1400))

      setGeneratedResult({
        name: data.name,
        explanation: data.explanation || 'Workflow ready for review and activation.',
        definition: data.definition,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Architecting failed.')
    } finally {
      setGenerating(false)
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
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Elena Workflow Architect">
      <div className="relative overflow-hidden border-b border-[color:var(--portal-border)] px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]">
              <Compass size={22} className="animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">
                  Agentic AI System
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Elena Ready
                </span>
              </div>
              <h2 className="mt-0.5 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">
                Elena Workflow Architect
              </h2>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                Describe any sales cadence, event nurture, or operator task sequence in plain language.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
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
              Press <kbd className="rounded border border-[color:var(--portal-border)] px-1 py-0.5 font-mono text-[10px]">Ctrl+Enter</kbd> to architect
            </span>
            <PortalButton
              variant="primary"
              onClick={() => handleGenerate()}
              disabled={!prompt.trim() || generating}
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Architecting...
                </>
              ) : (
                <>
                  <Zap size={14} /> Architect Workflow
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
                    handleGenerate(p)
                  }}
                  className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-left text-xs text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 hover:bg-[color:var(--portal-soft)]"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Dynamic Visual Generation Stream */}
        {generating ? (
          <div
            ref={containerRef}
            className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#caa24c]/40 bg-gradient-to-b from-[#caa24c]/5 to-transparent p-8 sm:p-12 text-center"
          >
            <BorderBeam size={200} duration={4} colorFrom="#f1d27a" colorTo="#caa24c" />

            {/* Simulated Agent Graph */}
            <div className="relative flex w-full max-w-md items-center justify-between gap-4 py-6">
              <div
                ref={triggerRef}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-sm"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#caa24c]/20 text-[#8c6424] dark:text-[#f1d27a]">
                  <Workflow size={16} />
                </div>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)]">Trigger</span>
              </div>

              <div
                ref={coreRef}
                className="relative flex flex-col items-center gap-2 rounded-2xl border-2 border-[#caa24c] bg-[color:var(--portal-card)] p-4 shadow-lg ring-4 ring-[#caa24c]/20"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#caa24c] text-[#17130b]">
                  <Bot size={24} />
                </div>
                <span className="font-serif text-xs font-bold text-[color:var(--portal-text)]">Elena Engine</span>
              </div>

              <div className="flex flex-col gap-3">
                <div
                  ref={commsRef}
                  className="flex items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 shadow-sm"
                >
                  <Mail size={13} className="text-[#a8792f]" />
                  <span className="text-[10px] font-bold text-[color:var(--portal-text)]">Email / SMS</span>
                </div>
                <div
                  ref={taskRef}
                  className="flex items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 shadow-sm"
                >
                  <Phone size={13} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-[color:var(--portal-text)]">Arianna Call</span>
                </div>
              </div>
            </div>

            {/* Magic UI Animated Beams connecting graph */}
            <AnimatedBeam containerRef={containerRef} fromRef={triggerRef} toRef={coreRef} duration={2.5} />
            <AnimatedBeam containerRef={containerRef} fromRef={coreRef} toRef={commsRef} duration={2.5} />
            <AnimatedBeam containerRef={containerRef} fromRef={coreRef} toRef={taskRef} duration={2.8} />

            <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[#8c6424] dark:text-[#f1d27a]">
              <Activity size={15} className="animate-pulse" />
              <span>{SYNTHESIS_LOGS[activeLogIndex]}</span>
            </div>
          </div>
        ) : null}

        {/* Error message */}
        {error ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-500">
            {error}
          </div>
        ) : null}

        {/* Generated Result Card */}
        {generatedResult && !generating ? (
          <div className="relative rounded-2xl border-2 border-[#caa24c]/70 bg-[color:var(--portal-card)] p-5 sm:p-6 shadow-sm">
            <BorderBeam size={180} duration={6} colorFrom="#caa24c" colorTo="#f1d27a" />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="rounded-full bg-[#caa24c]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8c6424] dark:text-[#f1d27a]">
                  Synthesized Workflow
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
                Apply to Visual Builder <ArrowRight size={14} />
              </PortalButton>
            </div>
          </div>
        ) : null}
      </div>
    </PortalModal>
  )
}
