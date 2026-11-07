'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X } from '@/lib/icons/phosphor-compat'
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { isLuxorInquiryArchived, type LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { luxorTodayKey } from '@/lib/luxorTourMetrics'

type TaskType = 'todo' | 'call' | 'email' | 'meeting' | 'other'

// Interpret the entered time in the venue's timezone, regardless of the device timezone.
function centralTimeIso(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let timestamp = desired
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp))
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]))
    timestamp += desired - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute)
  }
  return new Date(timestamp).toISOString()
}

const fieldClass = 'mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45'

export function AddCalendarTaskModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [title, setTitle] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('todo')
  const [date, setDate] = useState(() => luxorTodayKey())
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [lead, setLead] = useState<LuxorInquiry | null>(null)
  const [leads, setLeads] = useState<LuxorInquiry[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const listId = useId()
  const reduceMotion = useReducedMotion()
  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term || !leads) return []
    return leads.filter((item) => !isLuxorInquiryArchived(item) && [item.full_name, item.email, item.phone].some((value) => value?.toLowerCase().includes(term))).slice(0, 6)
  }, [leads, query])

  async function loadLeads() {
    if (leads || searchLoading) return
    setSearchLoading(true)
    setSearchError('')
    try {
      const response = await fetch('/api/inquiries', { cache: 'no-store' })
      if (!response.ok) throw new Error('Contacts could not be loaded. Try again.')
      const result = await response.json() as LuxorInquiry[]
      setLeads(result)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Contacts could not be loaded. Try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  function selectLead(item: LuxorInquiry) {
    setLead(item)
    setQuery(item.full_name)
    setSuggestionsOpen(false)
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && suggestionsOpen) {
      event.stopPropagation()
      setSuggestionsOpen(false)
    } else if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault()
      setSuggestionsOpen(true)
      setHighlighted((current) => Math.min(current + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault()
      setHighlighted((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && suggestionsOpen && suggestions.length) {
      event.preventDefault()
      selectLead(suggestions[Math.min(highlighted, suggestions.length - 1)])
    }
  }

  function close() {
    if (saving) return
    setTitle('')
    setTaskType('todo')
    setDate(luxorTodayKey())
    setTime('')
    setNotes('')
    setQuery('')
    setLead(null)
    setError('')
    setSuggestionsOpen(false)
    onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !date || saving) return
    if (query.trim() && !lead) {
      setError('Choose a suggested lead or clear the search to create a standalone task.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), taskType, inquiryId: lead?.id ?? null, description: notes.trim() || undefined, dueDate: date, dueAt: time ? centralTimeIso(date, time) : null, priority: 'medium' }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Task could not be saved.')
      setTitle('')
      setTaskType('todo')
      setDate(luxorTodayKey())
      setTime('')
      setNotes('')
      setQuery('')
      setLead(null)
      setSuggestionsOpen(false)
      onClose()
      void onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalModal isOpen={isOpen} onClose={close} title="Add Task" description="Create a reminder for yourself or link it to a lead." maxWidth="max-w-lg" fullScreenOnCompact>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">Task<input autoComplete="off" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" className={`${fieldClass} h-10`} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Type<PortalSelect value={taskType} onChange={(value) => setTaskType(value as TaskType)} options={[{ value: 'todo', label: 'To-do' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' }, { value: 'meeting', label: 'Meeting' }, { value: 'other', label: 'Other' }]} className="mt-1 w-full" buttonClassName="h-10" /></label>
          <label className="block text-sm font-medium">Due date<PortalDatePicker value={date} onChange={setDate} placeholder="Choose date" className="mt-1 w-full [&>button]:h-10 [&>button]:rounded-lg [&>button]:px-3 [&>button]:py-2 [&>button]:normal-case [&>button]:tracking-normal" /></label>
        </div>
        <label className="block text-sm font-medium">Time <span className="font-normal text-[color:var(--portal-muted)]">(optional, Central)</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={`${fieldClass} h-10`} /></label>
        <div onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false) }}>
          <label htmlFor={`${listId}-input`} className="block text-sm font-medium">Lead <span className="font-normal text-[color:var(--portal-muted)]">(optional)</span></label>
          <div className="relative mt-1">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
            <input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && !lead && !!query.trim()} aria-controls={listId} aria-activedescendant={suggestionsOpen && suggestions.length ? `${listId}-${Math.min(highlighted, suggestions.length - 1)}` : undefined} autoComplete="off" value={query} placeholder="Search name, email, or phone" onFocus={() => { setSuggestionsOpen(true); void loadLeads() }} onChange={(event) => { setQuery(event.target.value); setLead(null); setHighlighted(0); setSuggestionsOpen(true); void loadLeads() }} onKeyDown={onSearchKeyDown} className={`${fieldClass} !mt-0 h-10 pl-9 pr-10`} />
            {query && <button type="button" aria-label="Clear lead" onClick={() => { setLead(null); setQuery(''); setSuggestionsOpen(false) }} className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-border)]/50"><X size={15} /></button>}
          </div>
          {lead && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Linked to {lead.full_name}</p>}
          <AnimatePresence initial={false}>
            {suggestionsOpen && !lead && query.trim() && <motion.div initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden">
              <div id={listId} role="listbox" aria-label="Suggested leads" className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1">
                {searchLoading ? <p className="p-3 text-xs text-[color:var(--portal-muted)]">Loading contacts…</p> : searchError ? <p className="p-3 text-xs text-red-700 dark:text-red-300">{searchError}</p> : suggestions.length ? suggestions.map((item, index) => <button key={item.id} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === highlighted} onMouseDown={(event) => event.preventDefault()} onClick={() => selectLead(item)} onMouseEnter={() => setHighlighted(index)} className={`block w-full rounded-md px-3 py-2 text-left text-sm ${index === highlighted ? 'bg-[color:var(--portal-soft)]' : ''}`}><span className="block font-medium text-[color:var(--portal-text)]">{item.full_name}</span><span className="block truncate text-xs text-[color:var(--portal-muted)]">{item.email || item.phone || item.event_type || 'Lead'}</span></button>) : <p className="p-3 text-xs text-[color:var(--portal-muted)]">No matching leads. Leave this blank for a standalone task.</p>}
              </div>
            </motion.div>}
          </AnimatePresence>
        </div>
        <label className="block text-sm font-medium">Notes <span className="font-normal text-[color:var(--portal-muted)]">(optional)</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${fieldClass} py-2`} /></label>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={saving || !title.trim() || !date}>{saving ? 'Saving…' : 'Add Task'}</PortalButton></div>
      </form>
    </PortalModal>
  )
}
