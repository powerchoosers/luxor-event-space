'use client'

import { useId, useState } from 'react'
import { PortalDatePicker } from '@/components/portal/PortalUI'
import { accountantExportQuery } from '@/lib/luxorAccountantExportView'

type ExportKind = 'expenses' | 'expensePayments' | 'clientPayments' | 'clientRefunds'
const definitions: Record<ExportKind, { label: string; description: string; url: string; filename: string }> = {
  expenses: { label: 'Expense records', description: 'Filtered by expense date. Unlinked bills are not included.', url: '/api/portal/accountant-expenses?file=expenses', filename: 'luxor-expenses.csv' },
  expensePayments: { label: 'Expense payment history', description: 'Filtered by payment date. Payments, refunds, and reversals are separate records.', url: '/api/portal/accountant-expenses?file=payments', filename: 'luxor-expense-payments.csv' },
  clientPayments: { label: 'Client payment records', description: 'Filtered by received date, or by payment timestamp in Chicago time if no received date is saved. Includes saved statuses and security deposits.', url: '/api/portal/accountant-client-payments?file=payments', filename: 'luxor-client-payments.csv' },
  clientRefunds: { label: 'Client refund records', description: 'Filtered by request date in Chicago time. Includes pending, failed, and completed statuses.', url: '/api/portal/accountant-client-payments?file=refunds', filename: 'luxor-client-refunds.csv' },
}
const button = 'inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50'

/** Placement and verified availability are supplied by the finance integration owner. */
export function AccountantSourceExports({ expenseExportsVerified = false, clientExportsVerified = false }: { expenseExportsVerified?: boolean; clientExportsVerified?: boolean }) {
  const periodGroup = useId()
  const [mode, setMode] = useState<'all' | 'range'>('all')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [busy, setBusy] = useState<ExportKind | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const kinds: ExportKind[] = [...(expenseExportsVerified ? ['expenses', 'expensePayments'] as ExportKind[] : []), ...(clientExportsVerified ? ['clientPayments', 'clientRefunds'] as ExportKind[] : [])]
  const download = async (kind: ExportKind) => {
    setError(''); setNotice('')
    let query: string
    try { query = accountantExportQuery(mode, from, to) }
    catch (e) { setError(e instanceof Error ? e.message : 'Choose a valid period.'); return }
    setBusy(kind)
    try {
      const definition = definitions[kind]
      const response = await fetch(`${definition.url}${query}`, { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null
        throw new Error(typeof body?.error === 'string' ? body.error : 'The export is unavailable. Please try again.')
      }
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('text/csv')) throw new Error('The export could not be verified. Please try again.')
      const url = URL.createObjectURL(await response.blob())
      try {
        const link = document.createElement('a')
        link.href = url; link.download = definition.filename; document.body.appendChild(link)
        try { link.click() } finally { link.remove() }
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setNotice(`${definition.label} download started.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'The export is unavailable. Please try again.') }
    finally { setBusy(null) }
  }
  return <section className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-[color:var(--portal-text)]">
    <div><h2 className="text-base font-bold sm:text-lg">Records for your accountant</h2><p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">Download operational records for review. These files are not financial statements or a general ledger; statuses, security deposits, and refunds need separate review.</p></div>
    {!kinds.length ? <p className="text-sm text-[color:var(--portal-muted)]">Exports are unavailable while their source records are being verified.</p> : <>
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">Dates to include</legend><div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="radio" name={periodGroup} checked={mode === 'all'} onChange={() => setMode('all')} />All dates</label><label className="flex items-center gap-2"><input type="radio" name={periodGroup} checked={mode === 'range'} onChange={() => setMode('range')} />Date range</label></div>
        {mode === 'range' && <><div className="grid gap-3 sm:grid-cols-2"><div><span className="text-sm font-semibold">From</span><PortalDatePicker value={from} onChange={setFrom} /></div><div><span className="text-sm font-semibold">Through</span><PortalDatePicker value={to} onChange={setTo} /></div></div><p className="text-sm text-[color:var(--portal-muted)]">Records without a usable date are excluded from a date range. Use all dates to include them.</p></>}
      </fieldset>
      <div className="divide-y divide-[color:var(--portal-border)]">{kinds.map((kind) => <div key={kind} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{definitions[kind].label}</h3><p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">{definitions[kind].description}</p></div><button type="button" className={button} disabled={busy !== null} onClick={() => void download(kind)}>{busy === kind ? 'Preparing…' : 'Download CSV'}</button></div>)}</div>
      <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Older paid expenses without payment history are flagged in the expense file. A paid status alone does not establish a payment amount or date.</p>
    </>}
    {error && <p role="alert" className="text-sm">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
  </section>
}
