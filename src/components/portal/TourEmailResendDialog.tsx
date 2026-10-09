'use client'

import { Send } from 'lucide-react'
import { PortalCloseButton, PortalModal } from '@/components/portal/PortalUI'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

export type TourEmailResendCandidate = {
  id: string
  recipient_email: string
  subject: string
  body: string
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
  return (
    <PortalModal isOpen={isOpen && Boolean(candidate)} onClose={() => !isSending && onClose()} maxWidth="max-w-xl">
      {candidate ? (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8792f] dark:text-[#f1d27a]">Owner confirmation required</p>
              <h2 className="mt-2 text-lg font-semibold text-[color:var(--portal-text)]">Resend the saved tour confirmation?</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Review the original message and recipient. Confirming sends it once; closing this window leaves it ready for later.</p>
            </div>
            <PortalCloseButton onClick={() => !isSending && onClose()} aria-label="Close resend review" />
          </div>
          <dl className="grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm sm:grid-cols-[6rem_1fr]">
            <dt className="text-[color:var(--portal-muted)]">To</dt><dd className="break-all font-medium text-[color:var(--portal-text)]">{candidate.recipient_email}</dd>
            <dt className="text-[color:var(--portal-muted)]">Subject</dt><dd className="text-[color:var(--portal-text)]">{decodeHtmlEntities(candidate.subject)}</dd>
            <dt className="text-[color:var(--portal-muted)]">Message</dt>
            <dd className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs leading-5 text-[color:var(--portal-text)]">{resendMessagePreview(candidate.body)}</dd>
          </dl>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isSending} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={isSending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#b68d3b] disabled:opacity-50"><Send size={13} />{isSending ? 'Sending…' : 'Confirm and send'}</button>
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}
