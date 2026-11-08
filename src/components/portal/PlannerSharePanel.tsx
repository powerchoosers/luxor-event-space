/* eslint-disable @typescript-eslint/no-explicit-any -- portal JSON payloads are rendered from validated server rows. */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Share2, XCircle } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'

type Row = Record<string, any> & { id: string }
export function PlannerSharePanel({ bookingId, designs, files }: { bookingId: string; designs: Row[]; files: Row[] }) {
  const [items, setItems] = useState<Row[]>([])
  const [designId, setDesignId] = useState('')
  const [revision, setRevision] = useState('')
  const [history, setHistory] = useState<Row[]>([])
  const [historyBefore, setHistoryBefore] = useState<number | null>(null)
  const [historyMore, setHistoryMore] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [pendingPresentationId, setPendingPresentationId] = useState('')
  const [message, setMessage] = useState('')
  const [canShare, setCanShare] = useState(false)
  const design = designs.find(item => item.id === designId)
  const selectedRevision = Number(revision || design?.revision || 1)
  const revisionSnapshot = history.find(item => Number(item.revision) === selectedRevision)?.snapshot
  const images = useMemo(() => {
    const source = selectedRevision === Number(design?.revision || 1)
      ? files.filter(file => file.design_id === designId && file.category !== 'design_revision_snapshot').map(file => ({ ...file, source_file_id: file.id }))
      : Array.isArray(revisionSnapshot?.assets) ? revisionSnapshot.assets : []
    return source.filter((file: Row) => ['image/jpeg','image/png','image/webp'].includes(String(file.content_type)))
  }, [files, designId, design?.revision, selectedRevision, revisionSnapshot])
  const load = useCallback(async () => {
    const response = await fetch(`/api/planner/presentations?bookingId=${encodeURIComponent(bookingId)}`, { cache: 'no-store' })
    if (response.status === 403) { setCanShare(false); return }
    const result = await response.json()
    if (response.ok) { setItems(Array.isArray(result.presentations) ? result.presentations : []); setCanShare(true) }
  }, [bookingId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!designId) { setHistory([]); setHistoryMore(false); setHistoryBefore(null); return }
    let live = true
    void fetch(`/api/planner?section=design_history&designId=${encodeURIComponent(designId)}`, { cache: 'no-store' }).then(async response => {
      const result = await response.json()
      if (live && response.ok) {
        const rows = Array.isArray(result.revisions) ? result.revisions : []
        setHistory(rows); setHistoryMore(Boolean(result.hasMore)); setHistoryBefore(rows.length ? Number(rows[rows.length - 1].revision) : null)
      }
    }).catch(()=>undefined)
    return () => { live = false }
  }, [designId])
  if (!canShare) return null
  const create = async () => {
    if (!designId) return
    setBusy(true); setMessage('')
    const presentationId = pendingPresentationId || crypto.randomUUID()
    setPendingPresentationId(presentationId)
    try {
      const response = await fetch('/api/planner/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId, bookingId, designId, revision: selectedRevision, fileIds: selected, expiresInDays: Number(days) }) })
      const result = await response.json()
      if (response.status === 202 && result.state === 'preparing') {
        const wait = Math.max(1, Number(result.retryAfterSeconds) || 15)
        setMessage(`Selected images are still being prepared. Retry in about ${wait} seconds to resume the same presentation.`)
        return
      }
      if (!response.ok) {
        if (response.status === 409) setPendingPresentationId('')
        throw new Error(result.error || 'Could not create presentation.')
      }
      setPendingPresentationId('')
      setMessage('Private invitation queued for the client email on this event. They will need a verification code to view it.')
      setSelected([]); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create presentation.') }
    finally { setBusy(false) }
  }
  const revoke = async (id: string) => {
    const response = await fetch(`/api/planner/presentations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (response.ok) await load()
    else setMessage('The presentation could not be revoked.')
  }
  return <section className="rounded-2xl border border-[#caa24c]/25 bg-[color:var(--portal-card)] p-4 sm:p-5">
    <div className="flex items-center gap-2"><Share2 size={16} className="text-[#a17b35]"/><h3 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Share a selected design</h3></div>
    <p className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--portal-muted)]">Only the account owner can send client presentations. Each link freezes one design revision and selected images, expires after 7, 14, or 30 days, and requires an email verification code. Private notes, vendor files, and costs are excluded.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] md:items-end">
      <label className="space-y-1 text-xs font-semibold text-[color:var(--portal-muted)]">Event concept<PortalSelect value={designId} onChange={(value)=>{setDesignId(value);setRevision('');setSelected([])}} options={designs.filter(item=>item.design_kind==='event_concept'&&item.booking_id===bookingId&&!item.archived_at).map(item=>({value:item.id,label:item.name}))} placeholder="Choose concept…"/></label>
      <label className="space-y-1 text-xs font-semibold text-[color:var(--portal-muted)]">Frozen revision<PortalSelect value={revision||String(design?.revision||1)} onChange={(value)=>{setRevision(value);setSelected([])}} options={design?[{value:String(design.revision||1),label:`Current · revision ${design.revision||1}`},...history.filter(item=>Number(item.revision)!==Number(design.revision||1)).map(item=>({value:String(item.revision),label:`Revision ${item.revision}`}))]:[]} placeholder="Choose revision…"/>{historyMore&&designId?<button type="button" className="mt-1 text-[10px] font-semibold text-[#a17b35]" onClick={async()=>{if(historyBefore===null)return;const response=await fetch(`/api/planner?section=design_history&designId=${encodeURIComponent(designId)}&before=${historyBefore}`,{cache:'no-store'});const result=await response.json();if(response.ok){const rows=Array.isArray(result.revisions)?result.revisions:[];setHistory(current=>[...current,...rows]);setHistoryMore(Boolean(result.hasMore));setHistoryBefore(rows.length?Number(rows[rows.length-1].revision):null)}}}>Load older revisions</button>:null}</label>
      <label className="space-y-1 text-xs font-semibold text-[color:var(--portal-muted)]">Link expires<PortalSelect value={days} onChange={setDays} options={[7,14,30].map(value=>({value:String(value),label:`${value} days`}))}/></label>
      <div className="text-xs text-[color:var(--portal-muted)]">Revision {design?selectedRevision:'—'}<br/>Frozen at send time</div>
      <PortalButton variant="primary" onClick={()=>void create()} disabled={!designId||busy}>{busy?<Loader2 size={14} className="animate-spin"/>:<Share2 size={14}/>}Create &amp; send</PortalButton>
    </div>
    {designId?<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{images.map((file:Row)=><label key={String(file.source_file_id||file.id)} className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs text-[color:var(--portal-text)]"><input type="checkbox" checked={selected.includes(String(file.source_file_id||file.id))} onChange={event=>setSelected(current=>event.target.checked?[...current,String(file.source_file_id||file.id)]:current.filter(id=>id!==String(file.source_file_id||file.id)))}/><span className="truncate">{file.title||file.file_name}</span></label>)}{!images.length?<p className="text-xs text-[color:var(--portal-muted)]">No images were attached to this revision. The design can still be shared.</p>:null}</div>:null}
    {message?<p role="status" className="mt-3 text-xs text-[color:var(--portal-muted)]">{message}</p>:null}
    {items.length?<div className="mt-4 space-y-2 border-t border-[color:var(--portal-border)] pt-3"><p className="text-xs font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">Client presentations</p>{items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--portal-soft)] px-3 py-2 text-xs"><span className="text-[color:var(--portal-text)]">Revision {item.design_revision} · {item.client_action==='approved'?'Client approved this revision':item.client_action==='feedback'?'Client left feedback':item.revoked_at?'Revoked':item.lifecycle_status==='preparing'?'Preparing selected images':item.lifecycle_status==='ready'?'Invitation pending':item.sent_at?'Invitation sent':item.lifecycle_status==='queued'?'Invitation queued':new Date(item.expires_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</span>{item.client_action==='feedback'&&item.client_note?<span className="max-w-xl text-[color:var(--portal-muted)]">{item.client_note}</span>:null}{!item.revoked_at&&Date.parse(item.expires_at)>Date.now()?<button type="button" onClick={()=>void revoke(item.id)} className="inline-flex items-center gap-1 font-semibold text-red-600"><XCircle size={13}/>Revoke</button>:item.client_action==='approved'?<span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13}/>Response recorded</span>:null}</div>)}</div>:null}
  </section>
}
