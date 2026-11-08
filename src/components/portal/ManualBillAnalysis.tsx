'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortalButton } from '@/components/portal/PortalUI'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

type Analysis = { status?: string; started_at?: unknown; queued_at?: unknown; lease_until?: unknown; category_suggestion?: unknown; questions?: unknown }
export default function ManualBillAnalysis({ bill, onBillChanged }: { bill: LuxorBill; onBillChanged: (bill: LuxorBill) => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>((bill.extracted_fields?.manual_analysis as Analysis | undefined) || null)
  const [stale, setStale] = useState(false)
  const [leaseUnknown, setLeaseUnknown] = useState(false)
  const [queueMalformed, setQueueMalformed] = useState(false)
  const [verifiedVersion, setVerifiedVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastVersion = useRef(bill.updated_at)
  const currentVersion = useRef(bill.updated_at)
  currentVersion.current = bill.updated_at
  const callback = useRef(onBillChanged)
  callback.current = onBillChanged
  const refresh = useCallback(async () => {
    const requestedVersion = currentVersion.current
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(bill.id)}/analysis`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load AI analysis.')
      const payload = await response.json() as { bill: LuxorBill; analysis: Analysis | null; stale: boolean; leaseUnknown: boolean; queueMalformed: boolean }
      if (currentVersion.current !== requestedVersion) return
      setAnalysis(payload.analysis); setStale(payload.stale); setLeaseUnknown(payload.leaseUnknown); setQueueMalformed(payload.queueMalformed); setVerifiedVersion(payload.bill.updated_at); setError(null)
      if (payload.bill.updated_at !== lastVersion.current) {
        lastVersion.current = payload.bill.updated_at
        callback.current({ ...payload.bill, linked_expense_id: bill.linked_expense_id })
      }
    } catch { setVerifiedVersion(null); setError('Could not load AI analysis. Try again.') }
  }, [bill.id, bill.linked_expense_id])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])
  async function retry() {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(bill.id)}/analysis`, { method: 'POST' })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Could not start AI analysis.') }
      setAnalysis({ status: 'queued' }); setStale(false); setVerifiedVersion(null)
      window.setTimeout(() => void refresh(), 1000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start AI analysis. Try again.') }
    finally { setBusy(false) }
  }
  const verified = verifiedVersion === bill.updated_at
  const overdue = analysis?.status === 'processing' && !leaseUnknown && typeof analysis.lease_until === 'string' && Date.now() >= Date.parse(analysis.lease_until)
  const queueDelayed = analysis?.status === 'queued' && typeof analysis.queued_at === 'string' && Date.now() - Date.parse(analysis.queued_at) >= 300_000
  const canRetry = (!analysis || analysis.status !== 'processing' || overdue) && (!analysis || stale || queueMalformed || analysis.status === 'failed' || overdue || queueDelayed)
  const questions = Array.isArray(analysis?.questions) ? analysis.questions.filter((value): value is string => typeof value === 'string') : []
  return <section className="space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs text-[color:var(--portal-text)]" aria-live="polite">
    <h4 className="font-semibold">AI review of entered details</h4>
    <p className="text-[color:var(--portal-muted)]">Suggestions only. AI has not seen the bill or verified its details.</p>
    {!verified ? <p>Checking whether the saved analysis matches the current bill.</p> : leaseUnknown ? <p>Analysis status needs attention. Its processing lease cannot be verified; contact an administrator before retrying.</p> : queueMalformed ? <p>The saved analysis schedule is invalid. Run analysis again to reset it.</p> : stale && analysis?.status === 'processing' && !overdue ? <p>Details changed while analysis is in progress. Wait for it to finish before retrying.</p> : stale ? <p>Details changed since this analysis. Run it again to review the current entry.</p> : analysis?.status === 'complete' ? <>{typeof analysis.category_suggestion === 'string' ? <p>Suggested category: {analysis.category_suggestion} (not confirmed)</p> : <p>No category suggested.</p>}{questions.length ? <ul className="list-disc space-y-1 pl-4">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : null}</> : analysis?.status === 'failed' ? <p>Analysis could not finish. Run it again when ready.</p> : queueDelayed ? <p>Analysis is still waiting. You can retry or check worker health.</p> : overdue ? <p>Analysis is taking longer than expected. You can retry.</p> : <p>AI analysis is queued or in progress.</p>}
    {error ? <p role="alert">{error}</p> : null}
    {verified && !leaseUnknown && canRetry && bill.status !== 'paid' ? <PortalButton type="button" size="sm" disabled={busy} onClick={() => void retry()}>{busy ? 'Starting…' : 'Run analysis again'}</PortalButton> : null}
  </section>
}
