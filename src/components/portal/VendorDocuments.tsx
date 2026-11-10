'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, Folder } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalConstellationLoader } from '@/components/portal/PortalUI'
import { createVendorRefreshFence } from '@/lib/luxorVendorRefreshFence'

type Doc = { id: string; file_name: string; kind: string; created_at: string; scan_metadata?: { contract_end_date?: string | null } | null }
type Pending = { id: string; name: string; size: number; kind?: string }
type Assessment = { kind: 'bill' | 'contract' | 'other' | 'uncertain'; sensitive: string; contractEndDate: string | null }
export default function VendorDocuments({ vendorId, archived, onOpenBill }: { vendorId: string; archived: boolean; onOpenBill?: (billId: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ contract: true, other: true })
  const [documents, setDocuments] = useState<Doc[] | null>(null)
  const [incomplete, setIncomplete] = useState<Pending[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [billRequest, setBillRequest] = useState<string | null>(null)
  const [billResult, setBillResult] = useState<{ status: string; billId: string | null } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [choice, setChoice] = useState<{ assessment: Assessment; ticket: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [analysisAvailable, setAnalysisAvailable] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const fence = useRef(createVendorRefreshFence())
  const storageKey = `luxor-vendor-upload:${vendorId}`
  const billStorageKey = `${storageKey}:bill-status`
  useEffect(() => { try { const id = sessionStorage.getItem(billStorageKey); if (id) setBillRequest(id) } catch {} }, [billStorageKey])
  useEffect(() => {
    if (!billRequest) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents/bill?request_id=${encodeURIComponent(billRequest)}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error('Bill status is temporarily unavailable.')
        if (!alive) return
        const result = body.intake
        if (result && ['duplicate', 'ready', 'needs_review', 'ignored'].includes(result.status)) {
          setBillResult({ status: result.status, billId: result.duplicate_of_bill_id || result.bill_id || null }); setBillRequest(null); try { sessionStorage.removeItem(billStorageKey) } catch {}
          setStatus(result.status === 'duplicate' ? 'Possible duplicate found in Bills. Review the existing bill.' : result.status === 'ignored' ? 'Bill analysis needs attention in Bills.' : 'Bill added to Bills for review. Its provider still needs to be confirmed there.')
          return
        }
        setStatus(result?.status === 'failed' ? 'Analysis will retry. Check Bills for status.' : 'Analyzing the bill and checking for duplicates…')
      } catch { if (alive) setStatus('Bill queued. Status is temporarily unavailable; check Bills.') }
      if (alive) timer = setTimeout(poll, 3000)
    }
    void poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [billRequest, billStorageKey, vendorId])
  useEffect(() => { try { const raw = sessionStorage.getItem(storageKey); if (raw) { const item = JSON.parse(raw) as Pending; if (typeof item.id === 'string' && typeof item.name === 'string' && typeof item.size === 'number') setPending(item) } } catch {} }, [storageKey])
  const refresh = useCallback(async () => {
    const generation = fence.current.begin()
    try { const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok || !Array.isArray(body.documents)) throw new Error('Documents unavailable.'); if (!fence.current.isCurrent(generation)) return; setDocuments(body.documents); setUnavailable(body.unavailable === true); setAnalysisAvailable(body.analysisAvailable === true); setIncomplete(Array.isArray(body.pendingUploads) ? body.pendingUploads.map((item: { id: string; file_name: string; size_bytes: number; kind: string }) => ({ id: item.id, name: item.file_name, size: item.size_bytes, kind: item.kind })) : []) }
    catch (cause) { if (fence.current.isCurrent(generation)) { setDocuments(null); setError(cause instanceof Error ? cause.message : 'Documents unavailable.') } }
  }, [vendorId])
  useEffect(() => { const activeFence = fence.current; void refresh(); return () => activeFence.invalidate() }, [refresh])
  function clearPending() { setPending(null); setFile(null); setChoice(null); try { sessionStorage.removeItem(storageKey) } catch {} if (inputRef.current) inputRef.current.value = '' }
  async function saveDocument(selected: File, intent: Pending, ticket: string, kind: 'bill' | 'contract' | 'other') {
    setChoice(null); setStatus(kind === 'bill' ? 'Adding bill for review…' : 'Saving document…')
    const committedIntent = { ...intent, kind }
    sessionStorage.setItem(storageKey, JSON.stringify(committedIntent))
    setPending(committedIntent)
    const form = new FormData(); form.set('request_id', intent.id); form.set('file', selected); form.set('analysis_ticket', ticket); form.set('kind', kind)
    const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents${kind === 'bill' ? '/bill' : ''}`, { method: 'POST', body: form })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'The upload could not be confirmed. Retry the same document.')
    if (kind === 'bill') {
      setBillResult(null); try { sessionStorage.setItem(billStorageKey, intent.id) } catch {} setBillRequest(intent.id); setStatus('Analyzing the bill and checking for duplicates…')
    } else { setStatus(kind === 'contract' ? 'Contract saved.' : 'Document saved.'); await refresh() }
    clearPending()
  }
  async function start(selected: File, resume?: Pending) {
    if (busyRef.current || archived && !resume) return
    if (billRequest) { setError('Wait for the current bill analysis before uploading another document.'); return }
    if (resume && (selected.name !== resume.name || selected.size !== resume.size)) { setError('Choose the same file to retry this upload.'); return }
    const intent = resume || { id: crypto.randomUUID(), name: selected.name, size: selected.size }
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)) } catch { setError('This browser cannot retain the upload for a safe retry.'); return }
    setPending(intent); setFile(selected); setChoice(null); setError(''); setStatus('Analyzing document…'); busyRef.current = true; setBusy(true)
    try {
      const form = new FormData(); form.set('file', selected)
      const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents/analyze`, { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) { if (response.status === 422) clearPending(); throw new Error(result.message || result.error || 'Document analysis failed.') }
      if (!result.ticket || !result.assessment) throw new Error('Document analysis could not be verified.')
      if (intent.kind && result.assessment.kind !== 'uncertain' && result.assessment.kind !== intent.kind) throw new Error('This upload was already started for a different document type. Retry later or review the existing upload in Bills or Documents.')
      if (intent.kind && result.assessment.kind === 'uncertain' && ['bill', 'contract', 'other'].includes(intent.kind)) { await saveDocument(selected, intent, result.ticket, intent.kind as 'bill' | 'contract' | 'other'); return }
      if (result.assessment.kind === 'uncertain') { setChoice(result); setStatus('Choose the type of document.'); return }
      await saveDocument(selected, intent, result.ticket, result.assessment.kind)
    } catch (cause) { setStatus(''); setError(cause instanceof Error ? cause.message : 'Document upload failed.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function choose(kind: 'bill' | 'contract' | 'other') {
    if (!file || !pending || !choice || busyRef.current) return
    setError(''); busyRef.current = true; setBusy(true)
    try { await saveDocument(file, pending, choice.ticket, kind) } catch (cause) { setStatus(''); setError(cause instanceof Error ? cause.message : 'Document upload failed.') } finally { busyRef.current = false; setBusy(false) }
  }
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Documents</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Contracts and other documents for this provider.</p>
    {error ? <p role="alert" className="mt-3 text-xs leading-5 text-[color:var(--portal-text)]">{error}</p> : null}
    {documents === null ? <PortalButton size="sm" className="mt-3" onClick={() => void refresh()}>Try again</PortalButton> : <><div className="mt-4 divide-y divide-[color:var(--portal-border)]">{(['contract', 'other'] as const).map((group) => {
      const items = documents.filter((document) => document.kind === group); if (!items.length) return null; const open = expanded[group]
      return <div key={group}><button type="button" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [group]: !current[group] }))} className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><Folder size={18} className="text-[#9a712e] dark:text-[#e6c77f]" /><span className="flex-1">{group === 'contract' ? 'Contracts' : 'Other documents'}</span><span className="text-xs font-normal tabular-nums text-[color:var(--portal-muted)]">{items.length}</span><ChevronDown size={16} className={`text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button><div className="grid transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none" style={{ gridTemplateRows: open ? '1fr' : '0fr' }} inert={!open} aria-hidden={!open}><div className="min-h-0 overflow-hidden"><ul className="pb-2">{items.map((document) => <li key={document.id}><a href={`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><FileText size={17} className="shrink-0 text-[color:var(--portal-muted)]" /><span className="min-w-0 flex-1 text-[color:var(--portal-text)]"><span className="block truncate">{document.file_name}</span>{document.kind === 'contract' && document.scan_metadata?.contract_end_date ? <span className="mt-1 block text-xs text-[color:var(--portal-muted)]">Possible end date: {document.scan_metadata.contract_end_date} · verify in document</span> : null}</span><span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">{document.created_at.slice(0, 10)}</span></a></li>)}</ul></div></div></div>
    })}</div>{unavailable ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Document storage is unavailable.</p> : !documents.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No documents yet.</p> : null}
    {incomplete.filter((item) => item.id !== pending?.id).map((item) => <div key={item.id} className="mt-3 flex items-center gap-2 text-xs"><span>{item.name}</span><PortalButton size="sm" disabled={busy} onClick={() => { setPending(item); setFile(null); setError(''); setStatus('Choose the original document to resume.'); try { sessionStorage.setItem(storageKey, JSON.stringify(item)) } catch { setError('This browser cannot retain the upload for retry.') } }}>Resume upload</PortalButton></div>)}
    {choice ? <div className="mt-4 space-y-2 rounded-xl bg-[color:var(--portal-soft)] p-4"><p className="text-sm font-semibold text-[color:var(--portal-text)]">What kind of document is this?</p><p className="text-xs text-[color:var(--portal-muted)]">We could not determine the type from {file?.name}.</p><div className="flex flex-wrap gap-2"><PortalButton size="sm" onClick={() => void choose('bill')}>Bill</PortalButton><PortalButton size="sm" onClick={() => void choose('contract')}>Contract</PortalButton><PortalButton size="sm" onClick={() => void choose('other')}>Other</PortalButton><PortalButton size="sm" onClick={() => { clearPending(); setStatus('') }}>Cancel</PortalButton></div></div> : null}
    {!unavailable && !analysisAvailable ? <p role="status" className="mt-4 text-sm text-[color:var(--portal-muted)]">Document analysis is not available yet.</p> : null}
    {!unavailable && analysisAvailable && (!archived || pending) && !choice ? <div onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (busy) return; if (event.dataTransfer.files.length !== 1) { setError('Choose one document at a time.'); return } void start(event.dataTransfer.files[0], pending || undefined) }} className={`mt-4 rounded-xl border border-dashed focus-within:ring-2 focus-within:ring-[#caa24c]/40 ${dragging ? 'border-[#caa24c] bg-[#caa24c]/10' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'}`}><label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 px-4 py-4 text-center text-sm text-[color:var(--portal-text)]">{busy ? <><PortalConstellationLoader size={20} /><span className="elena-working-shimmer">{status}</span></> : <><FileText size={20} className="text-[#9a712e] dark:text-[#e6c77f]" /><span>{pending ? `Choose ${pending.name} to retry` : 'Drag a document here or click to upload'}</span><span className="text-xs text-[color:var(--portal-muted)]">PDF, JPG or PNG · up to 20 MB</span></>}<input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void start(selected, pending || undefined) }} className="sr-only" /></label></div> : null}
    {pending && !busy && !choice ? <button type="button" onClick={() => { clearPending(); setStatus(''); setError('') }} className="mt-2 min-h-10 text-xs font-semibold text-[color:var(--portal-muted)]">Choose a different document</button> : null}
    {!busy && status ? <p role="status" className="mt-3 flex items-center gap-2 text-xs leading-5 text-[color:var(--portal-muted)]">{billRequest ? <PortalConstellationLoader size={14} /> : null}<span className={billRequest ? 'elena-working-shimmer' : ''}>{status}</span></p> : null}{billResult?.billId && onOpenBill ? <button type="button" onClick={() => onOpenBill(billResult.billId!)} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Review {billResult.status === 'duplicate' ? 'existing bill' : 'bill'} →</button> : billResult?.billId ? <a href={`/portal/finances?view=bill-review&bill=${encodeURIComponent(billResult.billId)}`} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Review {billResult.status === 'duplicate' ? 'existing bill' : 'bill'} →</a> : null}</>}
  </section>
}
