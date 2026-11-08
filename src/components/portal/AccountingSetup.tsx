'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { isAccountingSetupRecord, resolvePendingAccountingSetup, type AccountingSetupKind, type AccountingSetupRecord } from '@/lib/luxorAccountingSetup'

const inputClass = 'portal-input w-full'
const buttonClass = 'inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50'
const labels: Record<AccountingSetupKind, string> = { basis: 'Cash-basis intent', account: 'Account', mapping: 'Account mapping', opening_balance: 'Opening balance' }
const names: Record<string, string> = { name: 'Name', classification: 'Classification', number: 'Number', description: 'Description', basis: 'Basis', notes: 'Notes', source: 'Source', source_name: 'Expense category', account_id: 'Account', as_of: 'As of', amount: 'Amount', currency: 'Currency', side: 'Side' }
const SETUP_WRITES_AVAILABLE = false
type PendingSetupRequest = { id: string; payload: string; draftId: string | null; uncertain: boolean; formRevision: number; clearForm: boolean }

/** Embeddable setup panel; caller owns placement and determines edit access. */
export function AccountingSetup({ canEdit = false, onRecordsChange }: { canEdit?: boolean; onRecordsChange?: (records: AccountingSetupRecord[] | null) => void }) {
  const [records, setRecords] = useState<AccountingSetupRecord[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [kind, setKind] = useState<AccountingSetupKind>('basis')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const pending = useRef<PendingSetupRequest | null>(null)
  const inFlight = useRef(false)
  const formRevision = useRef(0)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/portal/accounting-setup', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.records) || !data.records.every(isAccountingSetupRecord) || !Array.isArray(data.categories) || !data.categories.every((c: unknown) => c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string' && typeof (c as { name?: unknown }).name === 'string')) throw new Error('Accounting setup is unavailable or contains incompatible records. Please refresh or contact support.')
      setRecords(data.records); setCategories(data.categories); setReady(true); onRecordsChange?.(data.records)
      const request = pending.current
      const resolved = request && resolvePendingAccountingSetup(data.records, request)
      if (resolved) {
        if (request?.clearForm && request.formRevision === formRevision.current) setDetails({})
        pending.current = null; setLocked(false); setError(''); setNotice(resolved === 'own' ? 'The saved request was found in history.' : 'This draft was confirmed by another request. Review the saved choice below.')
      }
      else if (!pending.current) { setError(''); setLocked(false) }
    } catch (e) { setReady(false); onRecordsChange?.(null); setError(e instanceof Error ? e.message : 'Unable to load setup.') }
    finally { setLoading(false) }
  }, [onRecordsChange])
  useEffect(() => { void load() }, [load])
  const accounts = records.filter((r) => r.kind === 'account' && r.status === 'confirmed')
  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.details.name} (${a.details.classification})` }))
  const confirmedDrafts = new Set(records.filter((r) => r.status === 'confirmed').map((r) => r.draft_id))
  const update = (field: string, value: string) => { formRevision.current += 1; setDetails((current) => ({ ...current, [field]: value })) }
  const perform = async (request: PendingSetupRequest) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/portal/accounting-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.payload })
      const data = await response.json()
      if (!response.ok) {
        if (response.status >= 500 || response.status === 409 || request.uncertain) { request.uncertain = true; setLocked(true) }
        else { pending.current = null; setLocked(false) }
        setError(data.error || 'Unable to save setup.')
        return
      }
      if (data.id !== request.id) throw new Error('The saved request could not be verified.')
      pending.current = null; setLocked(false)
      if (request.clearForm && request.formRevision === formRevision.current) setDetails({})
      await load(); setNotice('Choice saved.')
    } catch { request.uncertain = true; setLocked(true); setError('The save outcome is uncertain. Retry the same request or refresh the history before leaving this page.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = async (body: Record<string, unknown>) => {
    if (pending.current || inFlight.current) return
    const id = crypto.randomUUID(), request = { id, payload: JSON.stringify({ ...body, request_id: id }), draftId: body.action === 'confirm' && typeof body.draft_id === 'string' ? body.draft_id : null, uncertain: false, formRevision: formRevision.current, clearForm: body.action === 'draft' }
    pending.current = request
    await perform(request)
  }
  const field = (key: string, label: string, placeholder = '') => <label className="block text-sm font-semibold text-[color:var(--portal-text)]">{label}<input className={`${inputClass} mt-1`} value={details[key] || ''} placeholder={placeholder} onChange={(e) => update(key, e.target.value)} /></label>
  return <section className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-[color:var(--portal-text)]">
    <h2 className="text-base font-bold sm:text-lg">Accounting setup</h2>
    <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Confirmed choices remain in the history; a later choice does not automatically replace an earlier one. These records do not post transactions, establish a verified bank balance, or produce financial statements. Ask your accountant to review classifications and opening balances.</p>
    {canEdit && !SETUP_WRITES_AVAILABLE && <p className="text-sm text-[color:var(--portal-muted)]">Saving setup changes is unavailable until secure user identity is verified.</p>}
    {error && <div role="alert" className="space-x-2 text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="underline" disabled={busy} onClick={() => void load()}>Refresh history</button>{locked && pending.current && <button type="button" className="underline" disabled={busy} onClick={() => pending.current && void perform(pending.current)}>Retry same request</button>}</div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p className="text-sm text-[color:var(--portal-muted)]">Loading setup…</p> : ready ? <>
      {canEdit && SETUP_WRITES_AVAILABLE && <fieldset disabled={busy || locked} className="space-y-3 border-t border-[color:var(--portal-border)] pt-4 disabled:opacity-70">
        <PortalSelect aria-label="Setup item" value={kind} onChange={(v) => { formRevision.current += 1; setKind(v as AccountingSetupKind); setDetails({}) }} disabled={busy || locked} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} />
        {kind === 'basis' && <><p className="text-sm">Record an intention to use cash basis. The exact treatment still needs accountant review.</p><PortalSelect aria-label="Accounting basis" value={details.basis || ''} onChange={(v) => update('basis', v)} placeholder="Choose basis" options={[{ value: 'cash', label: 'Cash basis' }]} />{field('notes', 'Notes (optional)')}</>}
        {kind === 'account' && <>{field('name', 'Account name')}<PortalSelect aria-label="Account classification" value={details.classification || ''} onChange={(v) => update('classification', v)} placeholder="Choose classification" options={['asset', 'liability', 'equity', 'income', 'expense'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />{field('number', 'Account number (optional)')}{field('description', 'Description (optional)')}</>}
        {(kind === 'mapping' || kind === 'opening_balance') && <><PortalSelect aria-label="Confirmed account" value={details.account_id || ''} onChange={(v) => update('account_id', v)} placeholder="Choose a confirmed account" options={accountOptions} />{!accounts.length && <p className="text-sm text-[color:var(--portal-muted)]">Save and confirm an account first.</p>}</>}
        {kind === 'mapping' && <><PortalSelect aria-label="Expense category" value={details.source_id || ''} onChange={(v) => { formRevision.current += 1; setDetails((current) => ({ ...current, source_type: 'expense_category', source_id: v, source_name: categories.find((category) => category.id === v)?.name || '' })) }} disabled={busy || locked} placeholder="Choose an expense category" options={categories.map((category) => ({ value: category.id, label: category.name }))} />{field('notes', 'Notes (optional)')}<p className="text-sm text-[color:var(--portal-muted)]">This records a proposed mapping for review; it does not automatically classify transactions.</p></>}
        {kind === 'opening_balance' && <><div><span className="text-sm font-semibold">Opening date</span><PortalDatePicker value={details.as_of || ''} onChange={(v) => update('as_of', v)} /></div>{field('amount', 'Amount', '0.00')}<PortalSelect aria-label="Balance currency" value={details.currency || ''} onChange={(v) => update('currency', v)} placeholder="Choose currency" options={[{ value: 'USD', label: 'US dollars (USD)' }]} /><PortalSelect aria-label="Balance side" value={details.side || ''} onChange={(v) => update('side', v)} placeholder="Choose debit or credit" options={[{ value: 'debit', label: 'Debit' }, { value: 'credit', label: 'Credit' }]} />{field('source', 'Source or explanation', 'Statement or accountant-provided record')}</>}
        <button type="button" disabled={busy || locked} className={buttonClass} onClick={() => void submit({ action: 'draft', kind, details })}>Save draft</button>
      </fieldset>}
      <div className="space-y-3 border-t border-[color:var(--portal-border)] pt-4"><h3 className="font-bold">Saved choices</h3>
        {!records.length && <p className="text-sm text-[color:var(--portal-muted)]">No setup choices saved yet.</p>}
        {records.filter((r) => r.status === 'confirmed' || !confirmedDrafts.has(r.id)).map((r) => <article key={r.id} className="border-b border-[color:var(--portal-border)] pb-3 text-sm"><div className="font-semibold">{labels[r.kind]} · {r.status === 'confirmed' ? 'Confirmed' : 'Draft'}</div>
          <dl className="mt-1 space-y-1 text-[color:var(--portal-muted)]">{Object.entries(r.details).filter(([key, v]) => v && key !== 'source_id' && key !== 'source_type').map(([key, value]) => <div key={key}><dt className="inline">{names[key] || key}: </dt><dd className="inline break-words">{key === 'account_id' ? accounts.find((a) => a.id === value)?.details.name || value : value}</dd></div>)}</dl>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{r.created_by} · {new Date(r.created_at).toLocaleString()}</p>
          {canEdit && SETUP_WRITES_AVAILABLE && r.status === 'draft' && <button type="button" className={`${buttonClass} mt-2`} disabled={busy || locked} onClick={() => void submit({ action: 'confirm', draft_id: r.id, confirm: true })}>Confirm this choice</button>}
        </article>)}
      </div>
    </> : null}
  </section>
}
