'use client'

import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarClock, Clock3, Mail, MessageSquareText, Phone, RefreshCw, Save, Workflow } from 'lucide-react'
import { PortalPageFrame } from '@/components/portal/PortalUI'
import type { AutomationLibraryEntry, AutomationLibraryTotals, AutomationStatus } from '@/lib/luxorAutomationsLibrary'

type LibraryResponse = {
  workflows: AutomationLibraryEntry[]
  systemManaged: AutomationLibraryEntry
  totals: AutomationLibraryTotals
}

type TemplateRow = {
  id: string
  automation_key: string
  step_key: string
  sort_order: number
  channel: string
  delay_days: number
  name: string
  subject: string | null
  body: string | null
  cta_text: string | null
  cta_url: string | null
  secondary_cta_text: string | null
  secondary_cta_url: string | null
  active: boolean
  uses_existing_delivery: boolean
  updated_at: string
}

type ContentDraft = {
  name: string
  subject: string
  body: string
  cta_text: string
  cta_url: string
  secondary_cta_text: string
  secondary_cta_url: string
}

type QueuedCopyPreview = {
  templateUpdatedAt: string
  eligibleCount: number
  candidates: Array<{ jobId: string; snapshotHash: string }>
  limitExceeded: boolean
}

type SavedDetail = {
  kind: 'saved'
  name: string
  status: AutomationStatus
  trigger: string
  updatedAt: string | null
  automation: { enabled: boolean; send_approved: boolean; timing_configured: boolean; timezone: string | null }
  sendsConfigured: boolean | null
  templates: TemplateRow[]
  activity: { activeEnrollments: number | null; sentEmails: number | null }
  brochureDelivery: { subject: string; previewText: string; bodyHtml: string; note: string }
  enrollmentRules: string[]
  exitRules: string[]
}

type EmailPreview = { subject: string; body: string; source: string }

type TourDetail = {
  kind: 'system'
  name: string
  status: 'system-managed'
  trigger: string
  updatedAt: null
  activity: { sentEmails: number | null; sentTexts: number | null }
  emails: {
    sampleNotice: string
    confirmation: EmailPreview
    reminder_24: EmailPreview
    reminder_2: EmailPreview
  }
  texts: {
    sampleNotice: string
    confirmation: { body: string; timing: string }
    reminder: { body: string; timing: string }
    consent: string
  }
  emailSteps: Array<{ key: string; name: string; channel: string; timing: string }>
  smsSteps: Array<{ key: string; name: string; timing: string }>
  behavior: string[]
}

type DetailResponse = SavedDetail | TourDetail

const EMPTY_DRAFT: ContentDraft = {
  name: '',
  subject: '',
  body: '',
  cta_text: '',
  cta_url: '',
  secondary_cta_text: '',
  secondary_cta_url: '',
}

function draftFromTemplate(template: TemplateRow): ContentDraft {
  return {
    name: template.name || '',
    subject: template.subject || '',
    body: template.body || '',
    cta_text: template.cta_text || '',
    cta_url: template.cta_url || '',
    secondary_cta_text: template.secondary_cta_text || '',
    secondary_cta_url: template.secondary_cta_url || '',
  }
}

function sameDraft(left: ContentDraft, right: ContentDraft) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function timingForTemplate(template: TemplateRow) {
  if (template.uses_existing_delivery) return 'At brochure request; uses the existing delivery job'
  if (template.delay_days === 0) return 'At enrollment'
  return `${template.delay_days} day${template.delay_days === 1 ? '' : 's'} after the original request`
}

function formatDate(value: string | null) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status: AutomationStatus) {
  if (status === 'system-managed') return 'System-managed'
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`
}

export default function AutomationDetailPage() {
  const params = useParams<{ automationId: string }>()
  const routeId = String(params.automationId || '')
  const libraryId = routeId === 'tour-notifications' ? 'system:tour-notifications' : routeId
  const [entry, setEntry] = React.useState<AutomationLibraryEntry | null>(null)
  const [detail, setDetail] = React.useState<DetailResponse | null>(null)
  const [selectedStepKey, setSelectedStepKey] = React.useState('')
  const [draft, setDraft] = React.useState<ContentDraft>(EMPTY_DRAFT)
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null)
  const [previewNote, setPreviewNote] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = React.useState(0)
  const [previewing, setPreviewing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [applyToQueued, setApplyToQueued] = React.useState(false)
  const [queuedPreview, setQueuedPreview] = React.useState<QueuedCopyPreview | null>(null)
  const [queuePreviewing, setQueuePreviewing] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const pendingSaveReload = React.useRef(false)
  const pendingSaveMessage = React.useRef<string | null>(null)
  const preserveFeedbackOnTemplateRefresh = React.useRef(false)

  const fetchPageData = React.useCallback(async () => {
    const libraryResponse = await fetch('/api/marketing/automations', { cache: 'no-store' })
    const libraryPayload = await libraryResponse.json().catch(() => ({})) as LibraryResponse & { error?: string }
    if (!libraryResponse.ok || !Array.isArray(libraryPayload.workflows) || !libraryPayload.systemManaged) {
      throw new Error(libraryPayload.error || 'The automation library could not load. Try again.')
    }
    const libraryEntry = [...libraryPayload.workflows, libraryPayload.systemManaged].find((item) => item.id === libraryId) || null
    if (!libraryEntry) throw new Error('This automation is no longer in the library. Return to the library and refresh it.')

    if (routeId !== 'brochure_lead' && routeId !== 'tour-notifications') {
      return { libraryEntry, detail: null, detailError: null }
    }

    const detailResponse = await fetch(`/api/marketing/automation-detail?id=${encodeURIComponent(routeId)}`, { cache: 'no-store' })
    const detailPayload = await detailResponse.json().catch(() => ({})) as DetailResponse & { error?: string }
    if (!detailResponse.ok) {
      return { libraryEntry, detail: null, detailError: detailPayload.error || 'Runtime details are unavailable right now.' }
    }
    return { libraryEntry, detail: detailPayload as DetailResponse, detailError: null }
  }, [libraryId, routeId])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    fetchPageData()
      .then((payload) => {
        if (!active) return
        setEntry(payload.libraryEntry)
        if (pendingSaveReload.current && payload.detail) {
          preserveFeedbackOnTemplateRefresh.current = true
        }
        setDetail(payload.detail)
        setDetailError(payload.detailError)
        if (pendingSaveReload.current) {
          setFeedback(payload.detail
            ? pendingSaveMessage.current || 'Saved and reloaded from the current configuration.'
            : 'Saved, but reload could not be verified. Refresh the page to confirm the current copy.')
          pendingSaveReload.current = false
          pendingSaveMessage.current = null
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'The automation details could not load.')
        if (pendingSaveReload.current) {
          setFeedback('The save response succeeded, but the refreshed detail could not be loaded. Refresh the page to confirm it.')
          pendingSaveReload.current = false
          pendingSaveMessage.current = null
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [fetchPageData, reloadVersion])

  const savedDetail = detail?.kind === 'saved' ? detail : null
  const orderedTemplates = React.useMemo(
    () => savedDetail ? [...savedDetail.templates].sort((left, right) => left.sort_order - right.sort_order) : [],
    [savedDetail],
  )
  React.useEffect(() => {
    if (!orderedTemplates.length) return
    const currentExists = orderedTemplates.some((template) => template.step_key === selectedStepKey)
    if (!currentExists) {
      const firstContentEmail = orderedTemplates.find((template) => template.channel === 'email' && !template.uses_existing_delivery)
      setSelectedStepKey((firstContentEmail || orderedTemplates[0]).step_key)
    }
  }, [orderedTemplates, selectedStepKey])

  const activeTemplate = orderedTemplates.find((template) => template.step_key === selectedStepKey) || null
  const canEdit = Boolean(activeTemplate && activeTemplate.channel === 'email' && !activeTemplate.uses_existing_delivery)
  const currentSavedDraft = activeTemplate ? draftFromTemplate(activeTemplate) : EMPTY_DRAFT
  const dirty = canEdit && !sameDraft(draft, currentSavedDraft)

  React.useEffect(() => {
    if (!activeTemplate) return
    setDraft(draftFromTemplate(activeTemplate))
    setPreviewHtml(null)
    setPreviewNote(null)
    if (preserveFeedbackOnTemplateRefresh.current) {
      preserveFeedbackOnTemplateRefresh.current = false
    } else {
      setFeedback(null)
    }
    setApplyToQueued(false)
    setQueuedPreview(null)
  }, [activeTemplate?.id, activeTemplate?.updated_at])

  React.useEffect(() => {
    if (!dirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [dirty])

  React.useEffect(() => {
    if (!dirty) return
    const guardInternalNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || event.defaultPrevented) return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (!window.confirm('Discard unsaved email changes and leave this detail page?')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('click', guardInternalNavigation, true)
    return () => document.removeEventListener('click', guardInternalNavigation, true)
  }, [dirty])

  function handleRefresh() {
    if (dirty && !window.confirm('Discard unsaved email changes and reload saved automation data?')) return
    if (dirty && activeTemplate) setDraft(draftFromTemplate(activeTemplate))
    setReloadVersion((value) => value + 1)
  }

  function handleSelectStep(key: string) {
    if (key === selectedStepKey) return
    if (dirty && !window.confirm('Discard unsaved email changes and open another step?')) return
    if (dirty && activeTemplate) setDraft(draftFromTemplate(activeTemplate))
    setSelectedStepKey(key)
  }

  function updateDraft(field: keyof ContentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setPreviewHtml(null)
    setPreviewNote(null)
    setQueuedPreview(null)
    setFeedback(null)
  }

  function toggleApplyToQueued(enabled: boolean) {
    setApplyToQueued(enabled)
    setQueuedPreview(null)
    setFeedback(null)
  }

  async function reviewQueuedCopies() {
    if (!activeTemplate || queuePreviewing || saving) return
    setQueuePreviewing(true)
    setQueuedPreview(null)
    setFeedback(null)
    try {
      const response = await fetch('/api/marketing/automation-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'queued-copy-preview', templateId: activeTemplate.id }),
      })
      const payload = await response.json().catch(() => ({})) as QueuedCopyPreview & { error?: string }
      if (!response.ok || !Array.isArray(payload.candidates) || !Number.isSafeInteger(payload.eligibleCount)
        || payload.eligibleCount < 0 || typeof payload.limitExceeded !== 'boolean'
        || payload.templateUpdatedAt !== activeTemplate.updated_at
        || (!payload.limitExceeded && payload.candidates.length !== payload.eligibleCount)
        || (payload.limitExceeded && payload.candidates.length !== 0)) {
        throw new Error(payload.error || 'Matching queued emails could not be reviewed.')
      }
      setQueuedPreview(payload)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Matching queued emails could not be reviewed.')
    } finally {
      setQueuePreviewing(false)
    }
  }

  async function requestPreview() {
    if (!activeTemplate) return
    setPreviewing(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/marketing/automation-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: activeTemplate.id, updates: draft }),
      })
      const payload = await response.json().catch(() => ({})) as { bodyHtml?: string; note?: string; error?: string }
      if (!response.ok || !payload.bodyHtml) throw new Error(payload.error || 'The preview could not be rendered.')
      setPreviewHtml(payload.bodyHtml)
      setPreviewNote(payload.note || 'Preview only. No email was queued or sent.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The preview could not be rendered.')
    } finally {
      setPreviewing(false)
    }
  }

  async function saveDraft() {
    if (!activeTemplate || !dirty) return
    if (applyToQueued && (!queuedPreview || queuedPreview.templateUpdatedAt !== activeTemplate.updated_at || queuedPreview.limitExceeded)) {
      setFeedback('Review the matching queued emails again before saving.')
      return
    }
    if (applyToQueued) {
      const count = queuedPreview?.eligibleCount ?? 0
      const description = count === 1 ? '1 matching queued email' : `${count} matching queued emails`
      if (!window.confirm(`Save this email and update the reviewed ${description}? Only still-queued, unattempted copies scheduled in the future will change. Recipients and send times stay the same; sent, claimed, attempted, stale, or ineligible emails will be skipped.`)) return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/marketing/automation-detail', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          expectedUpdatedAt: activeTemplate.updated_at,
          updates: draft,
          ...(applyToQueued ? { applyToQueued: true, queuedPreview } : {}),
        }),
      })
      const payload = await response.json().catch(() => ({})) as {
        error?: string
        template?: TemplateRow
        queuedUpdate?: { updatedCount: number; skippedCount: number; requestedCount: number }
      }
      if (!response.ok) {
        if (response.status === 409 && applyToQueued) setQueuedPreview(null)
        throw new Error(payload.error || 'The email could not be saved.')
      }
      if (payload.template) {
        setDraft(draftFromTemplate(payload.template))
        setPreviewHtml(null)
        setPreviewNote(null)
      }
      pendingSaveMessage.current = payload.queuedUpdate
        ? `Saved. Updated ${payload.queuedUpdate.updatedCount} queued email${payload.queuedUpdate.updatedCount === 1 ? '' : 's'}; skipped ${payload.queuedUpdate.skippedCount} that changed or became ineligible. Recipients and send times were preserved.`
        : 'Saved and reloaded from the current configuration.'
      pendingSaveReload.current = true
      setFeedback('Saved. Reloading the saved step…')
      setReloadVersion((value) => value + 1)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The email could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function cancelDraft() {
    if (activeTemplate) setDraft(draftFromTemplate(activeTemplate))
    setPreviewHtml(null)
    setPreviewNote(null)
    setApplyToQueued(false)
    setQueuedPreview(null)
    setFeedback('Unsaved changes were discarded.')
  }

  if (loading && !entry) return <PortalPageFrame className="pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6"><DetailSkeleton /></PortalPageFrame>

  return (
    <PortalPageFrame className="pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto portal-scrollbar pb-3">
        <div className="border-b border-[color:var(--portal-border)] pb-5">
          <Link href="/portal/marketing?tab=automations" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[color:var(--portal-muted)] transition hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to automation library
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#caa24c]/10 text-[#8c6424] dark:text-[#f1d27a]">{entry?.kind === 'system' ? <CalendarClock size={17} aria-hidden="true" /> : <Workflow size={17} aria-hidden="true" />}</span>
                <h1 className="font-serif text-2xl font-semibold text-[color:var(--portal-text)] sm:text-3xl">{entry?.name || 'Automation details'}</h1>
                {entry ? <StatusBadge status={entry.status} /> : null}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">{entry?.description || 'Inspect the saved automation configuration.'}</p>
            </div>
            <button type="button" onClick={handleRefresh} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
              <RefreshCw size={14} aria-hidden="true" />Refresh
            </button>
          </div>
          {entry ? <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color:var(--portal-muted)]"><span><span className="font-bold text-[color:var(--portal-text)]">Trigger:</span> {entry.trigger}</span><span><span className="font-bold text-[color:var(--portal-text)]">Channels:</span> {detail?.kind === 'system' ? 'Email + calendar + SMS when eligible' : entry.channelSummary}</span><span><span className="font-bold text-[color:var(--portal-text)]">Steps:</span> {detail?.kind === 'system' ? `${detail.emailSteps.length} email notices + ${detail.smsSteps.length} SMS notices` : entry.stepsCount === null ? 'Unavailable' : `${entry.stepsCount} configured`}</span><span><span className="font-bold text-[color:var(--portal-text)]">Updated:</span> {detail?.updatedAt ? formatDate(detail.updatedAt) : entry.updatedAt ? formatDate(entry.updatedAt) : entry.kind === 'system' ? 'Code-managed; no shared template timestamp' : 'Unavailable'}</span></div> : null}
        </div>

        {loadError ? <Notice tone="error" title="Automation data could not load." body={loadError} action={<button type="button" onClick={handleRefresh} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 font-semibold">Try again</button>} /> : null}
        {loading && entry ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Refreshing saved automation data.</p> : null}
        {detailError ? <Notice tone="info" title="Runtime details are unavailable." body={detailError} /> : null}

        {savedDetail ? (
          <SavedWorkflowDetail
            detail={savedDetail}
            entry={entry!}
            templates={orderedTemplates}
            activeTemplate={activeTemplate}
            selectedStepKey={selectedStepKey}
            onSelectStep={handleSelectStep}
            canEdit={canEdit}
            draft={draft}
            onDraftChange={updateDraft}
            dirty={Boolean(dirty)}
            previewHtml={previewHtml}
            previewNote={previewNote}
            feedback={feedback}
            previewing={previewing}
            saving={saving}
            applyToQueued={applyToQueued}
            queuedPreview={queuedPreview}
            queuePreviewing={queuePreviewing}
            onPreview={requestPreview}
            onSave={saveDraft}
            onCancel={cancelDraft}
            onToggleApplyToQueued={toggleApplyToQueued}
            onReviewQueuedCopies={reviewQueuedCopies}
          />
        ) : detail?.kind === 'system' ? <TourNotificationDetail detail={detail} /> : entry ? <UnknownWorkflowDetail entry={entry} /> : null}
      </div>
    </PortalPageFrame>
  )
}

function SavedWorkflowDetail(props: {
  detail: SavedDetail
  entry: AutomationLibraryEntry
  templates: TemplateRow[]
  activeTemplate: TemplateRow | null
  selectedStepKey: string
  onSelectStep: (key: string) => void
  canEdit: boolean
  draft: ContentDraft
  onDraftChange: (field: keyof ContentDraft, value: string) => void
  dirty: boolean
  previewHtml: string | null
  previewNote: string | null
  feedback: string | null
  previewing: boolean
  saving: boolean
  applyToQueued: boolean
  queuedPreview: QueuedCopyPreview | null
  queuePreviewing: boolean
  onPreview: () => void
  onSave: () => void
  onCancel: () => void
  onToggleApplyToQueued: (enabled: boolean) => void
  onReviewQueuedCopies: () => void
}) {
  const { detail } = props
  return (
    <>
      <section aria-label="Automation activity" className="grid grid-cols-2 border-y border-[color:var(--portal-border)] sm:grid-cols-3">
        <Metric label="Active enrollments" value={metricLabel(detail.activity.activeEnrollments)} />
        <Metric label="Emails sent" value={metricLabel(detail.activity.sentEmails)} />
        <Metric label="Runtime gate" value={detail.sendsConfigured === null ? 'Unknown' : detail.sendsConfigured ? 'Enabled' : 'Disabled'} />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5">
            <h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Saved sequence</h2>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Ordered by its saved step order. Timing and channel controls are unavailable here.</p>
          </div>
          {props.templates.length ? <ol className="divide-y divide-[color:var(--portal-border)]">
            {props.templates.map((template, index) => (
              <li key={template.id}>
                <button type="button" onClick={() => props.onSelectStep(template.step_key)} aria-current={props.selectedStepKey === template.step_key ? 'step' : undefined} className={`flex min-h-20 w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 sm:px-5 ${props.selectedStepKey === template.step_key ? 'bg-[color:var(--portal-soft)]' : ''}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--portal-border)] text-[10px] font-bold tabular-nums text-[color:var(--portal-muted)]">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[color:var(--portal-text)]">{template.name}{template.active ? null : <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Inactive in saved configuration</span>}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--portal-muted)]"><span>{timingForTemplate(template)}</span><ChannelLabel channel={template.channel} />{template.uses_existing_delivery ? <span>Existing brochure delivery</span> : null}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol> : <p className="p-5 text-sm text-[color:var(--portal-muted)]">No saved steps were returned.</p>}
          <div className="border-t border-[color:var(--portal-border)] px-4 py-4 sm:px-5">
            <h3 className="text-xs font-bold text-[color:var(--portal-text)]">Enrollment gates</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[color:var(--portal-muted)]">{detail.enrollmentRules.map((rule) => <li key={rule} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a8792f]" />{rule}</li>)}</ul>
            <h3 className="mt-4 border-t border-[color:var(--portal-border)] pt-4 text-xs font-bold text-[color:var(--portal-text)]">Exit and delivery checks</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[color:var(--portal-muted)]">{detail.exitRules.map((rule) => <li key={rule} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a8792f]" />{rule}</li>)}</ul>
          </div>
        </section>
        <div className="min-w-0 space-y-5">
          <SelectedStepPanel {...props} />
          {props.activeTemplate?.uses_existing_delivery ? <ReadOnlyEmailPreview title={detail.brochureDelivery.subject} previewText={detail.brochureDelivery.previewText} html={detail.brochureDelivery.bodyHtml} note={detail.brochureDelivery.note} /> : null}
        </div>
      </div>
    </>
  )
}

function SelectedStepPanel(props: Parameters<typeof SavedWorkflowDetail>[0]) {
  const { activeTemplate, canEdit } = props
  if (!activeTemplate) return <Notice tone="info" title="No step selected." body="Choose a saved step to inspect its configuration." />
  if (activeTemplate.channel === 'phone') return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <div className="flex items-center gap-2"><Phone size={16} aria-hidden="true" className="text-[#a8792f]" /><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Phone task details</h2></div>
      <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">This step creates a staff task when its scheduled time is in the future. It does not place a call.</p>
      <dl className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 text-sm"><InfoRow label="Task title" value={activeTemplate.name} /><InfoRow label="Due" value={timingForTemplate(activeTemplate)} /><InfoRow label="Task notes" value={activeTemplate.body || 'No saved task notes.'} /></dl>
    </section>
  )
  if (activeTemplate.uses_existing_delivery) return <Notice tone="info" title="Existing brochure delivery" body="This step points to the real brochure delivery job. Its copy is rendered by the existing application email, shown below; saved step fields are not used." />
  if (!canEdit) return <Notice tone="info" title="This channel is read-only." body="The current execution path does not use an editable saved email template for this step." />

  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5">
        <div><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Email content</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{timingForTemplate(activeTemplate)} · {activeTemplate.active ? 'Enabled in saved configuration' : 'Inactive in saved configuration'}</p></div>
        {props.dirty ? <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">Unsaved changes</span> : <span className="text-[10px] text-[color:var(--portal-muted)]">Saved</span>}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <Field label="Internal email name"><input value={props.draft.name} onChange={(event) => props.onDraftChange('name', event.target.value)} maxLength={500} className={inputClass} /></Field>
        <Field label="Subject"><input value={props.draft.subject} onChange={(event) => props.onDraftChange('subject', event.target.value)} maxLength={500} className={inputClass} /><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">The saved subject also supplies inbox preview text.</p></Field>
        <Field label="Email body"><textarea value={props.draft.body} onChange={(event) => props.onDraftChange('body', event.target.value)} maxLength={12000} rows={9} className={`${inputClass} min-h-44 resize-y`} /><p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">Plain text is escaped into the existing Luxor branded email renderer. Keep any existing {'{{merge fields}}'} exactly as written.</p></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Primary button label"><input value={props.draft.cta_text} onChange={(event) => props.onDraftChange('cta_text', event.target.value)} maxLength={500} className={inputClass} /></Field><Field label="Primary button link"><input value={props.draft.cta_url} onChange={(event) => props.onDraftChange('cta_url', event.target.value)} maxLength={500} className={inputClass} placeholder="/visit or https://www.luxoratlaspalmas.com/visit" /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Secondary button label"><input value={props.draft.secondary_cta_text} onChange={(event) => props.onDraftChange('secondary_cta_text', event.target.value)} maxLength={500} className={inputClass} /></Field><Field label="Secondary button link"><input value={props.draft.secondary_cta_url} onChange={(event) => props.onDraftChange('secondary_cta_url', event.target.value)} maxLength={500} className={inputClass} placeholder="/spaces or https://www.luxoratlaspalmas.com/spaces" /></Field></div>
        {activeTemplate.automation_key === 'brochure_lead' && activeTemplate.step_key !== 'email_1' ? <div className="border-t border-[color:var(--portal-border)] pt-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs font-semibold text-[color:var(--portal-text)]">
            <input type="checkbox" checked={props.applyToQueued} disabled={props.saving || props.queuePreviewing} onChange={(event) => props.onToggleApplyToQueued(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#caa24c]" />
            <span>Also update eligible unsent emails already in the queue<span className="mt-1 block font-normal leading-5 text-[color:var(--portal-muted)]">Off by default. This applies only to matching brochure follow-up copies reviewed below. Existing recipients and scheduled send times are preserved.</span></span>
          </label>
          {props.applyToQueued ? <div className="mt-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3">
            <button type="button" onClick={props.onReviewQueuedCopies} disabled={props.queuePreviewing || props.saving} className={secondaryButtonClass}>{props.queuePreviewing ? 'Checking queued emails…' : 'Review matching emails'}</button>
            {props.queuedPreview ? <p role="status" className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">
              {props.queuedPreview.limitExceeded
                ? `${props.queuedPreview.eligibleCount.toLocaleString()} emails match, above the safe 500-email review limit. Save without applying to the queue or ask support for help.`
                : `${props.queuedPreview.eligibleCount.toLocaleString()} eligible queued email${props.queuedPreview.eligibleCount === 1 ? '' : 's'} reviewed. The save confirmation will show the exact number.`}
            </p> : <p className="mt-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">Review first to see the exact current count. Only future-dated queued jobs with no delivery attempt or outbox payload can be changed.</p>}
          </div> : null}
        </div> : null}
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--portal-border)] pt-4">
          <button type="button" onClick={props.onPreview} disabled={props.previewing || props.saving} className={secondaryButtonClass}><Mail size={14} aria-hidden="true" />{props.previewing ? 'Rendering…' : 'Preview'}</button>
          <button type="button" onClick={props.onSave} disabled={!props.dirty || props.saving || props.previewing || props.queuePreviewing || (props.applyToQueued && (!props.queuedPreview || props.queuedPreview.limitExceeded))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] transition hover:bg-[#d6b45f] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><Save size={14} aria-hidden="true" />{props.saving ? 'Saving…' : 'Save changes'}</button>
          <button type="button" onClick={props.onCancel} disabled={!props.dirty || props.saving} className={secondaryButtonClass}>Cancel</button>
        </div>
        {props.feedback ? <p role="status" className="text-xs leading-5 text-[color:var(--portal-muted)]">{props.feedback}</p> : null}
        {props.previewHtml ? <div className="border-t border-[color:var(--portal-border)] pt-4"><p className="text-xs font-bold text-[color:var(--portal-text)]">Preview</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">{props.previewNote}</p><iframe title="Luxor email preview" sandbox="" srcDoc={props.previewHtml} className="mt-3 h-[min(42rem,70vh)] w-full rounded-xl border border-[color:var(--portal-border)] bg-white" /></div> : null}
      </div>
    </section>
  )
}

function ReadOnlyEmailPreview({ title, previewText, html, note }: { title: string; previewText: string; html: string; note: string }) {
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Existing delivery preview</h2><p className="mt-2 text-sm font-semibold text-[color:var(--portal-text)]">{title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Inbox preview: {previewText}</p><p className="mt-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">{note}</p><iframe title="Existing brochure delivery preview" sandbox="" srcDoc={html} className="mt-4 h-[min(42rem,70vh)] w-full rounded-xl border border-[color:var(--portal-border)] bg-white" /></section>
}

function TourNotificationDetail({ detail }: { detail: TourDetail }) {
  const emailByKey = { confirmation: detail.emails.confirmation, reminder_24: detail.emails.reminder_24, reminder_2: detail.emails.reminder_2 }
  const [selectedEmail, setSelectedEmail] = React.useState('confirmation')
  const preview = emailByKey[selectedEmail as keyof typeof emailByKey]
  return (
    <>
      <section aria-label="Tour notification activity" className="grid grid-cols-2 border-y border-[color:var(--portal-border)] sm:grid-cols-3"><Metric label="Emails sent" value={metricLabel(detail.activity.sentEmails)} /><Metric label="Texts sent or delivered" value={metricLabel(detail.activity.sentTexts)} /><Metric label="Enrollment" value="Per tour revision" /></section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Email sequence</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Rendered and queued by the tour calendar system. No shared email template editor exists for these notices.</p></div>
          <ol className="divide-y divide-[color:var(--portal-border)]">{detail.emailSteps.map((step, index) => <li key={step.key} className="flex gap-3 px-4 py-4 sm:px-5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--portal-border)] text-[10px] font-bold tabular-nums text-[color:var(--portal-muted)]">{index + 1}</span><div><p className="text-sm font-semibold text-[color:var(--portal-text)]">{step.name}</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">{step.timing} · {step.channel}</p></div></li>)}</ol>
          <div className="border-t border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><p className="text-xs font-bold text-[color:var(--portal-text)]">Related SMS notices</p><ol className="mt-3 space-y-3">{detail.smsSteps.map((step) => <li key={step.key} className="flex gap-2"><MessageSquareText size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a8792f]" /><span><span className="text-xs font-semibold text-[color:var(--portal-text)]">{step.name}</span><span className="mt-0.5 block text-[11px] leading-5 text-[color:var(--portal-muted)]">{step.timing}</span></span></li>)}</ol><p className="mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">{detail.texts.consent}</p></div>
          <div className="border-t border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><h3 className="text-xs font-bold text-[color:var(--portal-text)]">Calendar and delivery behavior</h3><ul className="mt-2 space-y-2 text-xs leading-5 text-[color:var(--portal-muted)]">{detail.behavior.map((rule) => <li key={rule} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a8792f]" />{rule}</li>)}</ul></div>
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Code-managed email examples</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{detail.emails.sampleNotice}</p><div role="group" aria-label="Choose a tour email example" className="mt-3 flex flex-wrap gap-2">{detail.emailSteps.map((step) => <button key={step.key} type="button" aria-pressed={selectedEmail === step.key} onClick={() => setSelectedEmail(step.key)} className={`min-h-10 rounded-lg border px-3 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${selectedEmail === step.key ? 'border-[#caa24c]/60 bg-[#caa24c]/10 text-[color:var(--portal-text)]' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>{step.name}</button>)}</div><p className="mt-4 text-sm font-semibold text-[color:var(--portal-text)]">{preview.subject}</p><p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">{preview.source}</p><iframe title={`${preview.subject} example`} sandbox="" srcDoc={preview.body} className="mt-3 h-[min(38rem,65vh)] w-full rounded-xl border border-[color:var(--portal-border)] bg-white" /></section>
          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"><div className="flex items-center gap-2"><MessageSquareText size={15} aria-hidden="true" className="text-[#a8792f]" /><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Code-managed SMS examples</h2></div><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{detail.texts.sampleNotice}</p><div className="mt-4 space-y-4">{[detail.texts.confirmation, detail.texts.reminder].map((item) => <div key={item.body} className="border-t border-[color:var(--portal-border)] pt-3"><p className="text-[11px] font-semibold text-[color:var(--portal-text)]">{item.timing}</p><p className="mt-2 whitespace-pre-wrap rounded-xl bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-text)]">{item.body}</p></div>)}</div></section>
        </div>
      </div>
    </>
  )
}

function UnknownWorkflowDetail({ entry }: { entry: AutomationLibraryEntry }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,.65fr)]">
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Saved steps</h2>{entry.steps.length ? <ol className="mt-4 space-y-3">{entry.steps.map((step, index) => <li key={step.key} className="flex gap-3 border-b border-[color:var(--portal-border)] pb-3 last:border-0"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--portal-border)] text-[10px] font-bold text-[color:var(--portal-muted)]">{index + 1}</span><span><span className="text-sm font-semibold text-[color:var(--portal-text)]">{step.name}</span><span className="mt-1 block text-[11px] text-[color:var(--portal-muted)]">{step.channel} · {step.delayDays === null ? 'Timing unavailable' : step.delayDays === 0 ? 'At enrollment' : `${step.delayDays} days after enrollment`}</span></span></li>)}</ol> : <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No saved step definitions are available.</p>}</section>
      <Notice tone="info" title="Runtime behavior is unverified." body="The current application has no verified execution path for this saved definition. This page shows the library’s saved metadata only; triggers, content, timing, and controls remain unavailable." />
    </div>
  )
}

function StatusBadge({ status }: { status: AutomationStatus }) {
  const styles: Record<AutomationStatus, string> = {
    active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    draft: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
    paused: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    unknown: 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]',
    'system-managed': 'bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]',
  }
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.1em] ${styles[status]}`}>{statusLabel(status)}</span>
}

function ChannelLabel({ channel }: { channel: string }) {
  if (channel === 'email') return <span className="inline-flex items-center gap-1"><Mail size={11} aria-hidden="true" />Email</span>
  if (channel === 'phone') return <span className="inline-flex items-center gap-1"><Phone size={11} aria-hidden="true" />Phone task</span>
  if (channel === 'sms') return <span className="inline-flex items-center gap-1"><MessageSquareText size={11} aria-hidden="true" />SMS</span>
  return <span className="inline-flex items-center gap-1"><Clock3 size={11} aria-hidden="true" />{channel}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-h-20 border-r border-[color:var(--portal-border)] p-3 last:border-r-0 sm:p-4"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p><p className="mt-2 font-serif text-xl font-semibold tabular-nums text-[color:var(--portal-text)]">{value}</p></div>
}

function metricLabel(value: number | null) { return value === null ? 'Unavailable' : value.toLocaleString() }

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--portal-text)]">{value}</dd></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[11px] font-bold text-[color:var(--portal-text)]">{label}</span>{children}</label>
}

function Notice({ tone, title, body, action }: { tone: 'error' | 'info'; title: string; body: string; action?: React.ReactNode }) {
  const color = tone === 'error' ? 'border-rose-500/25 bg-rose-500/5' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'
  return <section className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between ${color}`}><div><h2 className="text-sm font-bold text-[color:var(--portal-text)]">{title}</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{body}</p></div>{action}</section>
}

function DetailSkeleton() {
  return <div className="space-y-5 p-1" role="status" aria-label="Loading automation details"><div className="h-20 animate-pulse rounded-xl bg-[color:var(--portal-soft)]" /><div className="h-24 animate-pulse rounded-xl bg-[color:var(--portal-soft)]" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-96 animate-pulse rounded-2xl bg-[color:var(--portal-soft)]" /><div className="h-96 animate-pulse rounded-2xl bg-[color:var(--portal-soft)]" /></div></div>
}

const inputClass = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm leading-5 text-[color:var(--portal-text)] outline-none transition placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/70 focus:ring-2 focus:ring-[#caa24c]/20'
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] transition hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45'
