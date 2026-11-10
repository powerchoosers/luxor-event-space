'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalModal } from '@/components/portal/PortalUI'
import { renderInquiryConfirmation } from '@/lib/luxorSystemMessageTemplates'

type Template = { body_template: string; revision: number }
type Response = { template: Template; installed: boolean; canEdit: boolean; defaultBody: string; error?: string }

export function InquiryConfirmationWorkflow() {
  const searchParams = useSearchParams()
  const [open, setOpen] = React.useState(() => searchParams.get('workflow') === 'inquiry_confirmation')
  const [data, setData] = React.useState<Response | null>(null)
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [feedback, setFeedback] = React.useState('')
  const [retry, setRetry] = React.useState(0)
  const [confirmClose, setConfirmClose] = React.useState(false)
  const dirty = Boolean(data && body !== data.template.body_template)
  const requestedWorkflow = searchParams.get('workflow')
  React.useEffect(() => { if (requestedWorkflow === 'inquiry_confirmation') setOpen(true) }, [requestedWorkflow])
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setBusy(true); setError('')
    fetch('/api/marketing/system-messages/inquiry-confirmation', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { const result = await response.json() as Response; if (!response.ok) throw new Error(result.error || 'Message could not load.'); setData(result); setBody(result.template.body_template) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Message could not load.') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [open, retry])
  React.useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  async function save() {
    if (!data || !dirty) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const response = await fetch('/api/marketing/system-messages/inquiry-confirmation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, revision: data.template.revision }) })
      const result = await response.json() as { template?: Template; error?: string }
      if (!response.ok || !result.template) throw new Error(result.error || 'Message could not be saved.')
      setData({ ...data, template: result.template }); setBody(result.template.body_template)
      setFeedback('Saved for future inquiry texts. Existing queued texts were not changed.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Message could not be saved.') }
    finally { setBusy(false) }
  }
  let preview = ''
  try { preview = renderInquiryConfirmation(body, { fullName: 'Sample guest', eventType: 'celebration' }) } catch { /* Incomplete drafts are allowed until save. */ }
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5" aria-labelledby="inquiry-confirmation-heading">
    <h2 id="inquiry-confirmation-heading"><button type="button" aria-expanded={open} aria-controls="inquiry-confirmation-workflow" onClick={() => { if (open && dirty) { setConfirmClose(true); return } setOpen((value) => !value) }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span><span className="block text-base font-bold text-[color:var(--portal-text)]">Inquiry confirmation text</span><span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">System message · Customer-care SMS</span></span><ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button></h2>
    {open ? <div id="inquiry-confirmation-workflow" className="space-y-4 pt-4">
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">When an inquiry without a tour date is created, this text can be queued if the guest has a phone number and recorded customer-care text consent. It also runs on relevant inquiry updates. Consent is checked again before delivery. One job is created per inquiry; a STOP opt-out blocks sending.</p>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Status: system-managed. There is no separate on/off switch for this message; queueing and delivery depend on the existing consent and worker checks.</p>
      {busy && !data ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading message…</p> : null}
      {error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} {!data ? <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Try again</button> : null}</p> : null}
      {data ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{!data.installed ? 'The message editor is not installed yet; the current default remains in use.' : !data.canEdit ? 'Live editing is unavailable in this preview.' : 'Changes apply only to new jobs. Already queued texts keep their existing content.'}</p>
        <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Message<textarea value={body} onChange={(event) => { setBody(event.target.value); setFeedback('') }} maxLength={300} rows={4} disabled={!data.canEdit || busy} className="mt-1 block w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/45 disabled:opacity-60" /></label>
        <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Use {'{{first_name}}'} and {'{{event_type}}'} for personal details. Luxor identification and STOP instructions are added automatically.</p>
        {preview ? <div className="rounded-xl bg-[color:var(--portal-soft)] p-3"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Sample preview</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{preview}</p></div> : null}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!data.canEdit || busy} onClick={() => { setBody(data.defaultBody); setFeedback('Original message loaded for review. Save to apply it to future texts.') }} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Load original message</button><button type="button" disabled={!data.canEdit || !dirty || busy} onClick={() => void save()} className="luxor-gold-raised min-h-11 rounded-lg px-4 text-xs font-bold !text-white disabled:opacity-45">{busy ? 'Saving…' : 'Save message'}</button></div>
        {feedback ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">{feedback}</p> : null}</> : null}
    </div> : null}
    <PortalModal isOpen={confirmClose} onClose={() => setConfirmClose(false)} title="Discard message changes?" maxWidth="max-w-md" footer={<div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setConfirmClose(false)}>Keep editing</PortalButton><PortalButton type="button" variant="primary" onClick={() => { setBody(data?.template.body_template || ''); setConfirmClose(false); setOpen(false) }}>Discard changes</PortalButton></div>}><p className="text-sm text-[color:var(--portal-muted)]">Your changes have not been saved.</p></PortalModal>
  </section>
}
