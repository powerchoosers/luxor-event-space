'use client'

import { useState } from 'react'
import { PortalButton } from '@/components/portal/PortalUI'

type RecordRow = { id: string; updated_at: string; archived_at?: string | null; label: string }

export function OperationsArchivePanel({ type, records, onUpdated }: {
  type: 'bill' | 'vendor'
  records: RecordRow[]
  onUpdated: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function change(row: RecordRow) {
    setBusy(row.id); setError(null)
    try {
      const response = await fetch('/api/operations/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id: row.id, expectedUpdatedAt: row.updated_at, action: row.archived_at ? 'restore' : 'archive' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update archive state.')
      onUpdated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update archive state.') }
    finally { setBusy(null) }
  }
  return <details className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-[color:var(--portal-text)]">Archive and restore {type === 'bill' ? 'bills' : 'vendors'}</summary>
    <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Archived records stay visible here with a label. Restore brings them back to normal lists. Nothing is permanently deleted.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[color:var(--portal-text)]">{error}</p>}
    {records.length ? <ul className="mt-3 max-h-72 divide-y divide-[color:var(--portal-border)] overflow-y-auto">{records.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 text-sm text-[color:var(--portal-text)]">{row.label}{row.archived_at ? ' · Archived' : ''}</span><PortalButton type="button" size="sm" disabled={Boolean(busy)} onClick={() => void change(row)}>{busy === row.id ? 'Saving…' : row.archived_at ? 'Restore' : 'Archive'}</PortalButton></li>)}</ul> : <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No records available.</p>}
  </details>
}
