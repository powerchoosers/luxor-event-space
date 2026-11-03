'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Mail,
  MessageSquare,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { PortalPageFrame, PortalSelect, PortalButton, PortalAnimatedTabs, PortalTabTransition, PortalStaggerGroup, PortalStaggerCard } from '@/components/portal/PortalUI'
import {
  addCustomWorkflowStep,
  canEditCustomWorkflowStep,
  cloneCustomWorkflowDefinition,
  composeCustomWorkflowText,
  createNewContactFollowUpDefinition,
  CUSTOM_WORKFLOW_TEXT_MAX_LENGTH,
  CUSTOM_WORKFLOW_TEXT_OPT_OUT_FOOTER,
  CUSTOM_WORKFLOW_RUNTIME_TRIGGERS,
  CUSTOM_WORKFLOW_TRIGGER_LABELS,
  getCustomWorkflowTextBrand,
  getCustomWorkflowTextEditorContent,
  getCustomWorkflowTextEditorMaxLength,
  moveCustomWorkflowStep,
  removeCustomWorkflowStep,
  validateCustomWorkflowDefinition,
  type CustomWorkflowChannel,
  type CustomWorkflowDefinition,
  type CustomWorkflowStep,
  type CustomWorkflowTrigger,
} from '@/lib/luxorCustomWorkflowDefinition'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import { ElenaWorkflowArchitectModal } from '@/components/portal/ElenaWorkflowArchitectModal'
import { WorkflowVariableChipsBar } from '@/components/portal/WorkflowVariableChipsBar'
import { WorkflowTokenEditor, WorkflowVariableText, type WorkflowTokenEditorHandle } from '@/components/portal/WorkflowTokenEditor'
import { WorkflowEmailPreview, WorkflowEmailTemplateControls } from '@/components/portal/WorkflowEmailEditor'
import type { LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'

type WorkflowRow = {
  id: string
  name: string
  trigger_type: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  draft_definition: CustomWorkflowDefinition
  draft_revision: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

type ActivityRow = {
  id: string
  event_type: string
  actor_email: string | null
  created_at: string
  details: Record<string, unknown>
}

type WorkflowCapabilities = {
  canPause: boolean
  canResume: boolean
  canArchive: boolean
  canActivate: boolean
  activationMessage: string
}

type WorkflowPayload = {
  workflow: WorkflowRow
  definition?: CustomWorkflowDefinition
  activity: ActivityRow[]
  capabilities?: WorkflowCapabilities
  error?: string
}

type WorkflowEmailOptions = {
  senders: string[]
  operator: { displayName: string; email: string; roleTitle?: string }
  venue: { address: string; phone: string; email: string }
}

const ADDABLE_STEPS: Array<{ type: Exclude<CustomWorkflowChannel, 'end'>; label: string; icon: React.ReactNode }> = [
  { type: 'call_task', label: 'Call Task', icon: <Phone size={14} className="text-emerald-500" /> },
  { type: 'email', label: 'Email', icon: <Mail size={14} className="text-[#a8792f]" /> },
  { type: 'text', label: 'Text (SMS)', icon: <MessageSquare size={14} className="text-sky-500" /> },
  { type: 'wait', label: 'Wait / Delay', icon: <Clock size={14} className="text-amber-500" /> },
  { type: 'condition', label: 'Condition', icon: <Workflow size={14} className="text-purple-500" /> },
]

const WORKFLOW_DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeToWorkflowDesktopViewport(callback: () => void) {
  const query = window.matchMedia(WORKFLOW_DESKTOP_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getWorkflowDesktopViewportSnapshot() {
  return window.matchMedia(WORKFLOW_DESKTOP_QUERY).matches
}

export default function CustomWorkflowEditorPage() {
  const params = useParams<{ workflowId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const workflowId = String(params.workflowId || '')
  const isNew = workflowId === 'new'
  const prebuiltTemplateId = searchParams.get('from')

  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [workflow, setWorkflow] = React.useState<WorkflowRow | null>(null)
  const [capabilities, setCapabilities] = React.useState<WorkflowCapabilities | null>(null)

  // Initialize definition draft
  const [nameDraft, setNameDraft] = React.useState(() => {
    if (prebuiltTemplateId) {
      const match = PREBUILT_WORKFLOWS.find((p) => p.id === prebuiltTemplateId)
      if (match) return `${match.name} (Customized)`
    }
    return 'New Custom Workflow'
  })

  const [definitionDraft, setDefinitionDraft] = React.useState<CustomWorkflowDefinition>(() => {
    if (prebuiltTemplateId) {
      const match = PREBUILT_WORKFLOWS.find((p) => p.id === prebuiltTemplateId)
      if (match) return cloneCustomWorkflowDefinition(match.definition)
    }
    return createNewContactFollowUpDefinition()
  })

  const [selectedStepId, setSelectedStepId] = React.useState<string>(() => {
    return definitionDraft.steps[0]?.id || ''
  })

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [activating, setActivating] = React.useState(false)
  const [generatingAiCopy, setGeneratingAiCopy] = React.useState(false)
  const [isArchitectOpen, setIsArchitectOpen] = React.useState(false)
  const [inspectorTab, setInspectorTab] = React.useState<'edit' | 'preview'>('edit')
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [mobileInspectorOpen, setMobileInspectorOpen] = React.useState(false)
  const [inspectorBodyHeight, setInspectorBodyHeight] = React.useState<number | null>(null)
  const [emailOptions, setEmailOptions] = React.useState<WorkflowEmailOptions | null>(null)
  const [emailOptionsError, setEmailOptionsError] = React.useState<string | null>(null)
  const [emailOptionsRetry, setEmailOptionsRetry] = React.useState(0)
  const [duplicating, setDuplicating] = React.useState(false)
  const isDesktopViewport = React.useSyncExternalStore(
    subscribeToWorkflowDesktopViewport,
    getWorkflowDesktopViewportSnapshot,
    () => true,
  )
  const workspaceRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const inspectorRef = React.useRef<HTMLDivElement>(null)
  const inspectorContentRef = React.useRef<HTMLDivElement>(null)
  const callScriptEditorRef = React.useRef<WorkflowTokenEditorHandle>(null)

  React.useEffect(() => {
    if (!isNew || prebuiltTemplateId) return
    const savedDraft = sessionStorage.getItem('luxor_architect_draft')
    if (!savedDraft) return
    try {
      const draft = JSON.parse(savedDraft) as { name?: unknown; definition?: unknown }
      if (typeof draft.name !== 'string' || validateCustomWorkflowDefinition(draft.definition, { allowIncompleteDraft: true }).length) throw new Error('The Elena workflow draft could not be opened. Generate it again from the workflow builder.')
      const definition = cloneCustomWorkflowDefinition(draft.definition as CustomWorkflowDefinition)
      setNameDraft(draft.name)
      setDefinitionDraft(definition)
      setSelectedStepId(definition.steps[0]?.id || '')
      setFeedback('Elena draft loaded. Review the sender, content, and timing before saving.')
      sessionStorage.removeItem('luxor_architect_draft')
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'The Elena workflow draft could not be opened.')
    }
  }, [isNew, prebuiltTemplateId])

  React.useEffect(() => {
    const scrollport = workspaceRef.current?.closest<HTMLElement>('.portal-scrollbar')
    const columns = [canvasRef.current, inspectorRef.current].filter((column): column is HTMLDivElement => Boolean(column))
    if (!scrollport || columns.length !== 2) return

    // Each column follows the page until its last field reaches the viewport bottom.
    const updateStickyOffsets = () => {
      const bottomPadding = Number.parseFloat(getComputedStyle(scrollport).paddingBottom) || 0
      for (const column of columns) {
        const top = Math.min(0, scrollport.clientHeight - bottomPadding - column.offsetHeight)
        column.style.setProperty('--workflow-sticky-top', `${top}px`)
      }
    }
    const observer = new ResizeObserver(updateStickyOffsets)
    observer.observe(scrollport)
    columns.forEach((column) => observer.observe(column))
    updateStickyOffsets()
    return () => observer.disconnect()
  }, [loading])

  const dirty = isNew
    ? Boolean(nameDraft.trim() !== 'New Custom Workflow' || definitionDraft.steps.length > 0)
    : Boolean(
        workflow &&
          workflow.status === 'draft' &&
          (nameDraft !== workflow.name ||
            JSON.stringify(definitionDraft) !== JSON.stringify(workflow.draft_definition)),
      )

  const selectedStep = definitionDraft.steps.find((s) => s.id === selectedStepId) || null
  const validationErrors = React.useMemo(() => validateCustomWorkflowDefinition(definitionDraft), [definitionDraft])
  const editable = enabled === true && (isNew || workflow?.status === 'draft')
  const readOnlyVersion = Boolean(workflow && workflow.status !== 'draft')
  const canChangeLifecycle = workflow?.status === 'active' ? capabilities?.canPause : workflow?.status === 'paused' ? capabilities?.canResume : capabilities?.canActivate
  const triggerConnected = CUSTOM_WORKFLOW_RUNTIME_TRIGGERS.includes(definitionDraft.trigger)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch('/api/marketing/custom-workflows/email-options', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as WorkflowEmailOptions & { error?: string }
        if (!response.ok || !Array.isArray(payload.senders)) throw new Error(payload.error || 'Approved email senders could not load.')
        setEmailOptions(payload)
        setEmailOptionsError(null)
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setEmailOptionsError(requestError instanceof Error ? requestError.message : 'Approved email senders could not load.') })
    return () => controller.abort()
  }, [emailOptionsRetry])

  function updateEmailSettings(patch: Partial<NonNullable<CustomWorkflowDefinition['emailSettings']>>) {
    if (!editable) return
    setDefinitionDraft((current) => ({ ...current, emailSettings: { senderMode: 'operator', senderEmail: emailOptions?.senders[0] || '', ...current.emailSettings, ...patch } }))
    setFeedback(null)
  }

  React.useLayoutEffect(() => {
    const content = inspectorContentRef.current
    const body = content?.parentElement
    if (!content || !body) return

    const updateHeight = () => {
      const style = window.getComputedStyle(body)
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      setInspectorBodyHeight(Math.ceil(content.scrollHeight + verticalPadding))
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(content)
    updateHeight()
    return () => observer.disconnect()
  }, [inspectorTab, isDesktopViewport, selectedStepId])

  // Check authoring status
  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          enabled?: boolean
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || 'Custom workflow storage could not be checked.')
        setEnabled(payload.enabled === true)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Could not check workflow authorization.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Load existing workflow if not new
  React.useEffect(() => {
    if (isNew || enabled === null) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflowId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as WorkflowPayload
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Workflow could not load.')
        setWorkflow(payload.workflow)
        setCapabilities(payload.capabilities || null)
        setNameDraft(payload.workflow.name)
        const displayedDefinition = payload.definition || payload.workflow.draft_definition
        setDefinitionDraft(cloneCustomWorkflowDefinition(displayedDefinition))
        setSelectedStepId(displayedDefinition.steps[0]?.id || '')
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Workflow could not load.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [enabled, isNew, refreshKey, workflowId])

  // Step operations
  function changeStep(stepId: string, update: (step: CustomWorkflowStep) => CustomWorkflowStep) {
    if (!editable) return
    setDefinitionDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? update(step) : step)),
    }))
    setFeedback(null)
  }

  function updateStepField(stepId: string, key: string, value: unknown) {
    changeStep(stepId, (step) => ({ ...step, [key]: value }) as CustomWorkflowStep)
  }

  function selectStep(stepId: string) {
    setSelectedStepId(stepId)
    setMobileInspectorOpen(true)
  }

  function addStep(type: Exclude<CustomWorkflowChannel, 'end'>) {
    if (!editable) return
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
    const next = addCustomWorkflowStep(definitionDraft, type, id)
    setDefinitionDraft(next)
    setSelectedStepId(id)
    setMobileInspectorOpen(true)
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    if (!editable) return
    setDefinitionDraft((current) => moveCustomWorkflowStep(current, stepId, direction))
  }

  function removeStep(stepId: string) {
    if (!editable) return
    const step = definitionDraft.steps.find((c) => c.id === stepId)
    if (!step || !canEditCustomWorkflowStep(step)) return
    if (!window.confirm(`Remove “${step.name}” from this workflow?`)) return
    const next = removeCustomWorkflowStep(definitionDraft, stepId)
    setDefinitionDraft(next)
    setSelectedStepId(next.steps.find((c) => c.id !== stepId)?.id || '')
  }

  function handleInsertChip(token: string) {
    if (!selectedStep) return
    if (selectedStep.type === 'email') {
      const current = selectedStep.body || ''
      updateStepField(selectedStep.id, 'body', `${current} ${token}`.trim())
    } else if (selectedStep.type === 'text') {
      const current = selectedStep.body || ''
      updateStepField(selectedStep.id, 'body', `${current} ${token}`.trim())
    } else if (selectedStep.type === 'call_task') {
      callScriptEditorRef.current?.insertToken(token)
    }
  }

  // AI Message Copilot
  async function handleGenerateAiCopy(channel: 'email' | 'text') {
    if (!selectedStep || (selectedStep.type !== 'email' && selectedStep.type !== 'text')) return
    setGeneratingAiCopy(true)
    setError(null)

    try {
      const prompt =
        channel === 'email'
          ? (selectedStep?.type === 'email' ? selectedStep.aiPrompt : null) || 'Warm invitation email for a Luxor tour regarding their event.'
          : (selectedStep?.type === 'text' ? selectedStep.aiPrompt : null) || 'Friendly check-in text from Arianna asking if they want to schedule a tour.'

      const response = await fetch('/api/marketing/custom-workflows/ai-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          prompt,
          step: selectedStep,
          senderMode: definitionDraft.emailSettings?.senderMode || 'operator',
          senderEmail: definitionDraft.emailSettings?.senderEmail || emailOptions?.senders[0],
          leadContext: {
            eventType: '{{event_type}}',
            firstName: '{{first_name}}',
          },
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        subject?: string
        previewText?: string
        body?: string
        ctaText?: string
        ctaUrl?: string
        emailDocument?: LuxorEmailDocument
        error?: string
      }

      if (!response.ok || (!data.body && !data.emailDocument)) {
        throw new Error(data.error || 'Elena could not generate copy.')
      }

      if (channel === 'email') {
        changeStep(selectedStep.id, (step) => {
          if (step.type !== 'email') return step
          return {
            ...step,
            subject: data.subject || step.subject,
            previewText: data.previewText || step.previewText,
            body: data.body || step.body,
            ctaText: data.ctaText || step.ctaText,
            ctaUrl: data.ctaUrl || step.ctaUrl,
            ...(data.emailDocument ? { emailDocument: data.emailDocument } : {}),
          }
        })
      } else {
        changeStep(selectedStep.id, (step) => {
          if (step.type !== 'text') return step
          return {
            ...step,
            body: data.body || step.body,
          }
        })
      }
      setFeedback('Sample generated with Elena. Each eligible client receives a fresh version when the workflow runs.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generation failed.')
    } finally {
      setGeneratingAiCopy(false)
    }
  }

  // Save draft
  async function saveDraft() {
    setSaving(true)
    setError(null)
    setFeedback(null)

    try {
      if (isNew) {
        const response = await fetch('/api/marketing/custom-workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameDraft, definition: definitionDraft }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          workflow?: WorkflowRow
          error?: string
        }
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not save workflow draft.')
        router.replace(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
      } else {
        if (!workflow) return
        const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameDraft,
            definition: definitionDraft,
            expectedRevision: workflow.draft_revision,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          workflow?: WorkflowRow
          error?: string
        }
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not save workflow draft.')
        setWorkflow(payload.workflow)
        setDefinitionDraft(cloneCustomWorkflowDefinition(payload.workflow.draft_definition))
        setNameDraft(payload.workflow.name)
        setFeedback('Saved successfully.')
        setRefreshKey((v) => v + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save draft.')
    } finally {
      setSaving(false)
    }
  }

  // Activate workflow
  async function handleToggleActivate() {
    if (!workflow) return
    const nextAction = workflow.status === 'active' ? 'pause' : workflow.status === 'paused' ? 'resume' : 'activate'
    setActivating(true)
    setError(null)

    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      })
      const payload = (await response.json().catch(() => ({}))) as WorkflowPayload
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Lifecycle update failed.')
      setWorkflow(payload.workflow)
      setFeedback(`Workflow is now ${payload.workflow.status}.`)
      setRefreshKey((v) => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle change failed.')
    } finally {
      setActivating(false)
    }
  }

  async function duplicateToEdit() {
    if (!workflow || duplicating) return
    setDuplicating(true)
    setError(null)
    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}/duplicate`, { method: 'POST' })
      const payload = await response.json() as { workflow?: WorkflowRow; error?: string }
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not duplicate this workflow.')
      router.push(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not duplicate this workflow.')
    } finally { setDuplicating(false) }
  }

  if (loading && !workflow && !isNew) {
    return (
      <PortalPageFrame>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="animate-spin text-[#caa24c]" size={28} />
        </div>
      </PortalPageFrame>
    )
  }

  return (
    <PortalPageFrame className="flex h-full !min-h-0 flex-1 flex-col !gap-0 overflow-visible lg:h-auto lg:flex-none lg:!gap-6 lg:overflow-visible">
      {/* Elena Architect Modal */}
      <ElenaWorkflowArchitectModal
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        definition={definitionDraft}
        workflowName={nameDraft}
        onApplyWorkflow={({ name, definition }) => {
          setNameDraft(name)
          setDefinitionDraft(definition)
          setSelectedStepId(definition.steps[0]?.id || '')
          setFeedback('Elena architected workflow applied.')
        }}
      />

      {/* Top Navigation & Status Bar */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:rounded-xl lg:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/portal/marketing?tab=automations"
            aria-label="Go back"
            title="Go back"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                readOnly={!editable}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Workflow name"
                className="min-w-0 truncate font-serif text-lg font-semibold text-[color:var(--portal-text)] bg-transparent outline-none focus:ring-1 focus:ring-[#caa24c]/50 rounded px-1 -mx-1"
              />
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  workflow?.status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {workflow?.status || 'Draft'}
              </span>
            </div>
            <p className="text-[11px] text-[color:var(--portal-muted)]">
              {definitionDraft.steps.length} steps configured · {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-nowrap items-center gap-2 lg:w-auto">
          {/* Elena Architect Button */}
          <button
            type="button"
            onClick={() => setIsArchitectOpen(true)}
            disabled={!editable}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-[color:var(--portal-border)] px-2 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 lg:min-h-9 lg:flex-none lg:border-0 lg:px-2"
          >
            <Image src="/luxor-concierge.png" alt="" width={24} height={24} className="h-6 w-6 rounded-full object-cover" />
            <span>Build with Elena</span>
          </button>

          {/* Save Draft Button */}
          <PortalButton
            variant="primary"
            onClick={saveDraft}
            disabled={!editable || saving || (!dirty && !isNew)}
            className="min-h-9 min-w-0 flex-1 px-2 text-xs lg:flex-none lg:px-4"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Save Draft</span>
          </PortalButton>

          {/* Activate / Pause Toggle (for saved workflows) */}
          {!isNew && workflow && workflow.status !== 'archived' ? (
            <PortalButton
              variant="secondary"
              onClick={handleToggleActivate}
              disabled={activating || !canChangeLifecycle || (workflow.status !== 'active' && !triggerConnected) || (workflow.status === 'draft' && (dirty || validationErrors.length > 0))}
              className="min-h-9 min-w-0 flex-1 text-xs lg:flex-none"
            >
              {activating ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : workflow.status === 'active' ? (
                'Pause Workflow'
              ) : workflow.status === 'paused' ? (
                'Resume Workflow'
              ) : (
                'Activate Workflow'
              )}
            </PortalButton>
          ) : null}
        </div>
      </div>

      {/* Banner / Feedback Alerts */}
      {feedback ? (
        <div className="flex items-center justify-between border-b border-emerald-500/25 bg-emerald-500/10 px-6 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between border-b border-rose-500/25 bg-rose-500/10 px-6 py-2 text-xs text-rose-500">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {readOnlyVersion ? <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><p className="text-xs leading-5 text-[color:var(--portal-muted)]">This {workflow?.status} version is read-only. Duplicate it to make changes in a new draft.</p><button type="button" onClick={() => void duplicateToEdit()} disabled={duplicating || enabled !== true} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">{duplicating ? <RefreshCw size={14} className="animate-spin" /> : <Copy size={14} />} Duplicate to edit</button></div> : null}
      <section aria-label="Workflow email sender" className="shrink-0 space-y-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-4 lg:rounded-xl lg:border lg:px-5">
        <div><h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Email sender</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Applies to the email steps in this workflow. Replies return to the selected approved mailbox.</p></div>
        {emailOptions && !(readOnlyVersion && !definitionDraft.emailSettings) ? <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Send as</label><PortalSelect disabled={!editable} value={definitionDraft.emailSettings?.senderMode || 'operator'} onChange={(value) => updateEmailSettings({ senderMode: value as 'operator' | 'elena' })} options={[{ value: 'operator', label: readOnlyVersion && definitionDraft.emailSettings?.senderActorEmail ? `Saved user · ${definitionDraft.emailSettings.senderActorEmail}` : `${emailOptions.operator.displayName} · signed-in user` }, { value: 'elena', label: 'Elena · Luxor concierge' }]} /></div>
          <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">From email address</label><PortalSelect disabled={!editable} value={definitionDraft.emailSettings?.senderEmail || emailOptions.senders[0] || ''} onChange={(value) => updateEmailSettings({ senderEmail: value })} placeholder="No approved sender available" options={emailOptions.senders.map((email) => ({ value: email, label: email }))} /></div>
        </div> : readOnlyVersion && !definitionDraft.emailSettings ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Uses the existing Luxor business sender. Duplicate this workflow to choose a user or Elena and a sending address.</p> : <p role="status" className="text-xs text-[color:var(--portal-muted)]">{emailOptionsError ? 'Sender options unavailable.' : 'Loading approved sender options…'}</p>}
        {emailOptionsError ? <p role="alert" className="text-xs leading-5 text-rose-600 dark:text-rose-400">{emailOptionsError} <button type="button" onClick={() => setEmailOptionsRetry((value) => value + 1)} className="underline">Retry</button></p> : null}
        {emailOptions && !emailOptions.senders.length ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">Configure an approved sending address in Settings before activating email steps.</p> : null}
        {emailOptions?.venue.address ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Venue context from Settings: {emailOptions.venue.address}</p> : null}
      </section>

      {/* Main Workspace Frame: Two Columns (Canvas + Inspector) */}
      <div ref={workspaceRef} className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-none lg:flex-row lg:items-start lg:overflow-visible">
        {/* Left Column: Visual Sequencer Canvas */}
        <div ref={canvasRef} className="min-h-0 flex-1 overflow-y-auto portal-scrollbar p-4 lg:sticky lg:top-[var(--workflow-sticky-top,0px)] lg:self-start lg:overflow-visible lg:py-8 lg:pr-8 lg:pl-0 space-y-4">
          {/* Trigger Header Card */}
          <div className="rounded-2xl border-2 border-[#caa24c]/60 bg-[color:var(--portal-card)] p-4 lg:p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#caa24c] text-[#17130b]">
                  <Workflow size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">
                    Workflow Trigger
                  </span>
                  <h3 className="font-serif text-base font-semibold text-[color:var(--portal-text)]">
                    {CUSTOM_WORKFLOW_TRIGGER_LABELS[definitionDraft.trigger]?.label || 'Trigger Event'}
                  </h3>
                </div>
              </div>

              {/* Trigger Dropdown */}
              <div className="w-full lg:w-64">
                <PortalSelect
                  value={definitionDraft.trigger}
                  disabled={!editable}
                  onChange={(val) => {
                    setDefinitionDraft((curr) => ({
                      ...curr,
                      trigger: val as CustomWorkflowTrigger,
                    }))
                  }}
                  options={[...CUSTOM_WORKFLOW_RUNTIME_TRIGGERS, ...(triggerConnected ? [] : [definitionDraft.trigger])].map((t) => ({
                    value: t,
                    label: `${CUSTOM_WORKFLOW_TRIGGER_LABELS[t]?.label || t}${CUSTOM_WORKFLOW_RUNTIME_TRIGGERS.includes(t) ? '' : ' · automatic enrollment not connected'}`,
                  }))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-[color:var(--portal-muted)]">
              {CUSTOM_WORKFLOW_TRIGGER_LABELS[definitionDraft.trigger]?.description}
            </p>
            {!triggerConnected ? <p role="alert" className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Automatic enrollment for this trigger is not connected yet. {readOnlyVersion ? 'Duplicate this workflow and choose Manual enrollment or Contact form inquiry before activating a revised draft.' : 'Choose Manual enrollment or Contact form inquiry before activating this draft.'}</p> : null}
          </div>

          {/* Step Timeline Nodes */}
          <div className="relative my-4 ml-0 space-y-3 border-l-0 border-[#caa24c]/30 pl-0 lg:ml-6 lg:border-l-2 lg:pl-4">
            {definitionDraft.steps.map((step, idx) => {
              const isSelected = selectedStepId === step.id
              const isEnd = step.type === 'end'
              const canEdit = canEditCustomWorkflowStep(step)

              return (
                <div key={step.id || idx} className="relative group">
                  {/* Step Card */}
                  <div
                    onClick={() => selectStep(step.id)}
                    className={`relative cursor-pointer rounded-2xl border p-4 transition ${
                      isSelected
                        ? 'border-[#caa24c] bg-[#caa24c]/10 shadow-sm ring-2 ring-[#caa24c]/30'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Step Type Icon */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#fff] sm:text-white ${
                            step.type === 'call_task'
                              ? 'bg-emerald-500'
                              : step.type === 'email'
                              ? 'bg-[#a8792f]'
                              : step.type === 'text'
                              ? 'bg-sky-500'
                              : step.type === 'wait'
                              ? 'bg-amber-500'
                              : step.type === 'condition'
                              ? 'bg-purple-500'
                              : 'bg-stone-500'
                          }`}
                        >
                          {step.type === 'call_task' ? (
                            <Phone size={16} />
                          ) : step.type === 'email' ? (
                            <Mail size={16} />
                          ) : step.type === 'text' ? (
                            <MessageSquare size={16} />
                          ) : step.type === 'wait' ? (
                            <Clock size={16} />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-serif text-sm font-semibold text-[color:var(--portal-text)] truncate">
                              {step.name}
                            </span>
                            <span className="rounded bg-[color:var(--portal-soft)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[color:var(--portal-muted)]">
                              {step.type === 'call_task'
                                ? `Call (${step.priority})`
                                : step.type}
                            </span>
                            {((step.type === 'email' || step.type === 'text') && step.generationMode === 'ai') ? (
                              <span className="rounded-full bg-[#caa24c]/20 px-2 py-0.5 text-[10px] font-bold text-[#8c6424] dark:text-[#f1d27a]">
                                AI Powered
                              </span>
                            ) : null}
                          </div>

                          {/* Snippet preview */}
                          <div className="mt-1 text-xs text-[color:var(--portal-muted)] line-clamp-2">
                            {step.type === 'call_task' && step.scriptNotes ? (
                              <span>Script: <WorkflowVariableText value={step.scriptNotes} /></span>
                            ) : step.type === 'email' && step.subject ? (
                              <span>Subject: {step.subject}</span>
                            ) : step.type === 'text' && step.body ? (
                              <span>{step.body}</span>
                            ) : step.type === 'wait' ? (
                              <span>Wait {step.amount} {step.unit}</span>
                            ) : step.type === 'condition' ? (
                              <span>Condition: {step.condition}</span>
                            ) : isEnd ? (
                              <span>Sequence ends cleanly.</span>
                            ) : (
                              <span className="italic">Click to configure step details...</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step Action Buttons (move, delete) */}
                      {editable && canEdit && !isEnd ? (
                        <div
                          className="flex items-center gap-1 opacity-80 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => moveStep(step.id, -1)}
                            aria-label={`Move ${step.name} up`}
                            disabled={idx <= (definitionDraft.steps[0]?.type === 'email' && definitionDraft.steps[0].mode === 'existing_inquiry_acknowledgment' ? 1 : 0)}
                            className="grid size-10 place-items-center rounded text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(step.id, 1)}
                            aria-label={`Move ${step.name} down`}
                            disabled={idx >= definitionDraft.steps.length - 2}
                            className="grid size-10 place-items-center rounded text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(step.id)}
                            aria-label={`Remove ${step.name}`}
                            className="grid size-10 place-items-center rounded text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Add Step Connector between nodes */}
                  {!isEnd ? (
                    <div className="my-2 flex items-center justify-center">
                      <div className="h-4 w-0.5 bg-[#caa24c]/40" />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Add Step Button Bar */}
          <div className="rounded-2xl border border-dashed border-[#caa24c]/50 bg-[color:var(--portal-card)] p-4">
            <p className="text-center text-xs font-bold text-[color:var(--portal-text)] mb-3">
              + Insert Step Into Sequence
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {ADDABLE_STEPS.map((addable) => (
                <button
                  key={addable.type}
                  type="button"
                  onClick={() => addStep(addable.type)}
                  disabled={!editable}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c] hover:bg-[#caa24c]/10"
                >
                  {addable.icon}
                  <span>{addable.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Step Inspector & Live Preview */}
        <motion.div
          ref={inspectorRef}
          initial={false}
          animate={{
            x: mobileInspectorOpen || isDesktopViewport ? '0%' : '100%',
            visibility: mobileInspectorOpen || isDesktopViewport ? 'visible' : 'hidden',
          }}
          transition={{
            x: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            visibility: { delay: mobileInspectorOpen || isDesktopViewport ? 0 : 0.28 },
          }}
          aria-hidden={!mobileInspectorOpen && !isDesktopViewport}
          inert={!mobileInspectorOpen && !isDesktopViewport}
          className={`portal-inspector-surface flex min-h-0 flex-col shrink-0 lg:sticky lg:top-[var(--workflow-sticky-top,0px)] lg:self-start lg:overflow-visible lg:rounded-2xl lg:border lg:border-[color:var(--portal-border)] ${
            mobileInspectorOpen
              ? 'fixed inset-0 z-50 max-h-none overflow-hidden max-lg:!bg-[color:var(--portal-card)] lg:inset-x-auto lg:bottom-auto lg:max-h-none lg:w-[460px] xl:w-[500px] lg:shadow-none'
              : 'fixed inset-0 z-10 max-lg:pointer-events-none lg:static lg:flex lg:w-[460px] xl:w-[500px] border-t border-[color:var(--portal-border)]'
          }`}
        >
          {/* Inspector Header */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] px-5 py-3.5 portal-inspector-surface lg:!static lg:z-auto lg:rounded-t-[15px]">
            <PortalAnimatedTabs
              tabs={[
                { id: 'edit', label: 'Step Configuration' },
                { id: 'preview', label: 'Live Preview' },
              ]}
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              className="gap-3"
              buttonClassName="normal-case tracking-normal text-xs font-bold"
              ariaLabel="Step inspector views"
            />

            <button
              type="button"
              onClick={() => setMobileInspectorOpen(false)}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
              aria-label="Close configuration panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* Inspector Body */}
          <motion.div
            initial={false}
            animate={{ height: isDesktopViewport && inspectorBodyHeight ? `${inspectorBodyHeight}px` : 'auto' }}
            transition={{ height: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:flex-none lg:overflow-hidden"
          >
            <div ref={inspectorContentRef}>
            <PortalTabTransition activeKey={`${inspectorTab}:${selectedStep?.id || 'none'}`} className="space-y-5" mode="popLayout">
            {!selectedStep ? (
              <PortalStaggerCard className="py-12 text-center text-xs text-[color:var(--portal-muted)]">
                Select a step on the canvas to configure its properties.
              </PortalStaggerCard>
            ) : inspectorTab === 'preview' ? (
              /* Live Preview with Real Lead Mock Context */
              <PortalStaggerGroup className="space-y-4" delayChildren={0.07} staggerDelay={0.05}>
                <PortalStaggerCard className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-muted)]">
                  Previewing with sample lead: <span className="font-semibold text-[color:var(--portal-text)]">{selectedStep.type === 'email' ? 'Sample Guest · Private celebration (80 guests)' : 'Sarah Jenkins · Wedding Reception (150 guests)'}</span>
                </PortalStaggerCard>

                {selectedStep.type === 'call_task' ? (
                  <PortalStaggerCard className="rounded-2xl border-2 border-emerald-500/50 bg-[color:var(--portal-card)] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <Phone size={15} /> Arianna Call Task Card
                    </div>
                    <h4 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">
                      {selectedStep.name}
                    </h4>
                    <div className="space-y-1.5 text-xs text-[color:var(--portal-muted)]">
                      <p>Priority: <span className="font-bold uppercase text-[color:var(--portal-text)]">{selectedStep.priority}</span></p>
                      <p>Due Timeframe: <span className="font-bold text-[color:var(--portal-text)]">Within {selectedStep.dueWithinHours}h</span></p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 text-xs text-[color:var(--portal-text)] whitespace-pre-wrap">
                      {selectedStep.scriptNotes
                        ?.replace(/\{\{\s*first_name\s*\}\}/g, 'Sarah')
                        ?.replace(/\{\{\s*full_name\s*\}\}/g, 'Sarah Jenkins')
                        ?.replace(/\{\{\s*event_type\s*\}\}/g, 'Wedding Reception')
                        ?.replace(/\{\{\s*guest_count\s*\}\}/g, '150 guests')
                        ?.replace(/\{\{\s*target_date\s*\}\}/g, 'October 24, 2026') || 'No script notes entered.'}
                    </div>
                  </PortalStaggerCard>
                ) : selectedStep.type === 'email' ? (
                  selectedStep.mode === 'existing_inquiry_acknowledgment' ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">The inquiry form sends the existing acknowledgment once. Its sender and content follow the inquiry acknowledgment settings.</p> : <WorkflowEmailPreview step={selectedStep} emailSettings={definitionDraft.emailSettings || (editable && emailOptions?.senders[0] ? { senderMode: 'operator', senderEmail: emailOptions.senders[0] } : undefined)} />
                ) : selectedStep.type === 'text' ? (
                  <PortalStaggerCard className="rounded-2xl border border-sky-500/40 bg-[color:var(--portal-card)] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-sky-500 font-bold text-xs">
                      <MessageSquare size={14} /> SMS Text Preview
                    </div>
                    <div className="rounded-2xl rounded-bl-sm bg-sky-500/10 border border-sky-500/20 p-4 text-xs text-[color:var(--portal-text)] leading-5">
                      {selectedStep.body
                        ?.replace(/\{\{\s*first_name\s*\}\}/g, 'Sarah')
                        ?.replace(/\{\{\s*event_type\s*\}\}/g, 'Wedding Reception') || 'SMS message text.'}
                    </div>
                  </PortalStaggerCard>
                ) : (
                  <PortalStaggerCard className="text-xs text-[color:var(--portal-muted)]">
                    Control step: {selectedStep.name}
                  </PortalStaggerCard>
                )}
              </PortalStaggerGroup>
            ) : readOnlyVersion ? (
              <div className="space-y-3 py-3 text-xs leading-5 text-[color:var(--portal-muted)]"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Read-only workflow version</h3><p>Use Live Preview to review this step. Duplicate the workflow to edit its content or sender in a new draft.</p></div>
            ) : !canEditCustomWorkflowStep(selectedStep) ? (
              <div className="space-y-3 py-3 text-xs leading-5 text-[color:var(--portal-muted)]">
                <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Existing inquiry acknowledgment</h3>
                <p>The inquiry form already sends this acknowledgment. This step records that message without sending a second email.</p>
                <p>Its copy and sender follow the inquiry acknowledgment settings. Add a new email step to choose a template, sender, or client-specific instructions.</p>
              </div>
            ) : (
              /* Step Configuration Form */
              <PortalStaggerGroup className="space-y-4" delayChildren={0.06} staggerDelay={0.045}>
                {/* Step Name */}
                <PortalStaggerCard>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                      Step Name / Title
                    </label>
                    <input
                      type="text"
                      value={selectedStep.name}
                      onChange={(e) => updateStepField(selectedStep.id, 'name', e.target.value)}
                      className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                    />
                  </div>
                </PortalStaggerCard>

                {/* CALL TASK SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'call_task' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                          Priority
                        </label>
                        <PortalSelect
                          value={selectedStep.type === 'call_task' ? selectedStep.priority : 'medium'}
                          onChange={(val) => updateStepField(selectedStep.id, 'priority', val)}
                          options={[
                            { value: 'low', label: 'Low' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'high', label: 'High' },
                            { value: 'urgent', label: 'Urgent (Immediate)' },
                          ]}
                        buttonClassName="!min-h-9"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                          Due Timeframe
                        </label>
                        <PortalSelect
                          value={String(selectedStep.type === 'call_task' ? selectedStep.dueWithinHours : 2)}
                          onChange={(val) => updateStepField(selectedStep.id, 'dueWithinHours', Number(val))}
                          options={[
                            { value: '1', label: 'Within 1 hour' },
                            { value: '2', label: 'Within 2 hours' },
                            { value: '4', label: 'Within 4 hours' },
                            { value: '24', label: 'Within 24 hours' },
                            { value: '48', label: 'Within 48 hours' },
                          ]}
                        buttonClassName="!min-h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Assigned Operator
                      </label>
                      <input
                        type="text"
                        value={selectedStep.type === 'call_task' ? (selectedStep.assignee || 'Arianna Patterson') : 'Arianna Patterson'}
                        onChange={(e) => updateStepField(selectedStep.id, 'assignee', e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                      />
                    </div>

                    {/* Dynamic Variable Chips */}
                    <WorkflowVariableChipsBar onInsert={handleInsertChip} />

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Talking Points & Script Notes
                      </label>
                      <WorkflowTokenEditor
                        key={selectedStep.id}
                        ref={callScriptEditorRef}
                        label="Talking points and script notes"
                        value={selectedStep.type === 'call_task' ? (selectedStep.scriptNotes || '') : ''}
                        onChange={(value) => updateStepField(selectedStep.id, 'scriptNotes', value)}
                        rows={4}
                        placeholder="e.g. Call {{first_name}} to discuss date availability for {{target_date}} with {{guest_count}}..."
                      />
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* EMAIL SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'email' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <WorkflowEmailTemplateControls step={selectedStep} onChange={(next) => changeStep(selectedStep.id, () => next)} venueAddress={emailOptions?.venue.address} />
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Writing method</label>
                      <PortalSelect value={selectedStep.generationMode || 'manual'} onChange={(value) => updateStepField(selectedStep.id, 'generationMode', value)} options={[{ value: 'manual', label: 'Use this saved copy' }, { value: 'ai', label: 'Elena writes fresh for each client' }]} />
                    </div>
                    {selectedStep.generationMode === 'ai' ? (
                      <div className="space-y-3 rounded-xl border border-[color:var(--portal-border)] p-3.5">
                        <label htmlFor="workflow-email-ai-prompt" className="block text-xs font-semibold text-[color:var(--portal-text)]">Instructions for each client</label>
                        <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Elena uses the client&apos;s inquiry, event details, previous conversations, and current venue settings at this step. {selectedStep.emailStyle === 'template' ? 'She can rewrite and rearrange the HTML elements.' : 'She writes a personal email directly from your instructions.'} Review a sample before activating.</p>
                        <textarea id="workflow-email-ai-prompt" value={selectedStep.aiPrompt || ''} onChange={(event) => updateStepField(selectedStep.id, 'aiPrompt', event.target.value)} rows={4} placeholder="Write a warm, personal invitation to tour. Refer to what this client told us. Ask one easy question. Do not invent availability, pricing, or offers." className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                        <button type="button" onClick={() => handleGenerateAiCopy('email')} disabled={generatingAiCopy || !selectedStep.aiPrompt?.trim() || (selectedStep.emailStyle === 'template' && !selectedStep.emailDocument)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-50">
                          {generatingAiCopy ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />} Generate sample · no sending
                        </button>
                      </div>
                    ) : null}
                    {selectedStep.emailStyle !== 'template' ? <WorkflowVariableChipsBar onInsert={handleInsertChip} /> : null}
                    <div>
                      <label htmlFor="workflow-email-subject" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{selectedStep.generationMode === 'ai' ? 'Sample subject line' : 'Subject line'}</label>
                      <input id="workflow-email-subject" value={selectedStep.subject || ''} onChange={(event) => updateStepField(selectedStep.id, 'subject', event.target.value)} placeholder="Planning your {{event_type}} at Luxor" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                    </div>
                    <div>
                      <label htmlFor="workflow-email-preheader" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Inbox preview text</label>
                      <input id="workflow-email-preheader" value={selectedStep.previewText || ''} onChange={(event) => updateStepField(selectedStep.id, 'previewText', event.target.value)} placeholder="A short preview for the client's inbox" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                    </div>
                    {selectedStep.emailStyle !== 'template' ? <>
                      <div>
                        <label htmlFor="workflow-email-body" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{selectedStep.generationMode === 'ai' ? 'Sample email copy' : 'Email copy'}</label>
                        <textarea id="workflow-email-body" value={selectedStep.body || ''} onChange={(event) => updateStepField(selectedStep.id, 'body', event.target.value)} rows={7} placeholder="Hi {{first_name}}," className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                        <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">The selected sender&apos;s signature is added automatically.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><label htmlFor="workflow-email-button-label" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Optional button label</label><input id="workflow-email-button-label" value={selectedStep.ctaText || ''} onChange={(event) => updateStepField(selectedStep.id, 'ctaText', event.target.value)} placeholder="Schedule a tour" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" /></div>
                        <div><label htmlFor="workflow-email-button-url" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Destination</label><input id="workflow-email-button-url" value={selectedStep.ctaUrl || ''} onChange={(event) => updateStepField(selectedStep.id, 'ctaUrl', event.target.value)} placeholder="/tour" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" /></div>
                      </div>
                    </> : null}
                  </PortalStaggerCard>
                ) : null}

                {/* TEXT (SMS) SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'text' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                        Authoring Mode
                      </span>
                      <div className="flex gap-1 rounded-lg border border-[color:var(--portal-border)] p-0.5 bg-[color:var(--portal-soft)]">
                        <button
                          type="button"
                          onClick={() => updateStepField(selectedStep.id, 'generationMode', 'manual')}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                            selectedStep.type === 'text' && selectedStep.generationMode !== 'ai'
                              ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs'
                              : 'text-[color:var(--portal-muted)]'
                          }`}
                        >
                          Manual Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStepField(selectedStep.id, 'generationMode', 'ai')}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                            selectedStep.type === 'text' && selectedStep.generationMode === 'ai'
                              ? 'bg-[#caa24c] text-[#17130b] shadow-xs'
                              : 'text-[color:var(--portal-muted)]'
                          }`}
                        >
                          Elena AI
                        </button>
                      </div>
                    </div>

                    {selectedStep.type === 'text' && selectedStep.generationMode === 'ai' ? (
                      <div className="rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/5 p-3.5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c6424] dark:text-[#f1d27a]">
                          SMS Instructions for Elena
                        </span>
                        <textarea
                          value={selectedStep.aiPrompt || ''}
                          onChange={(e) => updateStepField(selectedStep.id, 'aiPrompt', e.target.value)}
                          rows={2}
                          placeholder="e.g. Ask {{first_name}} if they need special setup for their {{event_type}}..."
                          className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-xs text-[color:var(--portal-text)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleGenerateAiCopy('text')}
                          disabled={generatingAiCopy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#caa24c] px-3 py-1.5 text-xs font-bold text-[#17130b]"
                        >
                          {generatingAiCopy ? <RefreshCw size={12} className="animate-spin" /> : <Bot size={12} />}
                          <span>Generate SMS with Elena</span>
                        </button>
                      </div>
                    ) : null}

                    {/* Dynamic Variable Chips */}
                    <WorkflowVariableChipsBar onInsert={handleInsertChip} />

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                          Message Body
                        </label>
                        <span className="text-[10px] font-mono text-[color:var(--portal-muted)]">
                          {(selectedStep.type === 'text' ? selectedStep.body : '').length}/{CUSTOM_WORKFLOW_TEXT_MAX_LENGTH}
                        </span>
                      </div>
                      <textarea
                        value={selectedStep.type === 'text' ? (selectedStep.body || '') : ''}
                        onChange={(e) => updateStepField(selectedStep.id, 'body', e.target.value)}
                        rows={4}
                        placeholder="Luxor Events: Hi {{first_name}}... Reply STOP to opt out."
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                      />
                      <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                        Must start with &ldquo;Luxor Events:&rdquo; and end with &ldquo;Reply STOP to opt out.&rdquo;
                      </p>
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* WAIT DELAY SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'wait' ? (
                  <PortalStaggerCard className="grid grid-cols-2 gap-3 border-t border-[color:var(--portal-border)] pt-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Delay Amount
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={selectedStep.type === 'wait' ? (selectedStep.amount || 1) : 1}
                        onChange={(e) => updateStepField(selectedStep.id, 'amount', Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs text-[color:var(--portal-text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Unit
                      </label>
                      <PortalSelect
                        value={selectedStep.type === 'wait' ? selectedStep.unit : 'days'}
                        onChange={(val) => updateStepField(selectedStep.id, 'unit', val)}
                        options={[
                          { value: 'minutes', label: 'Minutes' },
                          { value: 'hours', label: 'Hours' },
                          { value: 'days', label: 'Days' },
                        ]}
                        buttonClassName="!min-h-9"
                      />
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* CONDITION SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'condition' ? (
                  <PortalStaggerCard className="space-y-3 border-t border-[color:var(--portal-border)] pt-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Condition Rule
                      </label>
                      <PortalSelect
                        value={selectedStep.type === 'condition' ? selectedStep.condition : 'follow_up_eligible'}
                        onChange={(val) => updateStepField(selectedStep.id, 'condition', val)}
                        options={[
                          { value: 'follow_up_eligible', label: 'Lead remains eligible for follow-up' },
                          { value: 'marketing_sms_consent', label: 'SMS marketing consent confirmed' },
                          { value: 'marketing_email_consent', label: 'Email marketing consent confirmed' },
                          { value: 'tour_scheduled', label: 'Tour has been scheduled' },
                          { value: 'tour_attended', label: 'Tour was completed' },
                          { value: 'unresponsive', label: 'Lead has not yet scheduled a visit' },
                        ]}
                        buttonClassName="!min-h-9"
                      />
                    </div>
                    <p className="text-[11px] text-[color:var(--portal-muted)]">
                      If condition is not met, the workflow automatically halts execution cleanly.
                    </p>
                  </PortalStaggerCard>
                ) : null}
              </PortalStaggerGroup>
            )}
            </PortalTabTransition>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </PortalPageFrame>
  )
}
