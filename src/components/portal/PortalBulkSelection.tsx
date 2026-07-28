'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Minus, X } from 'lucide-react'
import { PortalButton, PortalModal, PortalSelect } from '@/components/portal/PortalUI'

export type PortalBulkAction = {
  id: string
  label: string
  icon?: React.ReactNode
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export function usePortalBulkSelection<T extends string>() {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(() => new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<T>>(() => new Set())

  const isSelected = useCallback((id: T) => allMatching ? !excludedIds.has(id) : selectedIds.has(id), [allMatching, excludedIds, selectedIds])

  const toggle = useCallback((id: T) => {
    if (allMatching) {
      setExcludedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [allMatching])

  const selectPage = useCallback((ids: T[]) => {
    const pageIsSelected = ids.length > 0 && ids.every((id) => allMatching ? !excludedIds.has(id) : selectedIds.has(id))
    if (allMatching) {
      setExcludedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => pageIsSelected ? next.add(id) : next.delete(id))
        return next
      })
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => pageIsSelected ? next.delete(id) : next.add(id))
      return next
    })
  }, [allMatching, excludedIds, selectedIds])

  const selectAllMatching = useCallback(() => {
    setAllMatching(true)
    setSelectedIds(new Set())
    setExcludedIds(new Set())
  }, [])

  const clear = useCallback(() => {
    setAllMatching(false)
    setSelectedIds(new Set())
    setExcludedIds(new Set())
  }, [])

  const resolveIds = useCallback((matchingIds: T[]) => (
    allMatching ? matchingIds.filter((id) => !excludedIds.has(id)) : matchingIds.filter((id) => selectedIds.has(id))
  ), [allMatching, excludedIds, selectedIds])

  const selectedCount = useCallback((totalMatching: number) => allMatching ? Math.max(0, totalMatching - excludedIds.size) : selectedIds.size, [allMatching, excludedIds.size, selectedIds.size])
  const pageSelectionState = useCallback((ids: T[]) => {
    const selected = ids.filter(isSelected).length
    return selected === 0 ? 'none' : selected === ids.length ? 'all' : 'some'
  }, [isSelected])

  return useMemo(() => ({
    allMatching,
    clear,
    isSelected,
    pageSelectionState,
    resolveIds,
    selectAllMatching,
    selectPage,
    selectedCount,
    toggle,
  }), [allMatching, clear, isSelected, pageSelectionState, resolveIds, selectAllMatching, selectPage, selectedCount, toggle])
}

export function PortalBulkRowSelector({
  checked,
  index,
  onChange,
  label,
}: {
  checked: boolean
  index: number
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Deselect ${label}` : `Select ${label}`}
      onClick={(event) => { event.stopPropagation(); onChange() }}
      className={`group/selector relative flex h-5 w-5 items-center justify-center rounded-[4px] border text-[9px] font-mono font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/55 ${
        checked
          ? 'border-[#caa24c] bg-[#caa24c] text-white'
          : 'border-transparent text-[color:var(--portal-faint)] hover:border-[#caa24c]/45 hover:bg-[#caa24c] hover:text-white focus-visible:border-[#caa24c]/45 focus-visible:bg-[#caa24c] focus-visible:text-white'
      }`}
    >
      <span className={checked ? 'hidden' : 'group-hover/selector:hidden group-focus-visible/selector:hidden'}>{index}</span>
      <Check
        size={10}
        strokeWidth={3.25}
        aria-hidden="true"
        className={`${checked ? 'block' : 'hidden group-hover/selector:block group-focus-visible/selector:block'} !text-white !stroke-white`}
        style={{ color: '#fff', stroke: '#fff' }}
      />
    </button>
  )
}

export function PortalBulkHeaderSelector({
  state,
  onChange,
  label = 'Select this page',
}: {
  state: 'none' | 'some' | 'all'
  onChange: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'some' ? 'mixed' : state === 'all'}
      aria-label={label}
      onClick={onChange}
      className={`flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/55 ${
        state === 'none'
          ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-transparent hover:border-[#caa24c]/45'
          : 'border-[#caa24c] bg-[#caa24c] text-white'
      }`}
    >
      {state === 'some' ? <Minus size={10} strokeWidth={3.25} className="!stroke-white" /> : state === 'all' ? <Check size={10} strokeWidth={3.25} className="!stroke-white" /> : null}
    </button>
  )
}

export function PortalBulkActionDeck({
  selectedCount,
  pageCount,
  totalCount,
  allMatching,
  actions,
  busyAction,
  onAction,
  onSelectAll,
  onClear,
  noun = 'record',
}: {
  selectedCount: number
  pageCount: number
  totalCount: number
  allMatching: boolean
  actions: PortalBulkAction[]
  busyAction?: string | null
  onAction: (actionId: string) => void
  onSelectAll: () => void
  onClear: () => void
  noun?: string
}) {
  return (
    <AnimatePresence>
      {selectedCount > 0 ? (
        <motion.aside
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          aria-label="Bulk actions"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] shadow-2xl shadow-black/30 sm:bottom-6"
        >
          {!allMatching && selectedCount >= pageCount && totalCount > pageCount ? (
            <div className="border-b border-[color:var(--portal-border)] bg-[#caa24c]/7 px-4 py-2 text-center text-[11px] text-[color:var(--portal-muted)]">
              This page is selected.{' '}
              <button type="button" onClick={onSelectAll} className="font-bold text-[#a8792f] underline underline-offset-4 dark:text-[#f1d27a]">
                Select all {totalCount} {pluralize(noun, totalCount)} in this view
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#caa24c] px-2 font-mono text-xs font-black text-white">{selectedCount}</span>
              <div>
                <p className="text-xs font-bold text-[color:var(--portal-text)]">{pluralize(noun, selectedCount)} selected</p>
                <p className="text-[10px] text-[color:var(--portal-muted)]">{allMatching ? 'All matching records are selected' : 'Choose an action for this selection'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={Boolean(busyAction) || action.disabled}
                  onClick={() => onAction(action.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    action.tone === 'danger'
                      ? 'border-red-500/25 bg-red-500/7 text-red-500 hover:bg-red-500/12 dark:text-red-300'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/35'
                  }`}
                >
                  {busyAction === action.id ? <Loader2 size={13} className="animate-spin" /> : action.icon}
                  {action.label}
                </button>
              ))}
              <button type="button" onClick={onClear} disabled={Boolean(busyAction)} aria-label="Clear selection" className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-45">
                <X size={15} />
              </button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

export function PortalBulkConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <PortalModal isOpen={open} onClose={busy ? () => undefined : onClose} title={title} description={description} maxWidth="max-w-md">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <PortalButton onClick={onClose} disabled={busy}>Cancel</PortalButton>
        <PortalButton variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {confirmLabel}
        </PortalButton>
      </div>
    </PortalModal>
  )
}

export function PortalBulkChoiceDialog({
  open,
  title,
  description,
  label,
  value,
  options,
  confirmLabel,
  busy = false,
  onValueChange,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  confirmLabel: string
  busy?: boolean
  onValueChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <PortalModal isOpen={open} onClose={busy ? () => undefined : onClose} title={title} description={description} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[color:var(--portal-muted)]">{label}</label>
          <PortalSelect value={value} onChange={onValueChange} options={options} className="w-full" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <PortalButton onClick={onClose} disabled={busy}>Cancel</PortalButton>
          <PortalButton variant="primary" onClick={onConfirm} disabled={busy || !value}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </PortalButton>
        </div>
      </div>
    </PortalModal>
  )
}

export function PortalBulkListDialog({
  open,
  mode,
  selectedCount,
  listNames,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  mode: 'add' | 'remove'
  selectedCount: number
  listNames: string[]
  busy?: boolean
  onConfirm: (listName: string) => void
  onClose: () => void
}) {
  const [selectedList, setSelectedList] = useState('')
  const [newList, setNewList] = useState('')

  React.useEffect(() => {
    if (!open) {
      setSelectedList('')
      setNewList('')
    }
  }, [open])

  const listName = mode === 'add' && newList.trim() ? newList.trim() : selectedList
  return (
    <PortalModal
      isOpen={open}
      onClose={busy ? () => undefined : onClose}
      title={mode === 'add' ? 'Add to marketing list' : 'Remove from marketing list'}
      description={`${selectedCount} selected ${selectedCount === 1 ? 'contact' : 'contacts'} will be ${mode === 'add' ? 'added to' : 'removed from'} one list. Contacts without an email are skipped.`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {listNames.length ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--portal-muted)]">Marketing list</label>
            <PortalSelect
              value={selectedList}
              onChange={(value) => { setSelectedList(value); if (value) setNewList('') }}
              options={[{ value: '', label: 'Choose a list' }, ...listNames.map((name) => ({ value: name, label: name }))]}
              className="w-full"
            />
          </div>
        ) : null}
        {mode === 'add' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--portal-muted)]">{listNames.length ? 'Or create a new list' : 'New list name'}</label>
            <input
              value={newList}
              maxLength={120}
              onChange={(event) => { setNewList(event.target.value); if (event.target.value) setSelectedList('') }}
              placeholder="Example: Fall tour follow-up"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2.5 text-xs font-semibold text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45"
            />
          </div>
        ) : null}
        {mode === 'add' ? <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Suppressed and unsubscribed email addresses are never re-added.</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <PortalButton onClick={onClose} disabled={busy}>Cancel</PortalButton>
          <PortalButton variant="primary" onClick={() => onConfirm(listName)} disabled={busy || !listName}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {mode === 'add' ? 'Add contacts' : 'Remove contacts'}
          </PortalButton>
        </div>
      </div>
    </PortalModal>
  )
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : noun.endsWith('s') ? noun : `${noun}s`
}
