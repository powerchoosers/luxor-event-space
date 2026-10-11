'use client'

import { useState } from 'react'
import { PortalButton, PortalModal } from './PortalUI'
import { SAME_DAY_CARD_CUTOFF_TERMS } from '@/lib/luxorSameDayBooking'

export type SameDayReceiptEvidence = { receivedAt: string; receiptEvidence: string; receiptTimingConfirmed: boolean }

export function SameDayReceiptDialog({ isOpen, onClose, onSubmit, busy }: {
  isOpen: boolean; onClose: () => void; onSubmit: (evidence: SameDayReceiptEvidence) => void; busy: boolean
}) {
  return <PortalModal isOpen={isOpen} onClose={onClose} title="Verify the received payment" maxWidth="max-w-md">
    {isOpen && <SameDayReceiptForm onClose={onClose} onSubmit={onSubmit} busy={busy} />}
  </PortalModal>
}

function SameDayReceiptForm({ onClose, onSubmit, busy }: {
  onClose: () => void; onSubmit: (evidence: SameDayReceiptEvidence) => void; busy: boolean
}) {
  const [receivedAt, setReceivedAt] = useState('')
  const [evidence, setEvidence] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  return <form className="space-y-4 text-[color:var(--portal-text)]" onSubmit={event => { event.preventDefault(); onSubmit({ receivedAt, receiptEvidence: evidence, receiptTimingConfirmed: confirmed }) }}>
      <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Record funds already received. Use the actual successful Cash/Zelle receipt time, not the time you enter this record. An uncertain or late receipt goes to review and does not reserve the date.</p>
      <label className="block space-y-2 text-sm font-semibold">Actual receipt time, with timezone<input required value={receivedAt} onChange={event => setReceivedAt(event.target.value)} placeholder="2026-10-11T22:15:00-05:00" className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-normal" /><span className="block text-xs font-normal text-[color:var(--portal-muted)]">Use an ISO timestamp with its UTC offset, or Z for UTC. The promotion deadline uses America/Chicago.</span></label>
      <label className="block space-y-2 text-sm font-semibold">Receipt evidence<textarea required value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={1000} placeholder="Bank reference or cash receipt and how its time was verified" className="min-h-24 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm font-normal" /></label>
      <label className="flex items-start gap-3 text-sm leading-5"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-[#b98a3e]" /><span>I verified the successful receipt time and the full required initial payment. Leaving this unchecked records the receipt for review.</span></label>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{SAME_DAY_CARD_CUTOFF_TERMS}</p>
      <div className="flex justify-end gap-2"><PortalButton type="button" onClick={onClose} disabled={busy}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Record receipt'}</PortalButton></div>
    </form>
}
