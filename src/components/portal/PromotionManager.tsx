'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RefreshCw, Tag } from '@/lib/icons/phosphor-compat'
import {
  PortalButton,
  PortalCheckbox,
  PortalModal,
  PortalSelect,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import { PromotionTermsFields, type PromotionTermsDraft } from './PromotionTermsFields'
import { luxorCalendarDate } from '@/lib/luxorProposalTerms'
import type { LuxorPromotion } from '@/lib/luxorInquiryTypes'

type PromotionDraft = PromotionTermsDraft & {
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

const inputClass =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

function formatPromotion(promotion: Pick<LuxorPromotion, 'discount_type' | 'value'>) {
  if (promotion.discount_type === 'tax_coverage') {
    return 'LUXOR pays applicable sales tax after discounts; signature and initial payment before original-day midnight (Chicago)'
  }
  if (promotion.discount_type === 'complimentary') {
    return `Complimentary · Regular value ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(promotion.value)} · Promotional value $0`
  }
  return promotion.discount_type === 'percent'
    ? `${promotion.value}% off`
    : `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(promotion.value)} off`
}

export function PromotionManager() {
  const [promotions, setPromotions] = useState<LuxorPromotion[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
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

  const openCreate = () => {
    setModalError(null)
    setEditor(EMPTY_DRAFT)
  }

  const openEdit = (promotion: LuxorPromotion) => {
    setModalError(null)
    setEditor({
      ...promotion,
      id: promotion.id,
      name: promotion.name,
      discount_type: promotion.discount_type,
      value: String(promotion.value),
      active: promotion.active,
    })
  }

  const savePromotion = async () => {
    if (!editor) return
    const name = editor.name.trim()
    const value = Number(editor.value)
    if (!name) {
      setModalError('Give the promotion a name before saving it.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setModalError('Enter a promotion amount greater than zero.')
      return
    }
    if (editor.discount_type === 'percent' && value > 100) {
      setModalError('Percentage promotions cannot be more than 100%.')
      return
    }
    if (editor.expirationMode === 'date' && !editor.expires_on) {
      setModalError('Choose an expiration date.')
      return
    }
    if (editor.discount_type === 'complimentary' && !editor.complimentary_item?.trim()) {
      setModalError('Identify the complimentary item or service before saving.')
      return
    }

    setSaving(true)
    setModalError(null)
    try {
      const response = await fetch('/api/portal/promotions', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editor.id ? { id: editor.id } : {}),
          expires_on: editor.expires_on || null,
          complimentary_item: editor.complimentary_item,
          complimentary_item_id: editor.complimentary_item_id,
          complimentary_scope: editor.complimentary_scope || 'vendor',
          name,
          discount_type: editor.discount_type,
          value,
          active: editor.active,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not save promotion.')
      setEditor(null)
      setModalError(null)
      await loadPromotions()
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Could not save promotion.')
    } finally {
      setSaving(false)
    }
  }

  const togglePromotion = async (promotion: LuxorPromotion) => {
    const nextActive = !promotion.active
    setError(null)
    setPromotions((current) =>
      current.map((candidate) => (candidate.id === promotion.id ? { ...candidate, active: nextActive } : candidate)),
    )
    try {
      const response = await fetch('/api/portal/promotions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promotion.id, active: nextActive }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not update promotion.')
      setPromotions((current) =>
        current.map((candidate) => (candidate.id === promotion.id ? payload : candidate)),
      )
    } catch (toggleError) {
      setPromotions((current) =>
        current.map((candidate) => (candidate.id === promotion.id ? promotion : candidate)),
      )
      setError(toggleError instanceof Error ? toggleError.message : 'Could not update promotion.')
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-base font-bold text-[color:var(--portal-text)]">Saved promotions</h3>
          <p className="mt-1 max-w-2xl text-xs text-[color:var(--portal-muted)]">
            Create reusable promotions for new proposals. Sent proposals keep their original terms.
          </p>
        </div>
        <PortalButton variant="primary" onClick={openCreate} className="w-full shrink-0 sm:w-auto">
          <Plus size={14} aria-hidden="true" />
          Create promotion
        </PortalButton>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-6">
          <PortalSkeletonTransition
            loading={state === 'loading' && promotions.length === 0}
            overlap
            skeleton={<PortalSkeleton className="h-4 w-32 rounded" />}
          >
            <span className="text-xs font-semibold tabular-nums text-[color:var(--portal-muted)]">
              {state === 'ready'
                ? `${activeCount} active ${activeCount === 1 ? 'promotion' : 'promotions'}`
                : 'Promotion library'}
            </span>
          </PortalSkeletonTransition>
          <PortalButton variant="ghost" size="sm" onClick={() => void loadPromotions()} disabled={state === 'loading'}>
            <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </PortalButton>
        </div>

        <PortalSkeletonTransition
          loading={state === 'loading' && promotions.length === 0}
          skeleton={
            <div className="divide-y divide-[color:var(--portal-border)]" aria-busy="true" aria-label="Loading saved promotions">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <PortalSkeleton className="h-4 w-40 rounded" />
                      <PortalSkeleton className="h-5 w-14 rounded-md" />
                    </div>
                    <PortalSkeleton className="h-3.5 w-64 max-w-full rounded" />
                  </div>
                  <div className="flex gap-2">
                    <PortalSkeleton className="h-8 w-16 rounded-xl" />
                    <PortalSkeleton className="h-8 w-16 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          {promotions.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#9a712d] dark:text-[#e4c16d]">
                <Tag size={18} aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-[color:var(--portal-text)]">No saved promotions yet</p>
              <p className="mt-1 max-w-sm text-xs text-[color:var(--portal-muted)]">
                Create one here to reuse across new proposals.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--portal-border)]">
              {promotions.map((promotion) => {
                const isExpired = Boolean(promotion.expires_on && promotion.expires_on < luxorCalendarDate())
                const statusText = isExpired ? 'Expired' : promotion.active ? 'Active' : 'Paused'
                const statusTone = isExpired ? 'red' : promotion.active ? 'green' : 'neutral'
                return (
                  <article
                    key={promotion.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-bold text-[color:var(--portal-text)]">{promotion.name}</h4>
                        <PortalStatusBadge borderless tone={statusTone} status={statusText} />
                      </div>
                      <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                        {formatPromotion(promotion)} · {promotion.expires_on ? `Expires ${promotion.expires_on}` : 'No expiration'}{' '}
                        <span className="text-[color:var(--portal-faint)]">· {promotion.code}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {promotion.discount_type !== 'tax_coverage' ? (
                        <PortalButton variant="secondary" size="sm" onClick={() => openEdit(promotion)}>
                          <Edit3 size={12} aria-hidden="true" />
                          Edit
                        </PortalButton>
                      ) : null}
                      <PortalButton variant={promotion.active ? 'ghost' : 'secondary'} size="sm" onClick={() => void togglePromotion(promotion)}>
                        {promotion.active ? 'Pause' : 'Activate'}
                      </PortalButton>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </PortalSkeletonTransition>
      </div>

      <PortalModal
        isOpen={Boolean(editor)}
        onClose={() => {
          if (!saving) {
            setEditor(null)
            setModalError(null)
          }
        }}
        title={editor?.id ? 'Edit promotion' : 'Create promotion'}
        description="Published proposals keep the exact terms saved when sent."
        maxWidth="max-w-md"
      >
        {editor ? (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Promotion name</span>
              <input
                autoFocus
                value={editor.name}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, name: event.target.value } : current))
                }
                placeholder="Spring celebration"
                className={inputClass}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Discount type</span>
                <PortalSelect
                  value={editor.discount_type}
                  onChange={(value) =>
                    setEditor((current) =>
                      current ? { ...current, discount_type: value as LuxorPromotion['discount_type'] } : current,
                    )
                  }
                  options={[
                    { value: 'percent', label: 'Percentage' },
                    { value: 'fixed', label: 'Fixed amount' },
                    { value: 'complimentary', label: 'Complimentary' },
                  ]}
                  buttonClassName="min-h-10"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--portal-muted)]">
                  {editor.discount_type === 'complimentary'
                    ? 'Regular value'
                    : editor.discount_type === 'percent'
                      ? 'Percent off'
                      : 'Amount off'}
                </span>
                <input
                  inputMode="decimal"
                  value={editor.value}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, value: event.target.value } : current))
                  }
                  placeholder={editor.discount_type === 'percent' ? '10' : '250'}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            </div>

            <PromotionTermsFields
              value={editor}
              complimentary={editor.discount_type === 'complimentary'}
              onChange={(patch) => setEditor((current) => (current ? { ...current, ...patch } : current))}
            />

            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-3">
              <PortalCheckbox
                checked={editor.active}
                onChange={(checked) => setEditor((current) => (current ? { ...current, active: checked } : current))}
                label="Available on new proposals"
                sublabel="Pause anytime without changing proposals already sent."
              />
            </div>

            {modalError ? (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-200">
                {modalError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
              <PortalButton
                variant="ghost"
                onClick={() => {
                  setEditor(null)
                  setModalError(null)
                }}
                disabled={saving}
              >
                Cancel
              </PortalButton>
              <PortalButton variant="primary" onClick={() => void savePromotion()} disabled={saving}>
                {saving ? 'Saving…' : editor.id ? 'Save changes' : 'Create promotion'}
              </PortalButton>
            </div>
          </div>
        ) : null}
      </PortalModal>
    </section>
  )
}
