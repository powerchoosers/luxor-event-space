'use client'

import { Send } from 'lucide-react'
import { PortalCloseButton, PortalModal } from '@/components/portal/PortalUI'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

export type TourEmailResendCandidate = {
  id: string
  recipient_email: string
  subject: string
  body: string
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'
  awaitingOwnerConfirmation: boolean
  last_error?: string | null
}

export function TourEmailResendDialog({
  candidate,
  isOpen,
  isSending = false,
  onClose,
  onConfirm,
}: {
  candidate: TourEmailResendCandidate | null
  isOpen: boolean
  isSending?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const canConfirm = candidate?.status === 'failed'
    || (candidate?.status === 'cancelled' && candidate.awaitingOwnerConfirmation)
  const statusLabel = candidate?.status === 'cancelled' && candidate.awaitingOwnerConfirmation
    ? 'Owner confirmation required'
    : candidate?.status === 'queued' ? 'Confirmation queued'
      : candidate?.status === 'sending' ? 'Confirmation sending'
        : candidate?.status === 'sent' ? 'Confirmation sent'
          : candidate?.status === 'failed' ? 'Delivery failed'
            : 'Confirmation cancelled'
  const title = candidate?.status === 'sent'
    ? 'Tour confirmation sent'
    : candidate?.status === 'sending' ? 'Tour confirmation is sending'
      : candidate?.status === 'queued' ? 'Tour confirmation is queued'
        : candidate?.status === 'failed' ? 'Retry the saved tour confirmation?'
          : candidate?.status === 'cancelled' && candidate.awaitingOwnerConfirmation
            ? 'Resend the saved tour confirmation?'
            : 'Tour confirmation is unavailable'

  return (
    <PortalModal isOpen={isOpen && Boolean(candidate)} onClose={() => !isSending && onClose()} maxWidth="max-w-xl">
      {candidate ? (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8792f] dark:text-[#f1d27a]">{statusLabel}</p>
              <h2 className="mt-2 text-lg font-semibold text-[color:var(--portal-text)]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">{canConfirm
                ? 'Review the saved message and recipient. It will send only after you confirm.'
                : candidate.status === 'sent' ? 'The saved tour confirmation was sent to this recipient.'
                  : candidate.status === 'sending' ? 'The delivery worker is processing this saved confirmation.'
                    : candidate.status === 'queued' ? 'The saved confirmation is waiting in the delivery queue.'
                      : 'This saved confirmation can no longer be sent.'}</p>
            </div>
            <PortalCloseButton onClick={() => !isSending && onClose()} aria-label="Close resend review" />
          </div>
          <dl className="grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm sm:grid-cols-[6rem_1fr]">
            <dt className="text-[color:var(--portal-muted)]">Status</dt><dd className="capitalize text-[color:var(--portal-text)]">{candidate.status === 'cancelled' && candidate.awaitingOwnerConfirmation ? 'Needs your confirmation' : candidate.status}</dd>
            <dt className="text-[color:var(--portal-muted)]">To</dt><dd className="break-all font-medium text-[color:var(--portal-text)]">{candidate.recipient_email}</dd>
            <dt className="text-[color:var(--portal-muted)]">Subject</dt><dd className="break-words text-[color:var(--portal-text)]">{decodeHtmlEntities(candidate.subject)}</dd>
            <dt className="text-[color:var(--portal-muted)]">Message</dt><dd className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs leading-5 text-[color:var(--portal-text)]">{resendMessagePreview(candidate.body)}</dd>
            {candidate.last_error ? <><dt className="text-[color:var(--portal-muted)]">Delivery note</dt><dd className="break-words text-xs text-red-700 dark:text-red-300">{candidate.last_error}</dd></> : null}
          </dl>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isSending} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">{canConfirm ? 'Cancel' : 'Close'}</button>
            {canConfirm ? <button type="button" onClick={onConfirm} disabled={isSending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#b68d3b] disabled:opacity-50"><Send size={13} />{isSending ? 'Working…' : candidate.status === 'failed' ? 'Retry delivery' : 'Confirm and send'}</button> : null}
          </div>
        </div>
      ) : null}
    </PortalModal>
  )
}

function resendMessagePreview(body: string) {
  return decodeHtmlEntities(body
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}
