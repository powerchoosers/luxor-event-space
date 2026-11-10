'use client'

import React from 'react'
import { BROCHURE_STEP_DEFAULTS } from '@/lib/luxorBrochureStepDefaults'

export type BrochureSettingsStep = { id: string; step_key: string; channel: string; name: string; body: string | null; delay_days: number; updated_at: string }

export function BrochureStepSettings({ step, available, contentDirty, onDirtyChange, onSaved }: { step: BrochureSettingsStep; available: boolean; contentDirty: boolean; onDirtyChange: (dirty: boolean) => void; onSaved: (step: BrochureSettingsStep) => void }) {
  const [days, setDays] = React.useState(String(step.delay_days))
  const [name, setName] = React.useState(step.name)
  const [notes, setNotes] = React.useState(step.body || '')
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const original = BROCHURE_STEP_DEFAULTS[step.step_key]
  const dirty = days !== String(step.delay_days) || (step.channel === 'phone' && (name !== step.name || notes !== (step.body || '')))
  function change(next: { days?: string; name?: string; notes?: string }) {
    const newDays = next.days ?? days
    const newName = next.name ?? name
    const newNotes = next.notes ?? notes
    setDays(newDays); setName(newName); setNotes(newNotes); setMessage('')
    onDirtyChange(newDays !== String(step.delay_days) || (step.channel === 'phone' && (newName !== step.name || newNotes !== (step.body || ''))))
  }
  async function save() {
    if (!/^\d+$/.test(days) || Number(days) > 365 || (step.channel === 'phone' && !name.trim())) { setMessage('Enter a task title and a whole number of days from 0 to 365.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/marketing/automation-step-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: step.id, expectedUpdatedAt: step.updated_at, delayDays: Number(days), ...(step.channel === 'phone' ? { name, notes } : {}) }) })
      const result = await response.json() as { error?: string; template?: BrochureSettingsStep }
      if (!response.ok || !result.template) throw new Error(result.error || 'Step settings could not be saved.')
      onDirtyChange(false)
      onSaved(result.template)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Step settings could not be saved.') }
    finally { setSaving(false) }
  }
  const inputClass = 'w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/45 disabled:opacity-60'
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
    <h2 className="text-base font-bold text-[color:var(--portal-text)]">Step settings</h2>
    <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Changes apply to future enrollments. Existing scheduled emails and call tasks keep their current time and content.</p>
    {!available ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Editing live automation is unavailable in this preview.</p> : null}
    <div className="mt-4 space-y-4">
      {step.channel === 'phone' ? <><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Task title<input value={name} onChange={(event) => change({ name: event.target.value })} disabled={!available || saving} maxLength={500} className={`mt-1 ${inputClass}`} /></label><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Task notes<textarea value={notes} onChange={(event) => change({ notes: event.target.value })} disabled={!available || saving} maxLength={12000} rows={4} className={`mt-1 ${inputClass}`} /></label></> : null}
      <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Days after the original brochure request<input type="number" min={0} max={365} step={1} value={days} onChange={(event) => change({ days: event.target.value })} disabled={!available || saving} className={`mt-1 block max-w-36 tabular-nums ${inputClass}`} /></label>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">A time already past when the contact is enrolled is skipped, not sent late. Zero-day steps can be skipped if enrollment happens after the request.</p>
      {original ? <button type="button" disabled={!available || saving} onClick={() => change({ days: String(original.days), ...(step.channel === 'phone' ? { name: original.name || step.name, notes: original.notes || '' } : {}) })} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Load original {step.channel === 'phone' ? 'task settings' : 'timing'}</button> : null}
      {contentDirty ? <p className="text-xs text-[color:var(--portal-muted)]">Save or discard email content changes before saving these settings.</p> : null}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => change({ days: String(step.delay_days), name: step.name, notes: step.body || '' })} disabled={!dirty || saving} className="inline-flex min-h-11 items-center rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Discard</button><button type="button" onClick={() => void save()} disabled={!available || !dirty || saving || contentDirty} className="luxor-gold-raised inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-bold !text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">{saving ? 'Saving…' : 'Save step settings'}</button></div>
      {message ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{message}</p> : null}
    </div>
  </section>
}
