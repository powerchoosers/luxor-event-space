'use client'

import React from 'react'
import { PortalSkeleton } from '@/components/portal/PortalUI'
import { BROCHURE_DELIVERY_DEFAULT, type BrochureDeliveryCopy } from '@/lib/luxorBrochureDeliveryCopy'

export function BrochureDeliveryEditor({ onDirtyChange, onSaved }: { onDirtyChange: (dirty: boolean) => void; onSaved: (message: string) => void }) {
  const [setting, setSetting] = React.useState<{ copy: BrochureDeliveryCopy | null; revision: number; installed: boolean; canEdit: boolean } | null>(null)
  const [draft, setDraft] = React.useState<BrochureDeliveryCopy | null>(null)
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [retry, setRetry] = React.useState(0)
  React.useEffect(() => {
    const controller = new AbortController()
    setSetting(null); setError('')
    fetch('/api/marketing/system-messages/brochure-delivery', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as { setting?: { copy_override: BrochureDeliveryCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }; if (!response.ok || !payload.setting) throw new Error(payload.error || 'Brochure settings could not load.'); setSetting({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true }); setDraft(payload.setting.copy_override) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Brochure settings could not load.') })
    return () => controller.abort()
  }, [retry])
  const dirty = Boolean(setting && JSON.stringify(setting.copy) !== JSON.stringify(draft))
  function change(next: BrochureDeliveryCopy | null) { setDraft(next); setError(''); onDirtyChange(Boolean(setting && JSON.stringify(setting.copy) !== JSON.stringify(next))) }
  async function save() {
    if (!setting || !dirty) return
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/marketing/system-messages/brochure-delivery', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: draft, revision: setting.revision }) })
      const payload = await response.json() as { setting?: { copy_override: BrochureDeliveryCopy | null; revision: number }; error?: string }
      if (!response.ok || !payload.setting) throw new Error(payload.error || 'Brochure settings could not be saved.')
      onDirtyChange(false); onSaved('Brochure delivery saved for future requests. Queued emails keep their existing content.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Brochure settings could not be saved.') }
    finally { setSaving(false) }
  }
  if (!setting) return error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p> : <div className="space-y-4 pt-1"><div className="space-y-1"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-3 w-72 rounded opacity-60" /></div><div className="space-y-3"><PortalSkeleton className="h-10 w-full rounded-xl" /><PortalSkeleton className="h-24 w-full rounded-xl" /><PortalSkeleton className="h-10 w-28 rounded-lg" /></div></div>
  return <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Brochure delivery email</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{!setting.installed ? 'The editor is not installed yet. The original email remains in use.' : !setting.canEdit ? 'Live editing is unavailable in this preview.' : 'Changes apply to future requests. Already queued emails keep their existing content.'} The brochure download and visit links remain in place.</p>{draft ? <><p className="text-xs text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{event_type}}'}, {'{{guest_count}}'}.</p>{(['subject', 'preview', 'title', 'greeting', 'body', 'note'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={draft[field]} onChange={(event) => change({ ...draft, [field]: event.target.value })} disabled={!setting.canEdit || saving} rows={field === 'body' || field === 'note' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!setting.canEdit || saving} onClick={() => change(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original email</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to apply the original.</p></> : <button type="button" disabled={!setting.canEdit || saving} onClick={() => change({ ...BROCHURE_DELIVERY_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Customize copy</button>}<div className="flex gap-2"><button type="button" disabled={!dirty || saving} onClick={() => change(setting.copy)} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Discard</button><button type="button" disabled={!setting.canEdit || !dirty || saving} onClick={() => void save()} className="luxor-gold-raised min-h-11 rounded-lg px-4 text-xs font-bold !text-white disabled:opacity-45">{saving ? 'Saving…' : 'Save email'}</button></div>{error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}</div>
}
