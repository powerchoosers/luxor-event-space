'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortalButton } from '@/components/portal/PortalUI'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

type Analysis = { status?: string; started_at?: string; category_suggestion?: unknown; questions?: unknown }
export default function ManualBillAnalysis({ bill, onBillChanged }: { bill: LuxorBill; onBillChanged: (bill: LuxorBill) => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>((bill.extracted_fields?.manual_analysis as Analysis | undefined) || null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastVersion = useRef(bill.updated_at)
  const callback = useRef(onBillChanged)
  callback.current = onBillChanged
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(bill.id)}/analysis`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load AI analysis.')
      const payload = await response.json() as { bill: LuxorBill; analysis: Analysis | null; stale: boolean }
      setAnalysis(payload.analysis); setStale(payload.stale); setError(null)
      if (payload.bill.updated_at !== lastVersion.current) {
        lastVersion.current = payload.bill.updated_at
        callback.current({ ...payload.bill, linked_expense_id: bill.linked_expense_id })
      }
    } catch { setError('Could not load AI analysis. Try again.') }
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
      if (!response.ok) throw new Error('Could not start AI analysis.')
      setAnalysis({ status: 'queued' }); setStale(false)
      window.setTimeout(() => void refresh(), 1000)
    } catch { setError('Could not start AI analysis. Try again.') }
    finally { setBusy(false) }
  }
  const overdue = analysis?.status === 'processing' && Date.now() - Date.parse(analysis.started_at || '') >= 90_000
  const canRetry = !analysis || stale || analysis.status === 'queued' || analysis.status === 'failed' || overdue
  const questions = Array.isArray(analysis?.questions) ? analysis.questions.filter((value): value is string => typeof value === 'string') : []
  return <section className="space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs text-[color:var(--portal-text)]" aria-live="polite">
    <h4 className="font-semibold">AI review of entered details</h4>
    <p className="text-[color:var(--portal-muted)]">Suggestions only. AI has not seen the bill or verified its details.</p>
    {stale ? <p>Details changed since this analysis. Run it again to review the current entry.</p> : analysis?.status === 'complete' ? <>{typeof analysis.category_suggestion === 'string' ? <p>Suggested category: {analysis.category_suggestion} (not confirmed)</p> : <p>No category suggested.</p>}{questions.length ? <ul className="list-disc space-y-1 pl-4">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : null}</> : analysis?.status === 'failed' ? <p>Analysis could not finish. Retry when ready.</p> : overdue ? <p>Analysis is taking longer than expected. You can retry.</p> : <p>AI analysis is queued or in progress.</p>}
    {error ? <p role="alert">{error}</p> : null}
    {canRetry && bill.status !== 'paid' ? <PortalButton type="button" size="sm" disabled={busy} onClick={() => void retry()}>{busy ? 'Starting…' : 'Run analysis again'}</PortalButton> : null}
  </section>
}
