'use client'

import { useEffect, useState } from 'react'
import { PortalButton, PortalCheckbox, PortalStatusBadge } from '@/components/portal/PortalUI'
import { createdDocumentStatusPresentation } from '@/lib/luxorDocumentCreatorStatus'
import { displayStatusForDocument, type LuxorCreatedDocumentRow, type LuxorCreatedDocumentSigningOrder } from '@/lib/luxorDocumentCreatorTypes'
import type { LuxorCreatedDocumentSignerRow } from '@/lib/luxorCreatedDocumentFieldTypes'

type SignerDraft = {
  id: string
  name: string
  email: string
  role_label: string
  sign_order: number
  status: string
}

export function DocumentCreatorSendStep({
  documentId,
  title,
  status,
  signingOrder,
  reminderEnabled,
  reminderAfterDays,
  sentSubject,
  sentMessage,
  finalPdfPath,
  onUpdated,
}: {
  documentId: string
  title: string
  status: LuxorCreatedDocumentRow['status']
  signingOrder?: LuxorCreatedDocumentSigningOrder
  reminderEnabled?: boolean
  reminderAfterDays?: number
  sentSubject?: string | null
  sentMessage?: string | null
  finalPdfPath?: string | null
  onUpdated: (document: LuxorCreatedDocumentRow) => void
}) {
  const [signers, setSigners] = useState<SignerDraft[]>([])
  const [subject, setSubject] = useState(sentSubject || `Please sign: ${title}`)
  const [message, setMessage] = useState(sentMessage || 'Please review and sign this document.')
  const [order, setOrder] = useState<LuxorCreatedDocumentSigningOrder>(signingOrder || 'parallel')
  const [reminders, setReminders] = useState(Boolean(reminderEnabled))
  const [reminderDays, setReminderDays] = useState(reminderAfterDays || 3)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'send' | 'remind' | 'void' | null>(null)
  const [error, setError] = useState('')
  const locked = status !== 'draft' && status !== 'template'
  const presentation = createdDocumentStatusPresentation(displayStatusForDocument({
    status,
    is_template: false,
    archived_at: null,
  }))

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/operations/documents/${encodeURIComponent(documentId)}/fields`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Recipients could not be loaded.')
        if (cancelled) return
        const rows = Array.isArray(body.signers) ? body.signers as LuxorCreatedDocumentSignerRow[] : []
        setSigners(rows.map((signer) => ({
          id: signer.id,
          name: signer.name || '',
          email: signer.email || '',
          role_label: signer.role_label || 'Signer',
          sign_order: signer.sign_order,
          status: signer.status,
        })))
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Recipients could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [documentId])

  const submit = async (action: 'send' | 'remind' | 'void') => {
    setBusy(action)
    setError('')
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(documentId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          subject,
          message,
          signingOrder: order,
          reminderEnabled: reminders,
          reminderAfterDays: reminderDays,
          signers: signers.map((signer) => ({
            id: signer.id,
            name: signer.name,
            email: signer.email,
            role_label: signer.role_label,
          })),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The request could not be completed.')
      if (body.document) onUpdated(body.document)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The request could not be completed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-2 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Send for signature</h2>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--portal-muted)]">
            Emails are queued when you click Send. Nothing goes out before that.
          </p>
        </div>
        <PortalStatusBadge status={presentation.label} tone={presentation.tone} />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[color:var(--portal-muted)]">Loading recipients…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {signers.map((signer, index) => (
            <div key={signer.id} className="grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
                Name
                <input
                  className="portal-input mt-1 w-full"
                  value={signer.name}
                  disabled={locked || busy !== null}
                  onChange={(event) => setSigners((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))}
                />
              </label>
              <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
                Email
                <input
                  type="email"
                  className="portal-input mt-1 w-full"
                  value={signer.email}
                  disabled={locked || busy !== null}
                  onChange={(event) => setSigners((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, email: event.target.value } : row))}
                />
              </label>
              <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
                Role
                <input
                  className="portal-input mt-1 w-full"
                  value={signer.role_label}
                  disabled={locked || busy !== null}
                  onChange={(event) => setSigners((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, role_label: event.target.value } : row))}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
        Subject
        <input className="portal-input mt-1 w-full" value={subject} disabled={locked || busy !== null} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
        Message
        <textarea className="portal-input mt-1 min-h-28 w-full" value={message} disabled={locked || busy !== null} onChange={(event) => setMessage(event.target.value)} />
      </label>

      <fieldset className="flex flex-wrap gap-2" disabled={locked || busy !== null}>
        <legend className="mb-2 text-xs font-semibold text-[color:var(--portal-text)]">Signing order</legend>
        {([
          ['parallel', 'Parallel', 'Everyone receives the email when you click Send.'],
          ['sequential', 'Sequential', 'The next signer is emailed after the previous signer finishes.'],
        ] as const).map(([value, label, help]) => (
          <button
            key={value}
            type="button"
            aria-pressed={order === value}
            onClick={() => setOrder(value)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs ${
              order === value
                ? 'border-[#caa24c] bg-[#caa24c]/10 text-[color:var(--portal-text)]'
                : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'
            }`}
          >
            <span className="block font-semibold">{label}</span>
            <span className="mt-1 block max-w-xs leading-relaxed">{help}</span>
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <PortalCheckbox
          checked={reminders}
          disabled={locked || busy !== null}
          onChange={setReminders}
          label="Queue a reminder"
          sublabel="Only after you click Send."
        />
        <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
          Days after send
          <input
            type="number"
            min={1}
            max={30}
            className="portal-input mt-1 w-24"
            value={reminderDays}
            disabled={!reminders || locked || busy !== null}
            onChange={(event) => setReminderDays(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {locked ? null : (
          <PortalButton type="button" variant="primary" className="min-h-11" disabled={busy !== null || loading} onClick={() => void submit('send')}>
            {busy === 'send' ? 'Sending…' : 'Send'}
          </PortalButton>
        )}
        {status === 'sent' || status === 'opened' || status === 'partially_signed' ? (
          <PortalButton type="button" variant="secondary" className="min-h-11" disabled={busy !== null} onClick={() => void submit('remind')}>
            {busy === 'remind' ? 'Queuing reminder…' : 'Send reminder'}
          </PortalButton>
        ) : null}
        {locked && status !== 'voided' ? (
          <PortalButton type="button" variant="secondary" className="min-h-11" disabled={busy !== null} onClick={() => void submit('void')}>
            {busy === 'void' ? 'Voiding…' : 'Void'}
          </PortalButton>
        ) : null}
        {finalPdfPath ? (
          <a
            href={`/api/operations/documents/${encodeURIComponent(documentId)}/final-pdf`}
            className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-sm font-semibold text-[color:var(--portal-text)]"
          >
            Download completed PDF
          </a>
        ) : null}
      </div>
    </div>
  )
}
