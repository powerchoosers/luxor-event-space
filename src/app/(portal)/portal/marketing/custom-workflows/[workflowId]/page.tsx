'use client'

import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowDown, ArrowUp, Copy, Eye, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { PortalPageFrame, PortalSelect } from '@/components/portal/PortalUI'
import {
  addCustomWorkflowStep,
  canEditCustomWorkflowStep,
  cloneCustomWorkflowDefinition,
  createNewContactFollowUpDefinition,
  moveCustomWorkflowStep,
  removeCustomWorkflowStep,
  validateCustomWorkflowDefinition,
  type CustomWorkflowChannel,
  type CustomWorkflowDefinition,
  type CustomWorkflowStep,
} from '@/lib/luxorCustomWorkflowDefinition'

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

type ActivityRow = { id: string; event_type: string; actor_email: string | null; created_at: string; details: Record<string, unknown> }
type WorkflowCapabilities = { canPause: boolean; canResume: boolean; canArchive: boolean; canActivate: false; activationMessage: string }
type WorkflowPayload = { workflow: WorkflowRow; definition?: CustomWorkflowDefinition; activity: ActivityRow[]; capabilities?: WorkflowCapabilities; error?: string }

const ADDABLE_STEPS: Array<{ type: Exclude<CustomWorkflowChannel, 'end'>; label: string }> = [
  { type: 'email', label: 'Email' },
  { type: 'text', label: 'Text' },
  { type: 'wait', label: 'Wait' },
  { type: 'condition', label: 'Condition' },
]

export default function CustomWorkflowEditorPage() {
  const params = useParams<{ workflowId: string }>()
  const router = useRouter()
  const workflowId = String(params.workflowId || '')
  const isNew = workflowId === 'new'
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [unavailableReason, setUnavailableReason] = React.useState('')
  const [workflow, setWorkflow] = React.useState<WorkflowRow | null>(null)
  const [activity, setActivity] = React.useState<ActivityRow[]>([])
  const [capabilities, setCapabilities] = React.useState<WorkflowCapabilities | null>(null)
  const [nameDraft, setNameDraft] = React.useState('New contact follow-up')
  const [definitionDraft, setDefinitionDraft] = React.useState<CustomWorkflowDefinition>(createNewContactFollowUpDefinition())
  const [selectedStepId, setSelectedStepId] = React.useState('inquiry-acknowledgment')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const dirty = isNew
    ? Boolean(nameDraft.trim() !== 'New contact follow-up' || JSON.stringify(definitionDraft) !== JSON.stringify(createNewContactFollowUpDefinition()))
    : Boolean(workflow && workflow.status === 'draft' && (nameDraft !== workflow.name || JSON.stringify(definitionDraft) !== JSON.stringify(workflow.draft_definition)))
  const selectedStep = definitionDraft.steps.find((step) => step.id === selectedStepId) || null
  const validationErrors = React.useMemo(() => validateCustomWorkflowDefinition(definitionDraft), [definitionDraft])

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { enabled?: boolean; unavailableReason?: string; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Custom workflow storage could not be checked.')
        setEnabled(payload.enabled === true)
        setUnavailableReason(payload.unavailableReason || '')
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Custom workflow storage could not be checked.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    if (isNew || enabled !== true) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflowId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as WorkflowPayload
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'The custom workflow could not load.')
        setWorkflow(payload.workflow)
        setActivity(Array.isArray(payload.activity) ? payload.activity : [])
        setCapabilities(payload.capabilities || null)
        setNameDraft(payload.workflow.name)
        const displayedDefinition = payload.definition || payload.workflow.draft_definition
        setDefinitionDraft(cloneCustomWorkflowDefinition(displayedDefinition))
        setSelectedStepId(displayedDefinition.steps[0]?.id || '')
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'The custom workflow could not load.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [enabled, isNew, refreshKey, workflowId])

  React.useEffect(() => {
    if (!dirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    const guardInternalNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || event.defaultPrevented) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return
      if (!window.confirm('Discard unsaved workflow changes and leave this editor?')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('click', guardInternalNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      document.removeEventListener('click', guardInternalNavigation, true)
    }
  }, [dirty])

  function changeStep(stepId: string, update: (step: CustomWorkflowStep) => CustomWorkflowStep) {
    setDefinitionDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === stepId ? update(step) : step) }))
    setPreviewHtml(null)
    setFeedback(null)
  }

  function updateStepField<K extends keyof CustomWorkflowStep>(stepId: string, key: K, value: CustomWorkflowStep[K]) {
    changeStep(stepId, (step) => ({ ...step, [key]: value }) as CustomWorkflowStep)
  }

  function selectStep(stepId: string) {
    if (stepId === selectedStepId) return
    setSelectedStepId(stepId)
    setPreviewHtml(null)
  }

  function addStep(type: Exclude<CustomWorkflowChannel, 'end'>) {
    const id = `${type}-${crypto.randomUUID()}`
    const next = addCustomWorkflowStep(definitionDraft, type, id)
    setDefinitionDraft(next)
    setSelectedStepId(id)
    setPreviewHtml(null)
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    setDefinitionDraft((current) => moveCustomWorkflowStep(current, stepId, direction))
    setPreviewHtml(null)
  }

  function removeStep(stepId: string) {
    const step = definitionDraft.steps.find((candidate) => candidate.id === stepId)
    if (!step || !canEditCustomWorkflowStep(step)) return
    if (!window.confirm(`Remove “${step.name}” from this unsaved draft?`)) return
    const next = removeCustomWorkflowStep(definitionDraft, stepId)
    setDefinitionDraft(next)
    setSelectedStepId(next.steps.find((candidate) => candidate.id !== stepId)?.id || '')
    setPreviewHtml(null)
  }

  async function createDraft() {
    setSaving(true); setError(null); setFeedback(null)
    try {
      const response = await fetch('/api/marketing/custom-workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameDraft, definition: definitionDraft }) })
      const payload = await response.json().catch(() => ({})) as { workflow?: WorkflowRow; error?: string }
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'The workflow draft could not be created.')
      setWorkflow(payload.workflow)
      router.replace(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The workflow draft could not be created.')
    } finally { setSaving(false) }
  }

  async function saveDraft() {
    if (!workflow || !dirty || workflow.status !== 'draft') return
    setSaving(true); setError(null); setFeedback(null)
    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameDraft, definition: definitionDraft, expectedRevision: workflow.draft_revision }) })
      const payload = await response.json().catch(() => ({})) as { workflow?: WorkflowRow; error?: string }
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'The workflow draft could not be saved.')
      setWorkflow(payload.workflow)
      setDefinitionDraft(cloneCustomWorkflowDefinition(payload.workflow.draft_definition))
      setNameDraft(payload.workflow.name)
      setFeedback('Saved and reloaded from the current draft revision.')
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The workflow draft could not be saved.')
    } finally { setSaving(false) }
  }

  async function previewEmail() {
    if (!selectedStep || selectedStep.type !== 'email' || selectedStep.mode !== 'marketing') return
    setPreviewing(true); setError(null); setPreviewHtml(null)
    try {
      const response = await fetch('/api/marketing/custom-workflows/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: selectedStep }) })
      const payload = await response.json().catch(() => ({})) as { html?: string; error?: string; sent?: boolean }
      if (!response.ok || !payload.html || payload.sent !== false) throw new Error(payload.error || 'The no-send preview could not be rendered.')
      setPreviewHtml(payload.html)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The preview could not be rendered.')
    } finally { setPreviewing(false) }
  }

  function cancelDraft() {
    if (workflow) {
      setNameDraft(workflow.name)
      setDefinitionDraft(cloneCustomWorkflowDefinition(workflow.draft_definition))
      setSelectedStepId(workflow.draft_definition.steps[0]?.id || '')
    } else {
      setNameDraft('New contact follow-up')
      setDefinitionDraft(createNewContactFollowUpDefinition())
      setSelectedStepId('inquiry-acknowledgment')
    }
    setPreviewHtml(null); setFeedback('Unsaved workflow changes were discarded.'); setError(null)
  }

  async function duplicateDraft() {
    if (!workflow || (dirty && !window.confirm('Discard unsaved changes and duplicate the last saved revision?'))) return
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}/duplicate`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { workflow?: WorkflowRow; error?: string }
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'The workflow could not be duplicated.')
      router.push(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'The workflow could not be duplicated.') }
    finally { setSaving(false) }
  }

  async function changeLifecycle(action: 'pause' | 'resume' | 'archive') {
    if (!workflow) return
    const confirmations = {
      pause: 'Pause this workflow? New inquiries will not enroll, and queued custom messages will wait until it is resumed.',
      resume: 'Resume this workflow? Unsent steps will be rechecked for current eligibility and consent before dispatch.',
      archive: dirty
        ? 'Discard unsaved changes and archive the last saved workflow? History stays available; only its unsent custom work is cancelled.'
        : 'Archive this workflow? History stays available; only its unsent custom work is cancelled.',
    }
    const confirmation = dirty && action !== 'archive'
      ? 'Discard unsaved draft changes and continue?'
      : confirmations[action]
    if (!window.confirm(confirmation)) return
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const payload = await response.json().catch(() => ({})) as WorkflowPayload
      if (!response.ok || !payload.workflow) throw new Error(payload.error || `The workflow could not be ${action}d.`)
      setWorkflow(payload.workflow); setActivity(payload.activity || []); setCapabilities(payload.capabilities || null)
      setNameDraft(payload.workflow.name); setDefinitionDraft(cloneCustomWorkflowDefinition(payload.definition || payload.workflow.draft_definition))
      setFeedback(`Workflow ${action}d. Its history is preserved.`); setRefreshKey((value) => value + 1)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : `The workflow could not be ${action}d.`) }
    finally { setSaving(false) }
  }

  if (loading || enabled === null) return <PortalPageFrame><LoadingState /></PortalPageFrame>

  return (
    <PortalPageFrame className="pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto portal-scrollbar pb-4">
        <header className="border-b border-[color:var(--portal-border)] pb-5">
          <Link href="/portal/marketing?tab=automations" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><ArrowLeft size={15} aria-hidden="true" />Back to automation library</Link>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor="workflow-name" className="text-[10px] font-black uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">Workflow name</label>
              <input id="workflow-name" value={nameDraft} onChange={(event) => { setNameDraft(event.target.value); setFeedback(null) }} disabled={!enabled || (workflow !== null && workflow.status !== 'draft')} maxLength={120} className="mt-2 min-h-12 w-full max-w-2xl border-b border-[color:var(--portal-border)] bg-transparent px-1 py-2 font-serif text-2xl font-semibold text-[color:var(--portal-text)] outline-none focus:border-[#caa24c] disabled:opacity-70 sm:text-3xl" />
            </div>
            <div className="flex flex-wrap gap-2">
              {!isNew && workflow ? <button type="button" disabled={!enabled || saving} onClick={duplicateDraft} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><Copy size={14} />Duplicate</button> : null}
              {!isNew && workflow?.status === 'active' && capabilities?.canPause ? <button type="button" disabled={!enabled || saving || dirty} onClick={() => changeLifecycle('pause')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">Pause</button> : null}
              {!isNew && workflow?.status === 'paused' && capabilities?.canResume ? <button type="button" disabled={!enabled || saving || dirty} onClick={() => changeLifecycle('resume')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">Resume</button> : null}
              {!isNew && workflow && capabilities?.canArchive && (workflow.status === 'draft' || workflow.status === 'paused') ? <button type="button" disabled={!enabled || saving} onClick={() => changeLifecycle('archive')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><Trash2 size={14} />Archive</button> : null}
              <button type="button" disabled={!enabled || saving || (!isNew && !dirty)} onClick={isNew ? createDraft : saveDraft} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] disabled:cursor-not-allowed disabled:opacity-50"><Save size={14} />{saving ? 'Saving…' : isNew ? 'Create draft' : 'Save draft'}</button>
            </div>
          </div>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[color:var(--portal-muted)]"><span><strong className="text-[color:var(--portal-text)]">Status:</strong> {workflow ? statusLabel(workflow.status) : 'Draft setup'}</span><span><strong className="text-[color:var(--portal-text)]">Trigger:</strong> New eligible website contact form inquiry</span><span><strong className="text-[color:var(--portal-text)]">Updated:</strong> {workflow ? formatDate(workflow.updated_at) : 'Not saved'}</span><span><strong className="text-[color:var(--portal-text)]">Draft revision:</strong> {workflow?.draft_revision ?? 'Not saved'}</span></p>
          <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Workflow activation and dispatch are disabled. Draft edits do not change the existing brochure sequence, queued messages, or contact acknowledgments.</p>
          {workflow?.status === 'draft' ? <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{capabilities?.activationMessage || 'Activation remains unavailable pending separate owner approval and runtime review.'}</p> : null}
        </header>

        {!enabled ? <Notice title="Draft storage is unavailable." body={unavailableReason || 'The custom workflow schema has not been validated in its disposable PostgreSQL environment yet.'} /> : null}
        {error ? <Notice title="Action could not be completed." body={error} tone="error" /> : null}
        {feedback ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">{feedback}</p> : null}
        {validationErrors.length ? <Notice title="Draft needs review before it can run." body={`${validationErrors.length} workflow setup ${validationErrors.length === 1 ? 'item needs' : 'items need'} attention. ${validationErrors[0].message}`} /> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(17rem,.8fr)_minmax(0,1.2fr)]">
          <section aria-label="Ordered workflow steps" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
            <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Sequence</h2><span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">{definitionDraft.steps.length} steps</span></div>
            <ol className="mt-4 space-y-2">
              {definitionDraft.steps.map((step, index) => <li key={step.id}><button type="button" onClick={() => selectStep(step.id)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${step.id === selectedStepId ? 'border-[#caa24c]/50 bg-[#caa24c]/10' : 'border-[color:var(--portal-border)] hover:bg-[color:var(--portal-soft)]'}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--portal-border)] text-[10px] font-bold tabular-nums text-[color:var(--portal-muted)]">{index + 1}</span><span className="min-w-0 flex-1"><span className="block break-words text-xs font-bold text-[color:var(--portal-text)]">{step.name}</span><span className="mt-1 block text-[10px] text-[color:var(--portal-muted)]">{step.type === 'email' ? step.mode === 'existing_inquiry_acknowledgment' ? 'Existing acknowledgment · no additional send' : 'Email' : step.type === 'text' ? 'SMS · marketing consent required' : step.type === 'wait' ? waitDescription(step) : step.type === 'condition' ? conditionDescription(step) : 'End'}</span></span></button></li>)}
            </ol>
            {workflow?.status === 'draft' || isNew ? <div className="mt-4 border-t border-[color:var(--portal-border)] pt-4"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">Add step</p><div className="mt-2 grid grid-cols-2 gap-2">{ADDABLE_STEPS.map((item) => <button key={item.type} type="button" disabled={!enabled || definitionDraft.steps.length >= 20} onClick={() => addStep(item.type)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[color:var(--portal-border)] px-2 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><Plus size={13} />{item.label}</button>)}</div></div> : null}
          </section>

          <div className="space-y-5">
            <section aria-label="Selected step details" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
              {selectedStep ? <StepEditor step={selectedStep} editable={Boolean(enabled && (isNew || workflow?.status === 'draft'))} index={definitionDraft.steps.findIndex((step) => step.id === selectedStep.id)} total={definitionDraft.steps.length} onChange={(key, value) => updateStepField(selectedStep.id, key as never, value as never)} onMove={(direction) => moveStep(selectedStep.id, direction)} onRemove={() => removeStep(selectedStep.id)} onPreview={previewEmail} previewing={previewing} /> : <p className="text-sm text-[color:var(--portal-muted)]">Select a step to inspect its configuration.</p>}
              {previewHtml ? <div className="mt-5 overflow-hidden rounded-xl border border-[color:var(--portal-border)]"><div className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3"><p className="text-xs font-bold text-[color:var(--portal-text)]">Email preview</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Sample personalization only. No message was queued or sent.</p></div><iframe title="Custom workflow email preview" srcDoc={previewHtml} sandbox="" className="h-[32rem] w-full bg-white" /></div> : null}
            </section>

            <section aria-labelledby="workflow-activity-heading" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 id="workflow-activity-heading" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Activity</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Saved workflow changes only. Contact activity and deliveries are not shown until the runtime is approved.</p></div><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={!workflow || !enabled} aria-label="Refresh workflow and activity" className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] disabled:opacity-50"><RefreshCw size={14} /></button></div>{activity.length ? <ol className="mt-3 divide-y divide-[color:var(--portal-border)]">{activity.map((item) => <li key={item.id} className="py-3"><p className="text-xs font-semibold text-[color:var(--portal-text)]">{activityLabel(item.event_type)}</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{formatDate(item.created_at)}{item.actor_email ? ` · ${item.actor_email}` : ''}</p></li>)}</ol> : <p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-xs text-[color:var(--portal-muted)]">{workflow ? 'No saved activity is available.' : 'Activity appears after a draft is saved.'}</p>}</section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--portal-border)] pt-4"><p className="text-[11px] leading-5 text-[color:var(--portal-muted)]">The existing contact acknowledgment is reused as the first step. Message content and delay still need owner review before runtime authorization.</p><div className="flex gap-2"><button type="button" onClick={cancelDraft} disabled={!dirty || saving || !enabled} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">Cancel changes</button><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={!workflow || dirty || saving || !enabled} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><RefreshCw size={13} />Reload</button></div></div>
      </div>
    </PortalPageFrame>
  )
}

function StepEditor({ step, editable, index, total, onChange, onMove, onRemove, onPreview, previewing }: {
  step: CustomWorkflowStep
  editable: boolean
  index: number
  total: number
  onChange: (key: string, value: string | number | null) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onPreview: () => void
  previewing: boolean
}) {
  const readOnly = !editable || (step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment')
  return <div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f]">Step {index + 1} · {step.type}</p><h2 className="mt-1 font-serif text-xl font-semibold text-[color:var(--portal-text)]">{step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' ? 'Existing contact acknowledgment' : step.name}</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' ? 'The current transactional acknowledgment already sends through the existing queue. This marker prevents a duplicate email.' : step.type === 'text' ? 'Text is available only for an inquiry with explicit marketing SMS consent; consent is checked again before queue and send.' : step.type === 'wait' ? 'Waits are relative to the prior completed step. A concrete duration is required before the workflow can run.' : step.type === 'condition' ? 'Only allowlisted contact, booking, marketing consent, and opt-out checks are supported.' : 'The workflow exits after this step.'}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => onMove(-1)} disabled={readOnly || index <= (step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' ? 0 : 1)} aria-label="Move step up" className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] disabled:opacity-40"><ArrowUp size={14} /></button><button type="button" onClick={() => onMove(1)} disabled={readOnly || index >= total - 2} aria-label="Move step down" className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] disabled:opacity-40"><ArrowDown size={14} /></button><button type="button" onClick={onRemove} disabled={readOnly || step.type === 'end'} aria-label="Remove step" className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] disabled:opacity-40"><Trash2 size={14} /></button></div></div>
    {readOnly && step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' ? <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Existing contact acknowledgment</p><p className="mt-2 text-sm text-[color:var(--portal-muted)]">Subject: {step.subject}</p><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{step.previewText}</p><p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">This saved marker observes the existing inquiry acknowledgment. Its branded body, personal details, visit link, and delivery remain controlled by the current inquiry path.</p></div> : null}
    <label className="mt-4 block"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Step name</span><input value={step.name} disabled={readOnly || step.type === 'end'} onChange={(event) => onChange('name' as keyof CustomWorkflowStep, event.target.value as never)} maxLength={120} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c] disabled:opacity-70" /></label>
    {step.type === 'email' && step.mode === 'marketing' ? <div className="mt-4 space-y-3"><Field label="Subject" value={step.subject} disabled={readOnly} maxLength={500} onChange={(value) => onChange('subject', value)} /><Field label="Preview text" value={step.previewText} disabled={readOnly} maxLength={500} onChange={(value) => onChange('previewText', value)} /><TextArea label="Email body" value={step.body} disabled={readOnly} maxLength={12000} rows={8} help="Use only supported fields: {{first_name}}, {{full_name}}, {{event_type}}, {{guest_count}}, and {{target_date}}." onChange={(value) => onChange('body', value)} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Button label (optional)" value={step.ctaText} disabled={readOnly} maxLength={100} onChange={(value) => onChange('ctaText', value)} /><Field label="Luxor page or URL (optional)" value={step.ctaUrl} disabled={readOnly} maxLength={500} onChange={(value) => onChange('ctaUrl', value)} /></div><button type="button" onClick={onPreview} disabled={previewing || !step.body.trim() || !step.subject.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><Eye size={14} />{previewing ? 'Rendering…' : 'Preview email'}</button></div> : null}
    {step.type === 'text' ? <TextArea label="Text body" value={step.body} disabled={readOnly} maxLength={1200} rows={5} help="Start with Luxor Event Space, include STOP instructions, and use only supported personalization fields." onChange={(value) => onChange('body', value)} /> : null}
    {step.type === 'wait' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Wait amount" type="number" value={step.amount === null ? '' : String(step.amount)} disabled={readOnly} min={0} max={365} onChange={(value) => onChange('amount', value === '' ? null : Number(value))} /><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Unit</p><PortalSelect disabled={readOnly} value={step.unit} onChange={(value) => onChange('unit', value as typeof step.unit)} options={[{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }]} className="mt-1 w-full" buttonClassName="min-h-10" /></div></div> : null}
    {step.type === 'condition' ? <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Supported condition</p><PortalSelect disabled={readOnly} value={step.condition} onChange={(value) => onChange('condition', value as typeof step.condition)} options={[{ value: 'follow_up_eligible', label: 'Contact remains eligible; stop after booking, close, or opt-out' }, { value: 'marketing_email_consent', label: 'Marketing email consent is present' }, { value: 'marketing_sms_consent', label: 'Marketing SMS consent is present' }]} className="mt-1 w-full" buttonClassName="min-h-10" /></div> : null}
    {!readOnly && step.type !== 'end' ? <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">This is a saved draft only. The editor cannot activate or dispatch it.</p> : null}
  </div>
}

function Field({ label, value, disabled, maxLength, onChange, type = 'text', min, max }: { label: string; value: string; disabled: boolean; maxLength?: number; onChange: (value: string) => void; type?: string; min?: number; max?: number }) {
  return <label className="block"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">{label}</span><input type={type} min={min} max={max} value={value} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c] disabled:opacity-70" /></label>
}

function TextArea({ label, value, disabled, maxLength, rows, help, onChange }: { label: string; value: string; disabled: boolean; maxLength: number; rows: number; help: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">{label}</span><textarea rows={rows} value={value} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c] disabled:opacity-70" /><span className="mt-1 block text-[10px] leading-4 text-[color:var(--portal-muted)]">{help}</span></label>
}

function Notice({ title, body, tone = 'info' }: { title: string; body: string; tone?: 'info' | 'error' }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 ${tone === 'error' ? 'border-rose-500/25 bg-rose-500/5' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'}`}><p className="text-sm font-bold text-[color:var(--portal-text)]">{title}</p><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{body}</p></div>
}

function LoadingState() {
  return <div role="status" className="space-y-3"><div className="h-6 w-48 rounded luxor-skeleton" /><div className="h-32 rounded-xl luxor-skeleton" /><p className="sr-only">Loading custom workflow editor.</p></div>
}

function waitDescription(step: Extract<CustomWorkflowStep, { type: 'wait' }>) { return step.amount === null ? 'Wait duration not set' : `Wait ${step.amount} ${step.unit}` }
function conditionDescription(step: Extract<CustomWorkflowStep, { type: 'condition' }>) { return step.condition.replaceAll('_', ' ') }
function activityLabel(event: string) { return event.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
function statusLabel(status: WorkflowRow['status']) { return `${status[0].toUpperCase()}${status.slice(1)}` }
