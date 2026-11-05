'use client'

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'
import { getRecentLeads, getRecentLeadsServerSnapshot, subscribeRecentLeads } from '@/lib/luxorRecentLeads'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

/** Search active leads while keeping recently opened records close at hand. */
export function FollowUpLeadPicker({ id, leads, value, onChange, suggestedLeadIds = [] }: {
  id?: string
  leads: LuxorInquiry[]
  value: string
  onChange: (id: string) => void
  suggestedLeadIds?: string[]
}) {
  const generatedId = useId()
  const inputId = id ?? `follow-up-lead-${generatedId}`
  const listId = `${inputId}-suggestions`
  const rootRef = useRef<HTMLDivElement>(null)
  const recentLeads = useSyncExternalStore(subscribeRecentLeads, getRecentLeads, getRecentLeadsServerSnapshot)
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = leads.find((lead) => lead.id === value)

  const results = useMemo(() => {
    const byId = new Map(leads.map((lead) => [lead.id, lead]))
    const priorityIds = [...new Set([...recentLeads.map((lead) => lead.id), ...suggestedLeadIds])]
    const priority = priorityIds.flatMap((leadId) => {
      const lead = byId.get(leadId)
      return lead ? [lead] : []
    })
    const prioritySet = new Set(priority.map((lead) => lead.id))
    const remainder = leads.filter((lead) => !prioritySet.has(lead.id))
    const search = query.trim().toLocaleLowerCase()
    const ordered = [...priority, ...remainder]
    if (!search) return ordered.slice(0, 8)
    return ordered.filter((lead) => [lead.full_name, lead.email, lead.phone, lead.event_type].some((field) => field?.toLocaleLowerCase().includes(search))).slice(0, 8)
  }, [leads, query, recentLeads, suggestedLeadIds])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function choose(lead: LuxorInquiry) {
    onChange(lead.id)
    setQuery('')
    setOpen(false)
    setActiveIndex(0)
  }

  return <div ref={rootRef} className="relative mt-1 min-w-0">
    <div className="relative">
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined}
        autoComplete="off"
        placeholder="Search by name, email or phone"
        value={open ? query : selected?.full_name ?? ''}
        onFocus={() => { setQuery(''); setActiveIndex(0); setOpen(true) }}
        onClick={() => { if (!open) { setQuery(''); setActiveIndex(0); setOpen(true) } }}
        onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false) }}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); if (value) onChange(''); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex((index) => open ? Math.min(index + 1, results.length - 1) : 0); setOpen(true) }
          if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (results[activeIndex]) choose(results[activeIndex]) }
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        }}
        className="h-11 w-full rounded-xl border border-transparent bg-[color:var(--portal-soft)] pl-9 pr-3 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15"
      />
    </div>
    <AnimatePresence initial={false}>
      {open && <motion.div
        key="suggestions"
        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <div className="mt-1.5 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm">
          {!query.trim() && results.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--portal-muted)]">{recentLeads.length ? 'Recently opened and suggested' : 'Suggested leads'}</p>}
          <motion.div layout="size" id={listId} role="listbox" aria-label="Lead suggestions" className="portal-scrollbar max-h-52 overflow-y-auto p-1">
            {results.length ? results.map((lead, index) => <button
              id={`${listId}-${lead.id}`}
              key={lead.id}
              type="button"
              role="option"
              aria-selected={lead.id === value}
              tabIndex={-1}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(lead)}
              onMouseMove={() => setActiveIndex(index)}
              className={`flex min-h-10 w-full flex-col justify-center rounded-lg px-3 py-2 text-left transition-colors ${index === activeIndex ? 'bg-[color:var(--portal-soft)]' : 'hover:bg-[color:var(--portal-soft)]'}`}
            >
              <span className="text-sm font-medium text-[color:var(--portal-text)]">{lead.full_name}</span>
              <span className="truncate text-xs text-[color:var(--portal-muted)]">{[lead.event_type, lead.target_date, lead.email || lead.phone].filter(Boolean).join(' · ') || 'No contact details'}</span>
            </button>) : <p role="status" className="px-3 py-3 text-xs text-[color:var(--portal-muted)]">No matching leads.</p>}
          </motion.div>
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>
}
