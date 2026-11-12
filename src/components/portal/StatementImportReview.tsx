'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PortalDatePicker, PortalSelect, PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'
import { ChevronLeft, ChevronRight } from '@/lib/icons/phosphor-compat'
import { filterStatementReviewRows, isStatementReviewRows, parseStatementCsv, type StatementReviewFilter, type StatementReviewRow } from '@/lib/luxorStatementReview'
import { latestDurableReviews, type DurableMatchReviewEvent } from '@/lib/luxorStatementMatchReview'
import { StatementMatchReview } from '@/components/portal/StatementMatchReview'
import type { AccountingSetupRecord } from '@/lib/luxorAccountingSetup'

type Preview = { preview_sha256: string; rows: StatementReviewRow[]; already_imported: boolean; duplicate_import_id: string | null }
type Summary = { id: string; account_id: string; filename: string; period_start: string; period_end: string; imported_at: string }
const button = 'inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50'
const STATEMENT_SAVING_AVAILABLE = false

/** Embeddable review-only import. Callers own placement and provide confirmed accounts. */
export function StatementImportReview({ accounts, canEdit = false }: { accounts: AccountingSetupRecord[]; canEdit?: boolean }) {
  const [account, setAccount] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [content, setContent] = useState(''), [filename, setFilename] = useState(''), [headers, setHeaders] = useState<string[]>([])
  const [dateCol, setDateCol] = useState(''), [descriptionCol, setDescriptionCol] = useState(''), [amountCol, setAmountCol] = useState(''), [referenceCol, setReferenceCol] = useState('')
  const [hasHeader, setHasHeader] = useState(''), [sign, setSign] = useState(''), [currency, setCurrency] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null), [selected, setSelected] = useState<{ id: string; accountId: string; filename: string; rows: StatementReviewRow[] } | null>(null)
  const [matchRow, setMatchRow] = useState<number | null>(null), [matchEvents, setMatchEvents] = useState<DurableMatchReviewEvent[]>([])
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle'), [hasReviewSnapshot, setHasReviewSnapshot] = useState(false)
  const [statements, setStatements] = useState<Summary[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0)
  const [filter, setFilter] = useState<StatementReviewFilter>('all'), [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loadingImports, setLoadingImports] = useState(true), [importsError, setImportsError] = useState('')
  const revision = useRef(0)
  const importsRequest = useRef(0)
  const reviewsRequest = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const accountOptions = accounts.filter((a) => a.kind === 'account' && a.status === 'confirmed' && ['asset', 'liability'].includes(a.details.classification)).map((a) => ({ value: a.id, label: `${a.details.name}${a.details.number ? ` (${a.details.number})` : ''}` }))
  const columnOptions = headers.map((value, index) => ({ value: String(index), label: `Column ${index + 1}: ${value.slice(0, 70) || '(blank)'}` }))
  const load = useCallback(async () => {
    const requestId = ++importsRequest.current
    setLoadingImports(true)
    try {
      const response = await fetch('/api/portal/statement-imports', { cache: 'no-store' }), data = await response.json()
      if (!response.ok || !Array.isArray(data.statements) || !Number.isSafeInteger(data.total) || data.total < 0 || !data.statements.every((s: unknown) => s && typeof s === 'object' && ['id', 'account_id', 'filename', 'period_start', 'period_end', 'imported_at'].every((key) => typeof (s as Record<string, unknown>)[key] === 'string'))) throw new Error('Statement history is unavailable or contains incompatible records. Please refresh or contact support.')
      if (requestId !== importsRequest.current) return false
      setStatements(data.statements); setTotal(data.total); setImportsError(''); return true
    } catch (e) { if (requestId === importsRequest.current) setImportsError(e instanceof Error ? e.message : 'Unable to load imports.'); return false }
    finally { if (requestId === importsRequest.current) setLoadingImports(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const currentRows = selected?.rows || preview?.rows || []
  const latestReviews = useMemo(() => latestDurableReviews(matchEvents), [matchEvents])
  const filteredRows = useMemo(() => filterStatementReviewRows(currentRows, filter, query), [currentRows, filter, query])
  const pageRows = useMemo(() => filteredRows.slice(page * 20, page * 20 + 20), [filteredRows, page])
  const resetReview = () => { setPage(0); setFilter('all'); setQuery('') }
  const invalidate = () => { revision.current += 1; reviewsRequest.current += 1; setPreview(null); setSelected(null); setMatchRow(null); setMatchEvents([]); setHasReviewSnapshot(false); setReviewStatus('idle'); resetReview() }
  const change = (setter: (value: string) => void, value: string) => { setter(value); invalidate(); setError(''); setNotice('') }
  const requestBody = () => ({ account_id: account, period_start: start, period_end: end, filename, content, has_header: hasHeader === '' ? null : hasHeader === 'yes', columns: { date: dateCol === '' ? null : Number(dateCol), description: descriptionCol === '' ? null : Number(descriptionCol), amount: amountCol === '' ? null : Number(amountCol), ...(referenceCol ? { reference: Number(referenceCol) } : {}), positiveMeans: sign, currency } })
  const chooseFile = async (file?: File) => {
    invalidate(); const currentRevision = revision.current
    setContent(''); setFilename(''); setHeaders([]); setError(''); setNotice('')
    setDateCol(''); setDescriptionCol(''); setAmountCol(''); setReferenceCol('')
    if (!file) return
    if (file.size > 2_000_000) { setError('Choose a CSV file under 2 MB.'); return }
    try {
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
      catch { throw new Error('The file is not valid UTF-8. Export it as a UTF-8 CSV and try again.') }
      const rows = parseStatementCsv(text)
      if (currentRevision !== revision.current) return
      if (!rows.length) throw new Error('The file is empty.')
      setContent(text); setFilename(file.name); setHeaders(rows[0])
    } catch (e) { if (currentRevision === revision.current) setError(e instanceof Error ? e.message : 'Unable to read the CSV.') }
  }
  const submit = async (action: 'preview' | 'import') => {
    const currentRevision = revision.current
    if (action === 'preview') { setPreview(null); setSelected(null); resetReview() }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/portal/statement-imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...requestBody(), action, ...(action === 'import' ? { preview_sha256: preview?.preview_sha256, confirm: true, request_id: crypto.randomUUID() } : {}) }) })
      const data = await response.json()
      if (!response.ok) { if (action === 'import' && (response.status >= 500 || response.status === 409)) setLocked(true); setError(data.error || 'Unable to process statement.'); return }
      if (action === 'preview') {
        if (currentRevision !== revision.current) { setNotice('The inputs changed while the preview loaded. Preview again.'); return }
        if (!isStatementReviewRows(data.rows) || typeof data.preview_sha256 !== 'string' || typeof data.already_imported !== 'boolean' || !(data.duplicate_import_id === null || typeof data.duplicate_import_id === 'string')) throw new Error('Invalid preview')
        setSelected(null); setPreview(data); resetReview()
      } else {
        if (currentRevision === revision.current) { setPreview(null); setContent(''); setFilename(''); setHeaders([]); if (fileInput.current) fileInput.current.value = '' }
        await load(); setNotice('Statement imported for review. No transactions were matched.')
      }
    } catch { if (action === 'import') setLocked(true); setError('The request could not be verified. Refresh imports before retrying.') }
    finally { setBusy(false) }
  }
  const loadReviewHistory = async (id: string) => {
    const requestId = ++reviewsRequest.current
    setReviewStatus('loading')
    try {
      const response = await fetch(`/api/portal/statement-match-reviews?statement_id=${encodeURIComponent(id)}`, { cache: 'no-store' }), data = await response.json()
      if (!response.ok || !Array.isArray(data.events)) throw new Error('Review history unavailable')
      if (requestId !== reviewsRequest.current) return null
      setMatchEvents(data.events); setHasReviewSnapshot(true); setReviewStatus('ready'); return data.events as DurableMatchReviewEvent[]
    } catch { if (requestId === reviewsRequest.current) setReviewStatus('error'); return null }
  }
  const open = async (id: string) => {
    revision.current += 1; reviewsRequest.current += 1
    const currentRevision = revision.current
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/portal/statement-imports?id=${encodeURIComponent(id)}`, { cache: 'no-store' }), data = await response.json()
      if (!response.ok || !isStatementReviewRows(data.statement?.rows)) throw new Error('Statement is unavailable or contains incompatible records. Please refresh or contact support.')
      if (currentRevision !== revision.current) return
      if (typeof data.statement.account_id !== 'string') throw new Error('The statement account could not be verified.')
      setSelected({ id, accountId: data.statement.account_id, filename: data.statement.filename || 'Imported statement', rows: data.statement.rows }); setPreview(null); setMatchRow(null); setMatchEvents([]); setHasReviewSnapshot(false); resetReview()
      await loadReviewHistory(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open import.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-[color:var(--portal-text)]">
    <h2 className="text-base font-bold sm:text-lg">Statement review</h2>
    <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Preview a CSV for review. Saving statements and accounting setup changes is currently unavailable. A preview does not connect a bank, match transactions, post entries, or reconcile an account.</p>
    {error && <div role="alert" className="text-sm">{error} {locked && <button type="button" className="underline" onClick={() => void (async () => { if (await load()) { invalidate(); setLocked(false); setError(''); setNotice('Imports refreshed. Preview the file again before retrying.') } })()}>Refresh imports</button>}</div>}
    {notice && <div role="status" className="text-sm">{notice}</div>}
    {canEdit && <div className="space-y-3 border-t border-[color:var(--portal-border)] pt-4">
      <PortalSelect aria-label="Statement account" value={account} onChange={(v) => change(setAccount, v)} placeholder="Choose a confirmed account" options={accountOptions} />
      {!accountOptions.length && <p className="text-sm text-[color:var(--portal-muted)]">A confirmed asset or liability account is needed to preview. Accounting setup changes are currently unavailable.</p>}
      <div className="grid gap-3 sm:grid-cols-2"><div><span className="text-sm font-semibold">Statement start</span><PortalDatePicker value={start} onChange={(v) => change(setStart, v)} /></div><div><span className="text-sm font-semibold">Statement end</span><PortalDatePicker value={end} onChange={(v) => change(setEnd, v)} /></div></div>
      <label className="block text-sm font-semibold">CSV file<input ref={fileInput} type="file" accept=".csv,text/csv" className="mt-1 block w-full text-sm" onChange={(e) => void chooseFile(e.target.files?.[0])} /></label>
      {headers.length > 0 && <><PortalSelect aria-label="Header row" value={hasHeader} onChange={(v) => change(setHasHeader, v)} placeholder="Does the first row contain column names?" options={[{ value: 'yes', label: 'First row contains column names' }, { value: 'no', label: 'First row is a transaction' }]} />
        <div className="grid gap-3 sm:grid-cols-2">{[[dateCol, setDateCol, 'Date column'], [descriptionCol, setDescriptionCol, 'Description column'], [amountCol, setAmountCol, 'Signed amount column'], [referenceCol, setReferenceCol, 'Reference column (optional)']].map(([value, setter, label]) => <PortalSelect key={label as string} aria-label={label as string} value={value as string} onChange={(v) => change(setter as (value: string) => void, v)} placeholder={label as string} options={columnOptions} />)}</div>
        <PortalSelect aria-label="Positive amount meaning" value={sign} onChange={(v) => change(setSign, v)} placeholder="What does a positive amount mean?" options={[{ value: 'inflow', label: 'Positive means money in' }, { value: 'outflow', label: 'Positive means money out' }]} />
        <PortalSelect aria-label="Statement currency" value={currency} onChange={(v) => change(setCurrency, v)} placeholder="Choose currency" options={[{ value: 'USD', label: 'US dollars (USD)' }]} />
        <p className="text-sm text-[color:var(--portal-muted)]">Dates must be YYYY-MM-DD and amounts plain signed numbers. Values in other formats remain unresolved.</p>
        <button type="button" className={button} disabled={busy || locked} onClick={() => void submit('preview')}>Preview statement</button></>}
    </div>}
    {preview && <div className="space-y-2"><h3 className="font-bold">Review preview</h3><p className="text-sm text-[color:var(--portal-muted)]">{preview.rows.length} rows · {preview.rows.filter((r) => r.issues.length).length} need attention · {preview.rows.filter((r) => r.possibleDuplicateRows.length).length} have possible duplicates. Compare the rows below with your statement. All rows remain unmatched, including rows with no parsing issues.</p>{preview.already_imported ? <div className="space-y-2 text-sm"><p>Identical CSV content is already imported for this account. Review the existing import instead.</p>{preview.duplicate_import_id && <button type="button" className={button} disabled={busy} onClick={() => void open(preview.duplicate_import_id as string)}>Open existing import</button>}</div> : STATEMENT_SAVING_AVAILABLE ? <><p className="text-sm text-[color:var(--portal-muted)]">Unresolved and possibly duplicated rows are saved for review; importing does not correct or match them.</p><button type="button" className={button} disabled={busy || locked} onClick={() => void submit('import')}>Confirm import for review</button></> : <p className="text-sm text-[color:var(--portal-muted)]">This preview is not saved. Saving statements is unavailable until secure user identity is verified.</p>}</div>}
    {(preview || selected) && <div className="space-y-3">
      <h3 className="break-words font-bold">{selected ? selected.filename : 'Statement rows'}</h3>
      <p className="text-sm text-[color:var(--portal-muted)]">Review choices do not verify settlement or reconcile an account. Possible duplicates are prompts to compare rows in this file; a row without parsing issues has not been verified. Filters do not mark rows reviewed.</p>
      {selected && reviewStatus === 'loading' && (
        <div className="space-y-2 py-2" aria-hidden="true">
          <PortalSkeleton className="h-4 w-44 rounded" />
          <PortalSkeleton className="h-3 w-64 rounded opacity-60" />
        </div>
      )}
      {selected && reviewStatus === 'error' && <p role="alert" className="text-sm">Review status is unavailable. <button type="button" className="underline" onClick={() => void loadReviewHistory(selected.id)}>Retry</button></p>}
      {currentRows.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
        <PortalSelect aria-label="Filter statement rows" value={filter} onChange={(value) => { setFilter(value as StatementReviewFilter); setPage(0) }} options={[{ value: 'all', label: 'All statement rows' }, { value: 'unresolved', label: 'Needs attention' }, { value: 'duplicates', label: 'Possible duplicates' }, { value: 'parsed', label: 'No parsing issues' }]} />
        <input aria-label="Search statement rows" type="search" className="portal-input w-full" placeholder="Search description or reference" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
      </div>}
      {currentRows.length > 0 && <p role="status" className="text-sm tabular-nums text-[color:var(--portal-muted)]">Showing {filteredRows.length} of {currentRows.length} rows</p>}
      {!currentRows.length ? <p className="text-sm text-[color:var(--portal-muted)]">No statement rows are available to review.</p> : !filteredRows.length && <p className="text-sm text-[color:var(--portal-muted)]">No rows match these filters. Choose another filter or clear the search.</p>}
      {pageRows.map((row) => <article key={row.rowNumber} className="border-b border-[color:var(--portal-border)] py-2 text-sm">
        <div className="break-words font-semibold">Row {row.rowNumber} · {row.description || 'Description missing'}</div>
        <p className="tabular-nums text-[color:var(--portal-muted)]">{row.date || 'Date unknown'} · {row.amountCents === null ? 'Amount unknown' : `${row.currency} ${(row.amountCents / 100).toFixed(2)} ${row.direction}`}</p>
        {row.reference && <p className="break-all text-[color:var(--portal-muted)]">Reference: {row.reference}</p>}
        {row.issues.map((issue) => <p key={issue}>{issue}</p>)}
        {row.issues.length > 0 && <p className="break-all text-[color:var(--portal-muted)]">Original fields: {row.raw.join(' | ')}</p>}
        {row.possibleDuplicateRows.length > 0 && <p>Possible duplicate rows: {row.possibleDuplicateRows.join(', ')}</p>}
        {selected && <><p className="mt-1 text-[color:var(--portal-muted)]">{reviewStatus !== 'ready' ? 'Review status unavailable.' : latestReviews.get(row.rowNumber)?.action === 'selected' ? 'Review choice recorded; settlement unverified.' : 'No review choice recorded.'}</p><button type="button" className={`${button} mt-2`} disabled={!hasReviewSnapshot} onClick={() => setMatchRow((current) => current === row.rowNumber ? null : row.rowNumber)}>{matchRow === row.rowNumber ? 'Close review' : 'Review possible match'}</button>
          {matchRow === row.rowNumber && hasReviewSnapshot && <div className="mt-3"><StatementMatchReview key={`${selected.id}-${row.rowNumber}`} statementId={selected.id} accountLabel={accountOptions.find((a) => a.value === selected.accountId)?.label || null} row={row} events={matchEvents} canEdit={canEdit && reviewStatus === 'ready'} statusVerified={reviewStatus === 'ready'} onRefresh={() => loadReviewHistory(selected.id)} /></div>}</>}
      </article>)}
      {filteredRows.length > 0 && <div className="flex items-center gap-3"><button type="button" className={button} aria-label="Previous statement rows" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></button><span className="tabular-nums text-sm">{page + 1} / {Math.ceil(filteredRows.length / 20)}</span><button type="button" className={button} aria-label="Next statement rows" disabled={(page + 1) * 20 >= filteredRows.length} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button></div>}
    </div>}
    <div className="space-y-2 border-t border-[color:var(--portal-border)] pt-4">
      <h3 className="font-bold">Imported statements</h3>
      <PortalSkeletonTransition
        loading={loadingImports}
        overlap
        skeleton={
          <div className="space-y-2 py-1" aria-hidden="true">
            <PortalSkeleton className="h-9 w-full rounded-lg" />
            <PortalSkeleton className="h-9 w-full rounded-lg" />
          </div>
        }
      >
        {importsError ? (
          <p role="alert" className="text-sm">{importsError} <button type="button" className="underline" onClick={() => void load()}>Try again</button></p>
        ) : !statements.length ? (
          <p className="text-sm text-[color:var(--portal-muted)]">No statements imported yet.</p>
        ) : (
          statements.map((item) => (
            <button key={item.id} type="button" className="block w-full break-words rounded-lg px-2 py-2 text-left text-sm hover:bg-[color:var(--portal-soft)]" disabled={busy} onClick={() => void open(item.id)}>
              {item.filename} · {accountOptions.find((a) => a.value === item.account_id)?.label || 'Account unavailable'} · <span className="tabular-nums">{item.period_start} - {item.period_end}</span>
            </button>
          ))
        )}
      </PortalSkeletonTransition>
      {!loadingImports && !importsError && total > statements.length && <p className="text-sm text-[color:var(--portal-muted)]">Showing the most recent {statements.length} of {total} imports.</p>}
    </div>
  </section>
}
