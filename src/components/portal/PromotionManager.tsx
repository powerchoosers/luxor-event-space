'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RefreshCw, Tag } from 'lucide-react'
import { PortalButton, PortalModal, PortalSelect, PortalSkeleton, PortalTableCard } from '@/components/portal/PortalUI'
import type { LuxorPromotion } from '@/lib/luxorInquiryTypes'

type PromotionDraft = {
  id?: string
  name: string
  discount_type: LuxorPromotion['discount_type']
  value: string
  active: boolean
}

const EMPTY_DRAFT: PromotionDraft = {
  name: '',
  discount_type: 'percent',
  value: '',
  active: true,
}

function formatPromotion(promotion: Pick<LuxorPromotion, 'discount_type' | 'value'>) {
  return promotion.discount_type === 'percent'
    ? `${promotion.value}% off`
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(promotion.value) + ' off'
}

export function PromotionManager() {
  const [promotions, setPromotions] = useState<LuxorPromotion[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<PromotionDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const activeCount = useMemo(() => promotions.filter((promotion) => promotion.active).length, [promotions])

  const loadPromotions = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const response = await fetch('/api/portal/promotions', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load promotions.')
      setPromotions(Array.isArray(payload) ? payload : [])
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load promotions.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadPromotions()
  }, [loadPromotions])

  const openCreate = () => setEditor(EMPTY_DRAFT)
  const openEdit = (promotion: LuxorPromotion) => setEditor({
    id: promotion.id,
    name: promotion.name,
    discount_type: promotion.discount_type,
    value: String(promotion.value),
    active: promotion.active,
  })

  const savePromotion = async () => {
    if (!editor) return
    const name = editor.name.trim()
    const value = Number(editor.value)
    if (!name) {
      setError('Give the promotion a name before saving it.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a promotion amount greater than zero.')
      return
    }
    if (editor.discount_type === 'percent' && value > 100) {
      setError('Percentage promotions cannot be more than 100%.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/promotions', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editor.id ? { id: editor.id } : {}),
          name,
          discount_type: editor.discount_type,
          value,
          active: editor.active,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not save promotion.')
      setEditor(null)
      await loadPromotions()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save promotion.')
    } finally {
      setSaving(false)
    }
  }

  const togglePromotion = async (promotion: LuxorPromotion) => {
    const nextActive = !promotion.active
    setPromotions((current) => current.map((candidate) => candidate.id === promotion.id ? { ...candidate, active: nextActive } : candidate))
    try {
      const response = await fetch('/api/portal/promotions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promotion.id, active: nextActive }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not update promotion.')
      setPromotions((current) => current.map((candidate) => candidate.id === promotion.id ? payload : candidate))
    } catch (toggleError) {
      setPromotions((current) => current.map((candidate) => candidate.id === promotion.id ? promotion : candidate))
      setError(toggleError instanceof Error ? toggleError.message : 'Could not update promotion.')
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Saved promotions</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">Create a reusable promotion once, then apply it to any new proposal. Published proposals retain their saved terms even if you later edit or pause the promotion.</p>
        </div>
        <PortalButton variant="primary" onClick={openCreate}><Plus size={14} /> Create promotion</PortalButton>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-200">{error}</div>
      ) : null}

      <PortalTableCard
        className="min-h-0"
        controls={<div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{state === 'ready' ? `${activeCount} active ${activeCount === 1 ? 'promotion' : 'promotions'}` : 'Promotion library'}</span><PortalButton variant="ghost" size="sm" onClick={() => void loadPromotions()} disabled={state === 'loading'}><RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh</PortalButton></div>}
      >
        {state === 'loading' ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading saved promotions">
            <PortalSkeleton className="h-12 w-full rounded-xl" />
            <PortalSkeleton className="h-12 w-full rounded-xl" />
            <PortalSkeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#9a712d] dark:text-[#e4c16d]"><Tag size={18} /></span>
            <p className="text-sm font-semibold text-[color:var(--portal-text)]">No saved promotions yet</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--portal-muted)]">Create one here or from a proposal. The same approved terms will be available across future proposals.</p>
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--portal-border)]">
            {promotions.map((promotion) => (
              <article key={promotion.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-bold text-[color:var(--portal-text)]">{promotion.name}</h4>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${promotion.active ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>{promotion.active ? 'Active' : 'Paused'}</span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{formatPromotion(promotion)} <span className="text-[color:var(--portal-faint)]">· {promotion.code}</span></p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <PortalButton variant="secondary" size="sm" onClick={() => openEdit(promotion)}><Edit3 size={12} /> Edit</PortalButton>
                  <PortalButton variant={promotion.active ? 'ghost' : 'secondary'} size="sm" onClick={() => void togglePromotion(promotion)}>{promotion.active ? 'Pause' : 'Activate'}</PortalButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </PortalTableCard>

      <PortalModal
        isOpen={Boolean(editor)}
        onClose={() => !saving && setEditor(null)}
        title={editor?.id ? 'Edit promotion' : 'Create promotion'}
        description="Saved promotions are reusable. A published proposal keeps the exact terms selected when it was finalized."
        maxWidth="max-w-md"
      >
        {editor ? (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Promotion name</span>
              <input autoFocus value={editor.name} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Spring celebration" className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10" />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <label className="block space-y-1.5">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Discount type</span>
                <PortalSelect value={editor.discount_type} onChange={(value) => setEditor((current) => current ? { ...current, discount_type: value as LuxorPromotion['discount_type'] } : current)} options={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]} />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{editor.discount_type === 'percent' ? 'Percent off' : 'Amount off'}</span>
                <input inputMode="decimal" value={editor.value} onChange={(event) => setEditor((current) => current ? { ...current, value: event.target.value } : current)} placeholder={editor.discount_type === 'percent' ? '10' : '250'} className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm font-semibold text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10" />
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-3 text-sm text-[color:var(--portal-text)]">
              <input type="checkbox" checked={editor.active} onChange={(event) => setEditor((current) => current ? { ...current, active: event.target.checked } : current)} className="h-4 w-4 accent-[#caa24c]" />
              <span><span className="block font-semibold">Available on new proposals</span><span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">Pause it later without changing proposals already sent.</span></span>
            </label>
            <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
              <PortalButton variant="ghost" onClick={() => setEditor(null)} disabled={saving}>Cancel</PortalButton>
              <PortalButton variant="primary" onClick={() => void savePromotion()} disabled={saving}>{saving ? 'Saving…' : editor.id ? 'Save changes' : 'Create promotion'}</PortalButton>
            </div>
          </div>
        ) : null}
      </PortalModal>
    </section>
  )
}
