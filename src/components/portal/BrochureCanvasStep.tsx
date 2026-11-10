'use client'

import React from 'react'
import { BrochureStepSettings, type BrochureSettingsStep } from '@/components/portal/BrochureStepSettings'
import { BROCHURE_EMAIL_DEFAULTS } from '@/lib/luxorBrochureStepDefaults'
import { PortalButton, PortalModal } from '@/components/portal/PortalUI'
import { BrochureDeliveryEditor } from '@/components/portal/BrochureDeliveryEditor'

export type BrochureCanvasTemplate = BrochureSettingsStep & { sort_order: number; subject: string | null; cta_text: string | null; cta_url: string | null; secondary_cta_text: string | null; secondary_cta_url: string | null; uses_existing_delivery: boolean }
type EmailDraft = { name: string; subject: string; body: string; cta_text: string; cta_url: string; secondary_cta_text: string; secondary_cta_url: string }
type QueuePreview = { templateUpdatedAt: string; eligibleCount: number; candidates: Array<{ jobId: string; snapshotHash: string }>; limitExceeded: boolean }
function draftOf(step: BrochureCanvasTemplate): EmailDraft {
  return { name: step.name, subject: step.subject || '', body: step.body || '', cta_text: step.cta_text || '', cta_url: step.cta_url || '', secondary_cta_text: step.secondary_cta_text || '', secondary_cta_url: step.secondary_cta_url || '' }
}

export function BrochureCanvasStep({ step, available, onSaved, onReload, onDirtyChange }: { step: BrochureCanvasTemplate; available: boolean; onSaved: (step: BrochureCanvasTemplate, message?: string) => void; onReload: (message: string) => void; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = React.useState(() => draftOf(step))
  const [settingsDirty, setSettingsDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [applyToQueued, setApplyToQueued] = React.useState(false)
  const [queuePreview, setQueuePreview] = React.useState<QueuePreview | null>(null)
  const [reviewing, setReviewing] = React.useState(false)
  const [confirmQueue, setConfirmQueue] = React.useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(step))
  const original = BROCHURE_EMAIL_DEFAULTS[step.step_key]
  const restoreDefault = Boolean(original && JSON.stringify(draft) === JSON.stringify(original))
  function edit(field: keyof EmailDraft, value: string) {
    const next = { ...draft, [field]: value }
    setDraft(next); setError(''); setQueuePreview(null); onDirtyChange(settingsDirty || JSON.stringify(next) !== JSON.stringify(draftOf(step)))
  }
  function loadDefault() {
    const original = BROCHURE_EMAIL_DEFAULTS[step.step_key]
    if (!original) return
    const next = { ...original }
    setDraft(next); setError(''); setApplyToQueued(false); setQueuePreview(null); onDirtyChange(settingsDirty || JSON.stringify(next) !== JSON.stringify(draftOf(step)))
  }
  async function reviewQueue() {
    setReviewing(true); setError(''); setQueuePreview(null)
    try {
      const response = await fetch('/api/marketing/automation-detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'queued-copy-preview', templateId: step.id }) })
      const payload = await response.json() as QueuePreview & { error?: string }
      if (!response.ok || payload.templateUpdatedAt !== step.updated_at || !Array.isArray(payload.candidates) || !Number.isSafeInteger(payload.eligibleCount) || payload.eligibleCount < 0 || typeof payload.limitExceeded !== 'boolean' || (payload.limitExceeded ? payload.candidates.length !== 0 : payload.candidates.length !== payload.eligibleCount)) throw new Error(payload.error || 'Matching queued emails could not be reviewed.')
      setQueuePreview(payload)
    } catch (err) { setError(err instanceof Error ? err.message : 'Matching queued emails could not be reviewed.') }
    finally { setReviewing(false) }
  }
  async function save() {
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/marketing/automation-detail', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: step.id, expectedUpdatedAt: step.updated_at, updates: draft, restoreDefault, ...(applyToQueued ? { applyToQueued: true, queuedPreview: queuePreview } : {}) }) })
      const payload = await response.json() as { error?: string; template?: BrochureCanvasTemplate; queuedUpdate?: { updatedCount: number; skippedCount: number } }
      if (!response.ok) { if (response.status === 409 && applyToQueued) setQueuePreview(null); throw new Error(payload.error || 'Email could not be saved.') }
      if (payload.queuedUpdate) {
        onDirtyChange(false)
        onReload(`Saved. Updated ${payload.queuedUpdate.updatedCount} queued emails; skipped ${payload.queuedUpdate.skippedCount} that changed or became ineligible.`)
      } else {
        if (!payload.template) throw new Error('Save response was incomplete. Reload the workflow before trying again.')
        setDraft(draftOf(payload.template)); onDirtyChange(false); onSaved(payload.template, 'Step saved for future enrollments.')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Email could not be saved.') }
    finally { setSaving(false) }
  }
  const input = 'mt-1 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60'
  if (step.uses_existing_delivery) return <BrochureDeliveryEditor onDirtyChange={onDirtyChange} onSaved={onReload} />
  return <div className="space-y-4">
    <PortalModal isOpen={confirmQueue} onClose={() => setConfirmQueue(false)} title="Update queued emails?" maxWidth="max-w-md" footer={<div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setConfirmQueue(false)}>Cancel</PortalButton><PortalButton type="button" variant="primary" onClick={() => { setConfirmQueue(false); void save() }}>Save and update</PortalButton></div>}><p className="text-sm text-[color:var(--portal-muted)]">Save this copy and update {queuePreview?.eligibleCount ?? 0} reviewed queued emails? Only eligible future-dated, unattempted messages can change. Recipients and scheduled times stay the same.</p></PortalModal>
    {step.channel === 'email' ? <section className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Email content</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Saved copy applies to future enrollments. Queued messages keep their content unless you review and choose to update them below.</p>{(['name', 'subject', 'body', 'cta_text', 'cta_url', 'secondary_cta_text', 'secondary_cta_url'] as const).map((field) => <label key={field} className="block text-xs font-semibold text-[color:var(--portal-text)]">{{ name: 'Step name', subject: 'Subject', body: 'Message', cta_text: 'Primary button label', cta_url: 'Primary button link', secondary_cta_text: 'Secondary button label', secondary_cta_url: 'Secondary button link' }[field]}{field === 'body' ? <textarea value={draft[field]} onChange={(event) => edit(field, event.target.value)} disabled={!available || saving} rows={6} className={input} /> : <input value={draft[field]} onChange={(event) => edit(field, event.target.value)} disabled={!available || saving} className={input} />}</label>)}<p className="text-xs text-[color:var(--portal-muted)]">Keep existing merge fields intact.</p>{BROCHURE_EMAIL_DEFAULTS[step.step_key] ? <div><button type="button" disabled={!available || saving} onClick={loadDefault} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Load original email</button><p className="text-xs text-[color:var(--portal-muted)]">Review the original, then save to apply it to future enrollments.</p></div> : null}<div className="border-t border-[color:var(--portal-border)] pt-3"><label className="flex min-h-11 items-start gap-3 text-xs font-semibold text-[color:var(--portal-text)]"><input type="checkbox" checked={applyToQueued} disabled={!available || saving || reviewing || (restoreDefault && !applyToQueued)} onChange={(event) => { setApplyToQueued(event.target.checked); setQueuePreview(null) }} className="mt-0.5 accent-[#caa24c]" /><span>Also update eligible queued emails<span className="mt-1 block font-normal text-[color:var(--portal-muted)]">Off by default. Review the matching unattempted messages first; recipients and times stay the same.</span></span></label>{restoreDefault ? <p className="text-xs text-[color:var(--portal-muted)]">Restore the original for future enrollments separately from queued-email updates.</p> : null}{applyToQueued ? <div className="mt-2"><button type="button" disabled={reviewing || saving} onClick={() => void reviewQueue()} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)]">{reviewing ? 'Checking…' : 'Review matching emails'}</button>{queuePreview ? <p role="status" className="mt-2 text-xs text-[color:var(--portal-muted)]">{queuePreview.limitExceeded ? `${queuePreview.eligibleCount} matches exceed the 500-email review limit.` : `${queuePreview.eligibleCount} eligible queued emails reviewed.`}</p> : null}</div> : null}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={!dirty || saving} onClick={() => { setDraft(draftOf(step)); onDirtyChange(settingsDirty) }} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Discard</button><button type="button" disabled={!available || !dirty || saving || settingsDirty || reviewing || (applyToQueued && (!queuePreview || queuePreview.limitExceeded || restoreDefault))} onClick={() => { if (applyToQueued) setConfirmQueue(true); else void save() }} className="luxor-gold-raised min-h-11 rounded-lg px-4 text-xs font-bold !text-white disabled:opacity-45">{saving ? 'Saving…' : 'Save email'}</button></div>{error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}</section> : null}
    <BrochureStepSettings step={step} available={available} contentDirty={dirty} onDirtyChange={(value) => { setSettingsDirty(value); onDirtyChange(value || dirty) }} onSaved={(saved) => { onDirtyChange(false); onSaved({ ...step, ...saved }) }} />
  </div>
}
