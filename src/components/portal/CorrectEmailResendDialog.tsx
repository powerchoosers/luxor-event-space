'use client'

import { useEffect, useMemo, useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import type { CorrectEmailResendOption } from '@/lib/luxorLeadEmailResend'

export function CorrectEmailResendDialog({
  isOpen,
  currentEmail,
  leadId,
  options,
  suggestedId,
  onClose,
  onSaveEmail,
  onComplete,
}: {
  isOpen: boolean
  currentEmail: string
  leadId: string
  options: CorrectEmailResendOption[]
  suggestedId: string | null
  onClose: () => void
  onSaveEmail: (email: string) => Promise<boolean>
  onComplete: (status?: string, message?: string) => void
}) {
  const [email, setEmail] = useState(currentEmail)
  const [selectedId, setSelectedId] = useState(suggestedId || '')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setEmail(currentEmail)
    setSelectedId(suggestedId || options[0]?.id || '')
    setError(null)
    setRequestId(crypto.randomUUID())
  }, [currentEmail, isOpen, options, suggestedId])

  const selected = useMemo(() => options.find((option) => option.id === selectedId) || null, [options, selectedId])
  const normalizedEmail = email.trim().toLowerCase()
  const emailSaved = normalizedEmail === currentEmail.trim().toLowerCase()
  const emailValid = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalizedEmail) && normalizedEmail.length <= 254

  const saveAddress = async () => {
    if (!emailValid || emailSaved || saving || sending) return
    setSaving(true)
    setError(null)
    try {
      if (await onSaveEmail(normalizedEmail)) setError(null)
      else setError('The email address was not saved. Review the lead and try again.')
    } finally {
      setSaving(false)
    }
  }

  const sendSelected = async () => {
    if (!selected || !emailSaved || !emailValid || sending || !requestId) return
    setSending(true)
    setError(null)
    try {
      const response = selected.resendKind === 'tour'
        ? await fetch('/api/tour-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryId: leadId, action: 'confirm-email-resend', jobId: selected.id }),
        })
        : await fetch(`/api/leads/${encodeURIComponent(leadId)}/correct-email-resend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceJobId: selected.id, requestId, expectedRecipient: normalizedEmail }),
        })
      const payload = await response.json().catch(() => ({})) as { error?: string; delivery?: string; message?: string; job?: { status?: string; last_error?: string } }
      if (!response.ok) throw new Error(payload.error || 'The resend could not be queued.')
      if (payload.job?.status === 'failed' || payload.job?.status === 'cancelled') {
        throw new Error(payload.job.last_error || 'The saved email could not be sent. Review the delivery record before retrying.')
      }
      onComplete(payload.delivery || payload.job?.status, payload.message)
      onClose()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The resend could not be queued.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalModal isOpen={isOpen} onClose={() => !saving && !sending && onClose()} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8792f] dark:text-[#f1d27a]">Email correction</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--portal-text)]">Correct email &amp; resend</h2>
          <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Saving the address does not send. Review the saved message, then choose Send.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="correct-lead-email">Correct email address</label>
          <input id="correct-lead-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" className="min-h-11 min-w-0 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c] focus:ring-2 focus:ring-[#caa24c]/20" />
          <button type="button" onClick={() => void saveAddress()} disabled={!emailValid || emailSaved || saving || sending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">
            <Mail size={14} />{saving ? 'Saving…' : 'Save address'}
          </button>
        </div>

        {options.length ? <>
          <div>
            <label htmlFor="resend-message" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Suggested message</label>
            <PortalSelect value={selectedId} onChange={setSelectedId} aria-label="Choose saved email to resend" className="w-full" options={options.map((option) => ({ value: option.id, label: `${option.sourceKind}${option.bounced ? ' — most recent bounce' : ''} — ${option.subject}${option.unavailableLabel ? ` (${option.unavailableLabel})` : ''}` }))} />
          </div>
          {selected ? <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs">
            <p className="text-[color:var(--portal-muted)]">To <span className="break-all font-semibold text-[color:var(--portal-text)]">{normalizedEmail || 'Enter an email address'}</span></p>
            <p className="mt-1 text-[color:var(--portal-muted)]">Subject <span className="font-semibold text-[color:var(--portal-text)]">{selected.subject}</span></p>
            <div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 leading-5 text-[color:var(--portal-text)]">{selected.body.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</div>
          </div> : null}
        </> : <p className="rounded-lg border border-dashed border-[color:var(--portal-border)] p-3 text-sm text-[color:var(--portal-muted)]">No eligible saved message is available for this lead. Use its stage-specific delivery action.</p>}

        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving || sending} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">Close</button>
          <button type="button" onClick={() => void sendSelected()} disabled={!selected || selected.canSend === false || !emailSaved || !emailValid || sending || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-white hover:bg-[#b68d3b] disabled:opacity-50"><Send size={14} />{sending ? 'Sending…' : selected?.canSend === false ? selected.unavailableLabel || 'Unavailable' : selected?.resendKind === 'agreement' ? 'Queue agreement resend' : 'Send corrected email'}</button>
        </div>
      </div>
    </PortalModal>
  )
}
