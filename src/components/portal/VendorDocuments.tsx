'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { createVendorRefreshFence } from '@/lib/luxorVendorRefreshFence'

type Doc = { id: string; file_name: string; kind: string; created_at: string }
type Pending = { id: string; name: string; size: number; kind: string }
export default function VendorDocuments({ vendorId, archived }: { vendorId: string; archived: boolean }) {
  const [documents, setDocuments] = useState<Doc[] | null>(null)
  const [incomplete, setIncomplete] = useState<Pending[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState('contract')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fence = useRef(createVendorRefreshFence())
  const storageKey = `luxor-vendor-upload:${vendorId}`
  useEffect(() => { try { const raw = sessionStorage.getItem(storageKey); if (raw) { const item = JSON.parse(raw) as Pending; if (typeof item.id === 'string' && typeof item.name === 'string' && typeof item.size === 'number' && typeof item.kind === 'string') setPending(item) } } catch {} }, [storageKey])
  const refresh = useCallback(async () => {
    const generation = fence.current.begin()
    try { const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Documents unavailable.'); if (!Array.isArray(body.documents)) throw new Error('Documents unavailable.'); if (!fence.current.isCurrent(generation)) return; setDocuments(body.documents); setUnavailable(body.unavailable === true); setIncomplete(Array.isArray(body.pendingUploads) ? body.pendingUploads.map((item: { id: string; file_name: string; size_bytes: number; kind: string }) => ({ id: item.id, name: item.file_name, size: item.size_bytes, kind: item.kind })) : []); setError('') }
    catch (cause) { if (!fence.current.isCurrent(generation)) return; setDocuments(null); setError(cause instanceof Error ? cause.message : 'Documents unavailable.') }
  }, [vendorId])
  useEffect(() => { const activeFence = fence.current; void refresh(); return () => activeFence.invalidate() }, [refresh])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !confirmed) { setError('Choose a document and confirm it contains no tax or government identification numbers.'); return }
    if (pending && file.size !== pending.size) { setError('Reselect the same document to retry this upload.'); return }
    const intent = pending || { id: crypto.randomUUID(), name: file.name, size: file.size, kind }
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)) } catch { setError('This browser cannot retain the request for a safe retry.'); return }
    setPending(intent); setBusy(true); setError('')
    try {
      const form = new FormData(); form.set('request_id', intent.id); form.set('file', file); form.set('kind', intent.kind); form.set('no_tax_identifiers', 'true')
      const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents`, { method: 'POST', body: form }); const body = await response.json()
      if (!response.ok) {
        if (body.unavailable === true) {
          setUnavailable(true)
          setPending(null)
          sessionStorage.removeItem(storageKey)
        } else if (response.status < 500 && response.status !== 409) {
          setPending(null)
          sessionStorage.removeItem(storageKey)
        }
        throw new Error(body.error || 'Document could not be uploaded.')
      }
      setPending(null); sessionStorage.removeItem(storageKey); setFile(null); setConfirmed(false); if (inputRef.current) inputRef.current.value = ''; await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Document upload could not be confirmed. Retry the same upload.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Vendor documents</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Private documents attached directly to this vendor. Source invoices and expense receipts appear with their bills below.</p>{archived ? <p className="mt-2 text-xs text-[color:var(--portal-muted)]">An upload started before archival may still finish afterward. New uploads require restoring the vendor.</p> : null}{error ? <p role="alert" className="mt-3 text-xs text-[color:var(--portal-text)]">{error}</p> : null}{documents === null ? <PortalButton size="sm" className="mt-3" onClick={() => void refresh()}>Reload documents</PortalButton> : <><PortalButton size="sm" className="mt-3" disabled={busy} onClick={() => void refresh()}>Reload documents</PortalButton><ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="text-[color:var(--portal-text)]">{document.file_name}<span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{document.kind} · {document.created_at.slice(0, 10)}</span></span><a href={`/api/portal/vendor-profile/${encodeURIComponent(vendorId)}/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer" className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open</a></li>)}</ul>{unavailable ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Vendor documents are not stored yet. Invoices and receipts already linked to a bill or expense stay with that record.</p> : !documents.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No vendor documents uploaded.</p> : null}{incomplete.length ? <div className="mt-3 space-y-2"><p className="text-xs text-[color:var(--portal-muted)]">Uploads awaiting confirmation may already be complete. Reload documents, or resume using the original file.</p>{incomplete.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--portal-text)]"><span>{item.name}</span><PortalButton size="sm" disabled={busy} onClick={() => { setPending(item); setFile(null); setConfirmed(false); if (inputRef.current) inputRef.current.value = ''; try { sessionStorage.setItem(storageKey, JSON.stringify(item)) } catch { setError('This browser cannot retain the request for retry.') } }}>{archived ? 'Recover document' : 'Resume upload'}</PortalButton></div>)}</div> : null}
    {unavailable ? null : !archived || pending ? <form onSubmit={submit} className="mt-4 space-y-3 border-t border-[color:var(--portal-border)] pt-4"><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{archived ? 'Recovery after archival requires the stored document. If it has not reached storage, restore the vendor before retrying; an earlier upload may still be in progress.' : 'PDF, JPG, or PNG up to 20 MB. Tax forms and documents containing tax or government identification numbers are not supported.'}</p><PortalSelect aria-label="Document type" value={pending?.kind || kind} onChange={setKind} disabled={busy || Boolean(pending)} options={[{ value: 'contract', label: 'Contract' }, { value: 'other', label: 'Other supporting document' }]} buttonClassName="min-h-10 w-full sm:max-w-sm" />{pending ? <div className="space-y-2"><p className="text-xs text-[color:var(--portal-muted)]">Reselect {pending.name} to retry the saved upload request.</p><PortalButton size="sm" disabled={busy} onClick={() => { setPending(null); sessionStorage.removeItem(storageKey); void refresh() }}>Choose another upload</PortalButton></div> : null}<label className="block text-xs text-[color:var(--portal-text)]">Choose document<input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-[color:var(--portal-muted)]" /></label><label className="flex items-start gap-2 text-xs text-[color:var(--portal-text)]"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm this document contains no tax or government identification numbers.</span></label><PortalButton type="submit" size="sm" disabled={busy}>{busy ? 'Uploading…' : pending ? 'Retry same upload' : 'Upload document'}</PortalButton></form> : <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Restore this vendor before adding documents.</p>}</>}
  </section>
}
