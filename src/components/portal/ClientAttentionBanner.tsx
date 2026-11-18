'use client'

import { useState } from 'react'
import { AlertCircle } from '@/lib/icons/phosphor-compat'
import { luxorLeadNeedsClientAttention } from '@/lib/luxorClientAttention'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { PortalButton } from '@/components/portal/PortalUI'

export function ClientAttentionBanner({
  lead,
  onAcknowledged,
}: {
  lead: LuxorInquiry
  onAcknowledged: (updated: LuxorInquiry) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!luxorLeadNeedsClientAttention(lead)) return null

  async function acknowledge() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/acknowledge-client-attention`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; inquiry?: LuxorInquiry }
      if (!response.ok) throw new Error(payload.error || 'Unable to acknowledge.')
      if (payload.inquiry) onAcknowledged(payload.inquiry)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to acknowledge.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 border border-[#caa24c]/35 bg-[#caa24c]/[0.08] p-4 text-sm text-[color:var(--portal-text)] dark:bg-[#caa24c]/[0.12] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#a8792f] dark:text-[#e6c77f]" aria-hidden />
        <div>
          <p className="font-semibold">Client update needs your attention</p>
          <p className="mt-1 text-[color:var(--portal-muted)]">
            {lead.client_attention_reason || 'The client changed status through a public link or portal.'}
          </p>
          {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </div>
      </div>
      <PortalButton type="button" variant="secondary" disabled={busy} onClick={() => void acknowledge()} className="shrink-0">
        {busy ? 'Saving…' : 'Acknowledge'}
      </PortalButton>
    </div>
  )
}