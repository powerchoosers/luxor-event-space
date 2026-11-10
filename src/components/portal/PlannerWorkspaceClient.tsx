/* eslint-disable @typescript-eslint/no-explicit-any -- Planner result shapes vary by section and are validated by the server route. */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle, ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, FileText, FolderOpen,
  LayoutGrid, ListTodo, Loader2, Menu, Plus, Search, Trash2, Users, Video, Palette, Pencil, X,
} from '@/lib/icons/phosphor-compat'
import {
  PortalButton, PortalDatePicker, PortalEmptyState, PortalModal, PortalPageFrame, PortalPageHeader,
  PortalAnimatedTabs, PortalSelect, PortalSkeletonTransition, PortalStatusBadge, PortalTabTransition,
} from '@/components/portal/PortalUI'
import { EventLayoutDesigner, type EventLayoutDocument } from '@/components/portal/EventLayoutDesigner'
import { normalizePlannerEventLayout } from '@/lib/luxorPlannerLayout'
import { zonedTourDateTimeToUtc } from '@/lib/luxorTourSlots'
import { luxorPlannerDateKey } from '@/lib/luxorPlannerDates'
import { filterPlannerEventsByPlanningState, filterPlannerTasksByEvent, getPlannerProgress, getPlannerTaskHistoryPresentation, resolvePlannerCategory } from '@/lib/luxorPlannerProgress'
import { PlannerSharePanel } from '@/components/portal/PlannerSharePanel'
import { BookingExpenseSummary } from '@/components/portal/BookingExpenseSummary'

type Section = 'overview' | 'events' | 'tasks' | 'meetings' | 'design-library' | 'vendors' | 'files'
type Entity = 'task' | 'meeting' | 'design' | 'vendor' | 'event_vendor' | 'checklist' | 'checklist_item' | 'file'
type Row = Record<string, any> & { id: string }
type Field = { key: string; label: string; kind?: 'date' | 'select' | 'textarea' | 'time' | 'number'; options?: { value: string; label: string }[]; required?: boolean; placeholder?: string }

const sections: { id: Section; label: string; icon: typeof CalendarDays }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'design-library', label: 'Design Studio', icon: Palette },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'vendors', label: 'Vendors', icon: Users },
  { id: 'files', label: 'Files', icon: FolderOpen },
]
const sectionDescriptions: Record<Section, string> = {
  overview: 'Upcoming events and planning priorities',
  events: 'Confirmed bookings and event details',
  'design-library': 'Reusable event layouts and design concepts',
  tasks: 'Planning tasks and reusable checklists',
  meetings: 'Client and planning meetings',
  vendors: 'Reusable vendor directory',
  files: 'Event files and documents',
}
const eventTabs = [
  ['overview','Overview'],['design','Design Studio'],['meetings','Meetings'],['tasks','Tasks'],
  ['vendors','Vendors'],['files','Files & Documents'],['payments','Payments'],['activity','Activity'],
] as const

function asRows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row && typeof row === 'object' && typeof row.id === 'string')) : [] }
function text(value: unknown) { return typeof value === 'string' ? value : '' }
function displayDate(value: unknown, options?: Intl.DateTimeFormatOptions) {
  if (typeof value !== 'string' || !value) return 'Date not set'
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? 'Date not set' : new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...(options ?? { month: 'short', day: 'numeric', year: 'numeric' }) }).format(date)
}
function chicagoDateTimeParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part)=>[part.type,part.value]))
  return { date:`${values.year}-${values.month}-${values.day}`, time:`${values.hour}:${values.minute}` }
}
function labelStatus(value: unknown) {
  if (value === 'approved') return 'Internal review complete'
  if (value === 'presented') return 'Marked presented'
  if (value === 'ready_to_present') return 'Ready to present'
  if (value === 'revision_requested') return 'Revisions requested'
  return String(value || 'not started').replaceAll('_', ' ')
}
function fileMatchesRequirement(file: Row, requirement: string) {
  const needle = requirement.toLowerCase().replaceAll('_',' ')
  const category = String(file.category||'').toLowerCase().replaceAll('_',' ')
  const title = String(file.title||'').toLowerCase()
  if (needle.includes('insurance')) return category==='insurance'||title.includes('insurance')
  if (needle.includes('agreement')||needle.includes('contract')) return category==='vendor agreements'||title.includes('agreement')||title.includes('contract')
  if (needle.includes('permit')) return category==='permits'||title.includes('permit')
  return category===needle||title.includes(needle)
}
function cardClass() { return 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm' }
function inputClass() { return 'min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/10' }

const fieldsByEntity: Record<Entity, Field[]> = {
  task: [
    { key: 'title', label: 'Task', required: true }, { key: 'category', label: 'Category' },
    { key: 'due_date', label: 'Due date', kind: 'date' }, { key: 'priority', label: 'Priority', kind: 'select', options: ['low','medium','high'].map((value) => ({ value, label: value })) },
    { key: 'status', label: 'Status', kind: 'select', options: ['not_started','in_progress','completed'].map((value) => ({ value, label: value.replaceAll('_',' ') })) },
    { key: 'booking_id', label: 'Confirmed event', kind: 'select', required: true, options: [] }, { key: 'assigned_to', label: 'Assigned person' }, { key: 'description', label: 'Details', kind: 'textarea' }, { key: 'notes', label: 'Private notes', kind: 'textarea' },
    { key: 'milestone_meeting_id', label: 'Related event meeting', kind: 'select', options: [] }, { key: 'milestone_file_id', label: 'Related event document', kind: 'select', options: [] },
  ],
  meeting: [
    { key: 'title', label: 'Meeting title', required: true }, { key: 'starts_date', label: 'Date', kind: 'date', required: true },
    { key: 'starts_time', label: 'Start time', kind: 'time', required: true }, { key: 'duration_minutes', label: 'Duration (minutes)' },
    { key: 'booking_id', label: 'Linked event (optional)', kind: 'select', options: [] }, { key: 'meeting_type', label: 'Meeting type' }, { key: 'video_url', label: 'Video meeting link', placeholder: 'https://' },
    { key: 'agenda', label: 'Agenda', kind: 'textarea' }, { key: 'internal_notes', label: 'Private meeting notes', kind: 'textarea' }, { key: 'client_decisions', label: 'Client decisions', kind: 'textarea' },
    { key: 'status', label: 'Meeting status', kind: 'select', options: ['scheduled','completed','cancelled'].map((value) => ({ value, label: value })) },
  ],
  design: [
    { key: 'name', label: 'Design name', required: true },
    { key: 'design_kind', label: 'Save as', kind: 'select', options: [{ value: 'template', label: 'Reusable template' }, { value: 'event_concept', label: 'Event concept' }] },
    { key: 'category', label: 'Category', kind: 'select', options: [
      {value:'event_layout',label:'Event layout'},{value:'floor_plan',label:'Floor plan'},{value:'seating_layout',label:'Seating layout'},
      {value:'mood_board',label:'Mood board'},{value:'color_palette',label:'Color palette'},{value:'decor_concept',label:'Décor concept'},
      {value:'event_design',label:'Event design concept'},{value:'design_template',label:'General design template'},{value:'other',label:'Other'},
    ] },
    { key: 'event_type', label: 'Event type' }, { key: 'design_style', label: 'Design style' },
    { key: 'guest_count_min', label: 'Guest range minimum', kind: 'number' }, { key: 'guest_count_max', label: 'Guest range maximum', kind: 'number' },
    { key: 'palette_text', label: 'Color palette', placeholder: 'Champagne, ivory, blush' }, { key: 'tags_text', label: 'Design tags', placeholder: 'modern, garden, candlelight' }, { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'internal_notes', label: 'Internal notes', kind: 'textarea' }, { key: 'status', label: 'Internal planning status', kind: 'select', options: [{value:'draft',label:'Draft'},{value:'ready_to_present',label:'Ready to present'},{value:'presented',label:'Marked presented'},{value:'revision_requested',label:'Revisions requested'},{value:'approved',label:'Internal review complete'}] },
  ],
  vendor: [
    { key: 'business_name', label: 'Business name', required: true }, { key: 'contact_person', label: 'Contact person' },
    { key: 'category', label: 'Category', kind: 'select', options: ['dj','photographer','videographer','caterer','florist','decorator','baker','bartender','entertainment','rental_company','other'].map((value) => ({ value, label: value.replaceAll('_',' ') })) },
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'website', label: 'Website', placeholder: 'https://' },
    { key: 'services', label: 'Services', kind: 'textarea' }, { key: 'internal_notes', label: 'Private notes', kind: 'textarea' },
  ],
  event_vendor: [
    { key: 'vendor_id', label: 'Vendor', kind: 'select', required: true, options: [] },
    { key: 'status', label: 'Status', kind: 'select', options: ['proposed','contacted','confirmed','documents_pending','ready_for_event','completed','cancelled'].map((value) => ({ value, label: value.replaceAll('_',' ') })) },
    { key: 'arrival_time', label: 'Arrival time', kind: 'time' }, { key: 'setup_time', label: 'Setup time', kind: 'time' }, { key: 'departure_time', label: 'Departure time', kind: 'time' },
    { key: 'services', label: 'Services for this event', kind: 'textarea' }, { key: 'required_documents_text', label: 'Required documents (comma separated)', kind: 'textarea', placeholder: 'Insurance, vendor agreement, permit' }, { key: 'access_instructions', label: 'Access instructions', kind: 'textarea' }, { key: 'internal_notes', label: 'Private event notes', kind: 'textarea' },
  ],
  checklist: [{ key: 'name', label: 'Checklist name', required: true }, { key: 'event_type', label: 'Event type' }, { key: 'description', label: 'Description', kind: 'textarea' }],
  checklist_item: [{ key: 'checklist_id', label: 'Checklist', kind: 'select', options: [] }, { key: 'title', label: 'Task', required: true }, { key: 'description', label: 'Details', kind: 'textarea' }, { key: 'category', label: 'Category' }, { key: 'days_before_event', label: 'Days before event (negative is after)' }, { key: 'priority', label: 'Priority', kind: 'select', options: ['low','medium','high'].map((value) => ({ value, label: value })) }],
  file: [{ key: 'title', label: 'File title', required: true }, { key: 'category', label: 'Category', kind: 'select', options: ['client_documents','contracts','insurance','vendor_agreements','permits','design_inspiration','floor_plans','event_operations','financial_documents','other'].map((value) => ({ value, label: value.replaceAll('_',' ') })) }, { key: 'expires_at', label: 'Expiration date', kind: 'date' }],
}

export function PlannerWorkspaceClient({ initialSection, bookingId, greetingName }: { initialSection: Section; bookingId?: string; greetingName?: string }) {
  const router = useRouter()
  const search = useSearchParams()
  const sectionParam = search.get('section')
  const selectedSection = sections.find((item) => item.id === sectionParam)?.id ?? initialSection
  const [section, setSection] = useState<Section>(selectedSection)
  const [workspaceTab, setWorkspaceTab] = useState<string>(search.get('tab') || 'overview')
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Record<string, any> | null>(null)
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const [modal, setModal] = useState<Entity | 'upload' | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [layoutDesign, setLayoutDesign] = useState<Row | null>(null)
  const [layoutInitial, setLayoutInitial] = useState<EventLayoutDocument | null>(null)
  const [layoutContextMessage, setLayoutContextMessage] = useState('')
  const [layoutBusy, setLayoutBusy] = useState(false)
  const [openBuilderAfterSave, setOpenBuilderAfterSave] = useState(false)
  const [designActionBusyId, setDesignActionBusyId] = useState<string | null>(null)
  const loadRequestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/planner?section=${section}${bookingId ? `&bookingId=${encodeURIComponent(bookingId)}` : ''}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Planner information could not be loaded.')
      if (requestId === loadRequestRef.current) setData(result)
    } catch (loadError) {
      if (requestId === loadRequestRef.current) setError(loadError instanceof Error ? loadError.message : 'Planner information could not be loaded.')
    } finally { if (requestId === loadRequestRef.current) setLoading(false) }
  }, [section, bookingId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setSection(selectedSection) }, [selectedSection])
  useEffect(() => { setWorkspaceTab(search.get('tab') || 'overview') }, [search])
  useEffect(() => {
    if (!viewPickerOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewPickerOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [viewPickerOpen])
  useEffect(() => {
    const term = query.trim()
    setSearchResults(null)
    if (term.length < 2) return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => {
      void fetch(`/api/planner?section=search&q=${encodeURIComponent(term)}`, { cache:'no-store', signal: controller.signal })
        .then(async (response) => { const result = await response.json(); if (active && response.ok) setSearchResults(result) })
        .catch(() => { if (active) setSearchResults(null) })
    }, 220)
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [query])

  const openForm = (entity: Entity | 'upload', record?: Row, defaults: Record<string, string> = {}) => {
    setEditing(record ?? null)
    const initial: Record<string, string> = { ...defaults }
    if (record) for (const [key, value] of Object.entries(record)) if (typeof value === 'string' || typeof value === 'number') initial[key] = String(value)
    if (record && Array.isArray(record.palette)) initial.palette_text = record.palette.join(', ')
    if (record && entity === 'design' && record.content && typeof record.content === 'object' && Array.isArray(record.content.tags)) initial.tags_text = record.content.tags.join(', ')
    if (bookingId) initial.booking_id = bookingId
    if (entity === 'design') initial.design_kind = record?.design_kind || (bookingId ? 'event_concept' : 'template')
    if (entity === 'event_vendor') initial.status ||= 'proposed'
    if (entity === 'event_vendor' && record) {
      initial.required_documents_text = Array.isArray(record.required_documents) ? record.required_documents.join(', ') : ''
      for (const field of ['arrival', 'setup', 'departure']) {
        const value = record[`${field}_at`]
        if (typeof value === 'string') {
          initial[`${field}_time`] = chicagoDateTimeParts(value).time
        }
      }
    }
    if (entity === 'upload') {
      const attachmentType = initial.attachment_type
      if (attachmentType === 'vendor' || attachmentType === 'design' || attachmentType === 'event_vendor') initial.booking_id = ''
    }
    if (entity === 'meeting') {
      if (initial.starts_at) {
        const parts = chicagoDateTimeParts(initial.starts_at)
        initial.starts_date = parts.date
        initial.starts_time = parts.time
      }
      initial.duration_minutes ||= '60'
      initial.meeting_type ||= 'design_consultation'
      initial.status ||= 'scheduled'
    }
    setForm(initial); setModal(entity); setNotice('')
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!modal) return
    setBusy(true); setNotice('')
    try {
      if (modal === 'upload') {
        const formData = new FormData(event.currentTarget)
        const linkKeys = ['booking_id','vendor_id','design_id','event_vendor_id']
        for (const key of linkKeys) formData.delete(key)
        const attachmentType = form.attachment_type || (bookingId ? 'booking' : '')
        const targetKey = ({ booking: 'booking_id', vendor: 'vendor_id', design: 'design_id', event_vendor: 'event_vendor_id' } as Record<string,string>)[attachmentType]
        const targetId = attachmentType === 'booking' ? form.booking_id || bookingId : targetKey ? form[targetKey] : ''
        if (!targetKey || !targetId) throw new Error('Choose exactly one event, vendor, design, or event-vendor assignment for this file.')
        formData.set(targetKey, targetId)
        if (attachmentType === 'design') {
          const chosen = asRows(data.designs).find((design)=>design.id===targetId)
          formData.set('expected_revision', form.expected_revision || String(chosen?.revision || ''))
        }
        for (const key of ['category','title','expires_at','expected_revision']) if (form[key]) formData.set(key, form[key])
        const response = await fetch('/api/planner/files', { method: 'POST', body: formData })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'File could not be uploaded.')
      } else if (modal === 'file') {
        const response = await fetch('/api/planner/files', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:editing?.id,title:form.title,category:form.category,expires_at:form.expires_at||null}) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'File details could not be saved.')
      } else {
        const record: Record<string, unknown> = { ...form, ...(!editing && bookingId ? { booking_id: bookingId } : {}) }
        if (modal === 'vendor' || modal === 'design') {
          record.category = resolvePlannerCategory(form.category || '', form.category_custom || '')
          delete record.category_custom
          if (!record.category) throw new Error('Enter or choose a category.')
        }
        delete record.starts_date; delete record.starts_time
        if (modal === 'design') {
          record.palette = (form.palette_text || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0,12)
          record.guest_count_min = form.guest_count_min === '' ? null : Number(form.guest_count_min)
          record.guest_count_max = form.guest_count_max === '' ? null : Number(form.guest_count_max)
          record.content = { ...(editing?.content && typeof editing.content === 'object' ? editing.content : {}), tags: (form.tags_text || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0,20) }
          delete record.palette_text
          delete record.tags_text
          record.expected_revision = Number(editing?.revision)
        }
        if (modal === 'meeting') {
          if (!form.starts_date || !form.starts_time) throw new Error('Meeting date and time are required.')
          record.starts_at = zonedTourDateTimeToUtc(form.starts_date,form.starts_time).toISOString()
        }
        if (modal === 'event_vendor') {
          for (const field of ['arrival','setup','departure']) {
            const value = form[`${field}_time`]
            const eventDate = text(data.booking?.event_date) || text(data.bookings?.find((item: Row)=>item.id===form.booking_id)?.event_date)
            if (value && eventDate) record[`${field}_at`] = zonedTourDateTimeToUtc(eventDate, value).toISOString()
          }
          delete record.arrival_time; delete record.setup_time; delete record.departure_time
        }
        if (modal === 'event_vendor') {
          if (!record.vendor_id) throw new Error('Choose a vendor.')
        }
        const response = await fetch('/api/planner', {
          method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing ? { entity: modal, id: editing.id, record } : { entity: modal, record }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Planner record could not be saved.')
        if (modal === 'design' && !editing && openBuilderAfterSave) {
          setOpenBuilderAfterSave(false)
          setModal(null)
          setEditing(null)
          setLayoutContextMessage('This is a reusable master layout. Later event copies are independent and will not change when this master is edited.')
          setLayoutInitial({version:1,name:String(result.name||'New Layout'),items:[]})
          setLayoutDesign(result)
          setNotice('Layout details saved. Build and save the editable floor plan next.')
          await load()
          return
        }
      }
      setModal(null); setEditing(null); await load()
    } catch (saveError) { setNotice(saveError instanceof Error ? saveError.message : 'Planner record could not be saved.') }
    finally { setBusy(false) }
  }

  const updateTaskStatus = async (task: Row) => {
    const status = task.status === 'not_started' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'not_started'
    const response = await fetch('/api/planner', { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ entity:'task', id:task.id, record:{ ...task, status } }) })
    if (response.ok) await load()
  }
  const remove = async (entity: Entity, id: string) => {
    const confirmation = entity === 'design'
      ? 'Archive this design? It will leave the active gallery but remain recoverable. This does not permanently delete it.'
      : 'Remove this Planner item?'
    if (!window.confirm(confirmation)) return
    const response = await fetch(`/api/planner?entity=${entity}&id=${encodeURIComponent(id)}`, { method:'DELETE' })
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error || 'This item could not be removed.'); return }
    await load()
  }
  const restoreDesign = async (id: string) => {
    setDesignActionBusyId(id)
    try {
      const response = await fetch('/api/planner', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({entity:'restore_design',id}) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) { setError(result.error || 'Design could not be restored.'); return }
      setNotice('Design restored to the active gallery.')
      await load()
    } finally { setDesignActionBusyId(null) }
  }
  const removeFile = async (file: Row) => {
    if (!window.confirm('Delete this private Planner file?')) return
    const revision = file.design_id ? file.design_revision ?? data.designs?.find((design:Row)=>design.id===file.design_id)?.revision : undefined
    const response = await fetch(`/api/planner/files?id=${encodeURIComponent(file.id)}${file.design_id ? `&design_id=${encodeURIComponent(String(file.design_id))}` : ''}${revision !== undefined ? `&revision=${encodeURIComponent(String(revision))}` : ''}`, { method: 'DELETE' })
      if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error || 'This file could not be removed.'); return }
    await load()
  }
  const duplicate = async (design: Row, targetBookingId?: string) => {
    const target = targetBookingId || (design.design_kind === 'event_concept' ? String(design.booking_id || '') : '')
    // The unlinked legacy gallery may contain records created before the
    // template kind was required. Duplicating one there creates a proper
    // reusable template; event-linked concepts still copy only to their event.
    const asTemplate = !target
    setDesignActionBusyId(design.id)
    try {
      const response = await fetch('/api/planner', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ entity:'duplicate_design', source_id:design.id, target_booking_id:target || null, as_template:asTemplate }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) setError(result.error || 'Design could not be copied.')
      else { setNotice(target ? 'An independent event design copy was created.' : 'A separate template copy was created.'); await load() }
    } catch { setError('Design could not be copied. Please try again.') }
    finally { setDesignActionBusyId(null) }
  }

  const openLayoutEditor = (design: Row) => {
    // Unlinked legacy designs are master records even if an older version did
    // not label their design_kind as `template`.
    const isTemplate = !design.booking_id && !bookingId
    const isEventConcept = design.design_kind === 'event_concept' && design.booking_id === bookingId && Boolean(bookingId)
    if (!isTemplate && !isEventConcept) {
      setError('Open a reusable master in Design Studio or an event concept copied into its own event workspace.')
      return
    }
    const content = design.content && typeof design.content === 'object' ? design.content as Record<string, unknown> : {}
    const layout = content.event_layout ? normalizePlannerEventLayout(content.event_layout) : null
    if (content.event_layout && !layout) {
      setError('This concept contains an unsupported floor-plan format. Its saved content has not been changed.')
      return
    }
    setError('')
    setLayoutContextMessage(isTemplate
      ? 'This is the reusable master layout. Saving updates its editable floor plan and preview; event copies already made remain unchanged.'
      : 'This floor plan belongs to this event concept. Saving creates a new revision and leaves its source template and linked lead event unchanged.')
    setLayoutInitial(layout)
    setLayoutDesign(design)
  }

  const importLinkedLayout = async (design: Row) => {
    if (!bookingId || design.design_kind !== 'event_concept' || design.booking_id !== bookingId) {
      setError('Choose a concept copied into this event before importing a floor plan.')
      return
    }
    setLayoutBusy(true); setError('')
    try {
      const response = await fetch(`/api/planner/layout-source?bookingId=${encodeURIComponent(bookingId)}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Linked floor plan could not be imported.')
      const layout = normalizePlannerEventLayout(result.source?.layout)
      if (!layout) throw new Error('The linked event floor plan has an unsupported format.')
      setLayoutContextMessage(`Imported copy from ${text(result.source?.eventType) || 'the linked lead event'}${result.source?.eventDate ? ` · ${displayDate(result.source.eventDate)}` : ''}. Saving creates a revision on this Planner concept; the linked lead event remains unchanged.`)
      setLayoutInitial(layout)
      setLayoutDesign(design)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Linked floor plan could not be imported.')
    } finally { setLayoutBusy(false) }
  }

  const saveEventLayout = async (layout: EventLayoutDocument) => {
    const isTemplate = Boolean(layoutDesign && !layoutDesign.booking_id && !bookingId)
    const isEventConcept = layoutDesign?.design_kind === 'event_concept' && layoutDesign.booking_id === bookingId && Boolean(bookingId)
    if (!layoutDesign || (!isTemplate && !isEventConcept)) return false
    try {
      const content = layoutDesign.content && typeof layoutDesign.content === 'object' ? layoutDesign.content as Record<string, unknown> : {}
      const response = await fetch('/api/planner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'design', id: layoutDesign.id,
          record: { expected_revision: Number(layoutDesign.revision), content: { ...content, event_layout: layout } },
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Floor plan could not be saved.')
      setLayoutDesign(null)
      setNotice('Floor plan saved to a new Planner design revision.')
      await load()
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Floor plan could not be saved.')
      return false
    }
  }

  const navigateSection = (nextSection: Section) => {
    setViewPickerOpen(false)
    if (nextSection === section) return
    loadRequestRef.current += 1
    setLoading(true)
    setSection(nextSection)
    const url = new URL(window.location.href)
    url.searchParams.set('section', nextSection)
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const browseViewsButton = (mobile = false) => (
    <button
      type="button"
      onClick={() => setViewPickerOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={viewPickerOpen}
      aria-label={`Browse views. Currently viewing ${sections.find((item) => item.id === section)?.label || 'Overview'}`}
      className={`${mobile ? 'flex min-h-16 w-full px-4 py-3' : 'inline-flex min-h-10 px-3.5 py-1.5'} items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-left text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45`}
    >
      <Menu size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[8px] font-black uppercase leading-none tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span>
        <span className={`mt-0.5 block truncate text-xs font-bold leading-tight ${mobile ? '' : 'max-w-[145px]'}`}>{sections.find((item) => item.id === section)?.label || 'Overview'}</span>
      </span>
      <ChevronDown size={15} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
    </button>
  )

  const plannerSearch = (desktop = false) => (
    <div className={`relative ${desktop ? 'w-56 2xl:w-60' : 'w-full sm:max-w-md'}`}>
      <Search size={15} className={`absolute ${desktop ? 'left-2.5' : 'left-3'} top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]`} aria-hidden="true" />
      <input className={`${inputClass()} ${desktop ? 'min-h-8 py-1 pl-8 text-xs' : 'pl-9'}`} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search events, clients, vendors, files…" aria-label="Search Planner" />
    </div>
  )

  const nav = (
    <>
      <div className="hidden min-w-0 xl:block">
        <PortalAnimatedTabs
          variant="slider"
          ariaLabel="Planner sections"
          tabs={sections.map((item) => {
            const Icon = item.icon
            return { id: item.id, label: item.label, icon: <Icon size={15} /> }
          })}
          activeTab={section}
          onTabChange={navigateSection}
          className="w-full"
          trailing={!bookingId && section !== 'design-library' ? plannerSearch(true) : undefined}
        />
      </div>
      <div className="md:hidden">{browseViewsButton(true)}</div>
    </>
  )

  const heading = bookingId ? (text(data.booking?.client_name) || 'Event workspace') : sections.find((item) => item.id === section)?.label || 'Planner'
  const booking = data.booking as Row | undefined
  const createNewLayout = () => { setOpenBuilderAfterSave(true); openForm('design', undefined, { design_kind: 'template', category: 'event_layout' }) }
  const openLayoutBuilder = () => {
    const savedLayout = asRows(data.designs).find((item) => !item.booking_id && !item.archived_at && item.content?.event_layout)
    if (savedLayout) openLayoutEditor(savedLayout)
    else createNewLayout()
  }

  return <PortalPageFrame>
    <PortalPageHeader
      icon={<CalendarDays size={23}/>}
      title={bookingId ? heading : section === 'design-library' ? 'Design Studio' : 'Planner'}
      titleHref={bookingId && booking?.inquiry_id ? `/portal/leads/${String(booking.inquiry_id)}` : undefined}
      description={bookingId ? `${text(booking?.event_type) || 'Event'} · ${displayDate(booking?.event_date)} · ${labelStatus(booking?.status)}` : undefined}
      mobileActionsInline={!bookingId}
      titleClassName={!bookingId ? section === 'design-library' ? 'whitespace-nowrap text-base min-[380px]:text-2xl sm:text-3xl' : 'text-2xl sm:text-3xl' : undefined}
      actions={bookingId ? (
        <Link href="/portal/planner/events" className="text-xs font-bold text-[#a17b35] hover:underline">All events</Link>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
          <div className="hidden md:flex xl:hidden">{browseViewsButton()}</div>
          <Link href="/portal/leads" className="luxor-gold-raised inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-1.5 text-xs font-bold text-white min-[380px]:gap-2 min-[380px]:px-3 sm:px-4"><Plus size={15}/>New Event</Link>
        </div>
      )}
    />
    {!bookingId ? nav : <nav aria-label="Event planning sections" className="portal-scrollbar flex gap-1 overflow-x-auto border-b border-[color:var(--portal-border)] pb-2">{eventTabs.map(([tab,label]) => <button type="button" key={tab} onClick={()=>{setWorkspaceTab(tab); router.replace(`/portal/planner/event/${bookingId}?tab=${tab}`)}} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold ${workspaceTab===tab?'bg-[#caa24c]/10 text-[#9a712e] dark:text-[#f1d27a]':'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]'}`}>{label}</button>)}</nav>}
    {!bookingId && section !== 'design-library' ? <div className="w-full xl:hidden">{plannerSearch()}</div> : null}
    {!bookingId && section !== 'design-library' && query.trim().length>=2 && searchResults ? <PlannerSearchResults results={searchResults}/> : null}
    {notice ? <div className="rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 px-4 py-3 text-sm text-[color:var(--portal-text)]" role="status">{notice}</div> : null}
    {error ? <div className="flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-[color:var(--portal-text)]"><AlertCircle size={18} className="text-red-500"/><div className="min-w-0 flex-1">{error}</div><PortalButton size="sm" onClick={()=>void load()}>Retry</PortalButton></div> : null}
    <PortalTabTransition activeKey={bookingId ? `${bookingId}:${workspaceTab}` : section} className="min-w-0 flex-1">
      {!bookingId && section === 'design-library' ? <DesignStudioBuilder onCreateLayout={createNewLayout} onOpenBuilder={openLayoutBuilder} loading={loading || Boolean(error)} /> : null}
      <PortalSkeletonTransition loading={loading} overlap animateInitialSkeleton skeleton={<PlannerContentSkeleton section={section} workspaceTab={workspaceTab} isWorkspace={Boolean(bookingId)} />}>
        {bookingId && !booking ? <PortalEmptyState title="Event workspace unavailable" description="Planner workspaces are available for confirmed or completed bookings. Open Planner Events to view all active bookings." icon={<CalendarDays size={22}/>} action={<Link href="/portal/planner/events" className="text-sm font-bold text-[#a17b35]">Open Events</Link>}/> : booking ? renderWorkspace(workspaceTab,data,booking,query,openForm,updateTaskStatus,remove,removeFile,duplicate,openLayoutEditor,importLinkedLayout,layoutBusy,designActionBusyId) : renderSection(section,{...data,greetingName},query,openForm,updateTaskStatus,remove,removeFile,duplicate,openLayoutEditor,designActionBusyId,createNewLayout,(id)=>void restoreDesign(id))}
      </PortalSkeletonTransition>
    </PortalTabTransition>
    {!bookingId && typeof document !== 'undefined' ? createPortal(
      <AnimatePresence initial={false}>
        {viewPickerOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={() => setViewPickerOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="planner-view-menu-title"
              className="flex max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
              initial={{ opacity: 0, y: 56, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.985 }}
              transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-5 py-4 backdrop-blur-xl">
                <div>
                  <h2 id="planner-view-menu-title" className="text-base font-bold text-[color:var(--portal-text)]">Browse views</h2>
                  <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Choose a planning view.</p>
                </div>
                <button type="button" onClick={() => setViewPickerOpen(false)} aria-label="Close views menu" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
                  <X size={18}/>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 portal-scrollbar">
                <nav aria-label="Planner views" className="space-y-4">
                  <section>
                    <h3 className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">Plan & Coordinate</h3>
                    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] divide-y divide-[color:var(--portal-border)]">
                      {sections.slice(0, 4).map((item) => {
                        const Icon = item.icon
                        const selected = section === item.id
                        return <button key={item.id} type="button" aria-current={selected ? 'page' : undefined} onClick={() => navigateSection(item.id)} className={`flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 ${selected ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}>
                          <Icon size={16} className="shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{item.label}</span><span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">{sectionDescriptions[item.id]}</span></span>
                          <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                        </button>
                      })}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">People & Documents</h3>
                    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] divide-y divide-[color:var(--portal-border)]">
                      {sections.slice(4).map((item) => {
                        const Icon = item.icon
                        const selected = section === item.id
                        return <button key={item.id} type="button" aria-current={selected ? 'page' : undefined} onClick={() => navigateSection(item.id)} className={`flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 ${selected ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}>
                          <Icon size={16} className="shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{item.label}</span><span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">{sectionDescriptions[item.id]}</span></span>
                          <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                        </button>
                      })}
                    </div>
                  </section>
                </nav>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
    ) : null}
    <PortalModal isOpen={Boolean(modal)} onClose={()=>{setModal(null);setOpenBuilderAfterSave(false)}} title={modal ? modal==='design'&&form.category==='event_layout'&&!editing?'New Layout Details':form.name || form.title || form.business_name ? `${editing?'Edit':'New'} ${modal.replace('_',' ')}` : `New ${modal.replace('_',' ')}` : undefined} maxWidth="max-w-xl">
      {modal ? <RecordModal entity={modal} form={form} setForm={setForm} fields={modal==='upload'?[]:modal==='design'&&openBuilderAfterSave?fieldsByEntity.design.filter((field)=>['name','category','description','internal_notes'].includes(field.key)):fieldsByEntity[modal]} data={data} bookingId={bookingId} onClose={()=>{setModal(null);setOpenBuilderAfterSave(false)}} onSubmit={save} busy={busy} notice={notice} /> : null}
    </PortalModal>
    {layoutDesign ? <EventLayoutDesigner open onClose={()=>setLayoutDesign(null)} initialLayout={layoutInitial} leadName={text(booking?.client_name)||'Design Studio'} eventType={text(booking?.event_type)} eventDate={text(booking?.event_date)} guestCount={Number(booking?.guest_count)||null} contextMessage={layoutContextMessage} heading={!layoutDesign.booking_id&&!bookingId?'Layout Builder':'Event Layout Designer'} onSave={saveEventLayout}/> : null}
  </PortalPageFrame>
}

function PlannerContentSkeleton({ section, workspaceTab, isWorkspace }: { section: Section; workspaceTab: string; isWorkspace: boolean }) {
  const block = (className: string) => <div className={`luxor-skeleton rounded ${className}`} />
  const panel = (key: number) => <div key={key} className={`${cardClass()} min-h-36 p-4 sm:p-5`}><div className="border-b border-[color:var(--portal-border)] pb-3">{block('h-5 w-36')}</div><div className="mt-5 space-y-3">{block('h-3 w-3/4')}{block('h-3 w-1/2')}</div></div>
  if (!isWorkspace && section === 'design-library') return <div role="status" aria-label="Loading saved designs">{panel(0)}</div>
  const overview = isWorkspace ? workspaceTab === 'overview' : section === 'overview'
  return <div role="status" aria-label="Loading Planner" className="space-y-5">
    {overview ? <>
      <div className={`${cardClass()} min-h-36 p-5 sm:p-7`}>{block('h-3 w-36')}{block('mt-4 h-8 w-72 max-w-full')}{block('mt-3 h-3 w-56 max-w-full')}</div>
      {!isWorkspace ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((key) => <div key={key} className={`${cardClass()} flex min-h-20 items-center gap-4 p-4`}>{block('h-11 w-11 shrink-0 rounded-full')}{block('h-4 w-40')}</div>)}</div> : null}
      <div className="grid gap-4 xl:grid-cols-2">{[0, 1].map(panel)}</div>
      {panel(2)}
    </> : <>
      <div className={`${cardClass()} p-4 sm:p-5`}><div className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3">{block('h-5 w-44')}{block('h-9 w-28')}</div>{section === 'events' || section === 'tasks' ? <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((key) => <div key={key}>{block('h-3 w-20')}{block('mt-2 h-10 w-full')}</div>)}</div> : null}<div className="mt-5 space-y-4">{[0, 1, 2].map((key) => <div key={key} className="flex items-center gap-4 border-b border-[color:var(--portal-border)] pb-4 last:border-0">{block('h-10 w-10 shrink-0 rounded-lg')}<div className="flex-1 space-y-2">{block('h-3 w-40 max-w-full')}{block('h-3 w-64 max-w-full')}</div></div>)}</div></div>
      {(section === 'tasks' || section === 'design-library') && !isWorkspace ? panel(3) : null}
    </>}
  </div>
}

function renderSection(section: Section, data: Record<string, any>, query: string, openForm: (entity: Entity|'upload', record?: Row, defaults?: Record<string,string>)=>void, updateTaskStatus: (task:Row)=>void, remove:(entity:Entity,id:string)=>void, removeFile:(file:Row)=>void, duplicate:(design:Row,targetBookingId?:string)=>void, openLayoutEditor:(design:Row)=>void, designActionBusyId:string|null, createNewLayout:()=>void, restoreDesign:(id:string)=>void) {
  const match = (value: unknown) => !query || JSON.stringify(value).toLowerCase().includes(query.toLowerCase())
  const bookings = asRows(data.bookings)
  const tasks = asRows(data.tasks).filter(match)
  const meetings = asRows(data.meetings).filter(match)
  const designs = asRows(data.designs).filter(match)
  const vendors = asRows(data.vendors).filter(match)
  const files = asRows(data.files).filter(match)
  if (section === 'overview') {
    const upcoming = asRows(data.upcoming)
    const attention = Array.isArray(data.attention) ? data.attention : []
    const nextMeeting = data.nextMeeting as Row | null
    const recent = asRows(data.recentDesigns)
    return <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-[#caa24c]/15 bg-[linear-gradient(110deg,color-mix(in_srgb,var(--portal-card)_94%,#ead9bd),var(--portal-card))] p-5 sm:p-7"><div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-[#caa24c]/10 blur-3xl"/><p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-[#a17b35]">Your planning desk</p><h2 className="relative mt-2 font-serif text-3xl font-semibold text-[color:var(--portal-text)]">Welcome back{data.greetingName ? `, ${data.greetingName}` : ''}</h2><p className="relative mt-2 text-sm text-[color:var(--portal-muted)]">{attention.length ? `${attention.length} planning item${attention.length===1?'':'s'} need your attention today.` : 'Your confirmed events are up to date.'}</p></section>
      <div className="grid gap-3 sm:grid-cols-2"><Summary title="Upcoming Events" count={Number(data.upcomingCount)||0} icon={<CalendarDays size={19}/>} href="/portal/planner/events"/><Summary title="Items Need Attention" count={Number(data.attentionCount ?? attention.length)} icon={<AlertCircle size={19}/>} href="/portal/planner/tasks"/></div>
      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Needs Attention" action={<Link href="/portal/planner/tasks" className="text-xs font-bold text-[#a17b35]">All tasks <ArrowRight size={13} className="inline"/></Link>}>{attention.length?attention.map((item:any)=><Link href={`/portal/planner/event/${item.booking?.id}?tab=${item.type==='task'?'tasks':item.type==='vendor'?'vendors':'design'}`} key={`${item.type}-${item.id}`} className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0"><AlertCircle size={15} className="shrink-0 text-[#b38331]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--portal-text)]">{item.title} <span className="font-normal text-[color:var(--portal-muted)]">· {item.booking?.client_name}</span></span>{item.dueDate?<span className="text-xs text-[color:var(--portal-muted)]">{displayDate(item.dueDate,{month:'short',day:'numeric'})}</span>:null}<ChevronRight size={15}/></Link>):<p className="py-5 text-sm text-[color:var(--portal-muted)]">Nothing needs attention right now.</p>}</Panel>
      <Panel title="Upcoming Events" action={<Link href="/portal/planner/events" className="text-xs font-bold text-[#a17b35]">All events <ArrowRight size={13} className="inline"/></Link>}>{upcoming.length?upcoming.map((event)=><EventRow key={event.id} event={event} nextTask={asRows(data.tasks).filter((task)=>task.booking_id===event.id&&task.status!=='completed').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))[0]}/>):<EmptyText>Confirmed events will appear here.</EmptyText>}</Panel></div>
      <Panel title="Upcoming Meeting">{nextMeeting?<div className="flex flex-wrap items-center gap-4"><div className="rounded-xl bg-[#caa24c]/10 px-4 py-3 text-center"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">{displayDate(nextMeeting.starts_at,{month:'short'})}</span><strong className="font-serif text-2xl text-[color:var(--portal-text)]">{new Date(String(nextMeeting.starts_at)).getDate()}</strong></div><div className="min-w-0 flex-1"><h3 className="font-semibold text-[color:var(--portal-text)]">{nextMeeting.title}</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{displayDate(nextMeeting.starts_at,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</p></div>{nextMeeting.video_url?<a href={nextMeeting.video_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-white hover:text-white"><Video size={15}/>Join meeting</a>:null}</div>:<EmptyText>No upcoming planning meeting is scheduled.</EmptyText>}</Panel>
      <Panel title="Recent Designs" action={<Link href="/portal/planner/design-library" className="text-xs font-bold text-[#a17b35]">Open Design Studio <ArrowRight size={13} className="inline"/></Link>}>{recent.length?<div className="grid gap-3 sm:grid-cols-3">{recent.map((design)=><DesignCard key={design.id} design={design} files={files.filter((file)=>file.design_id===design.id)} onDuplicate={()=>void duplicate(design)}/> )}</div>:<EmptyText>Your latest concepts and templates will appear here.</EmptyText>}</Panel>
    </div>
  }
  if (section === 'events') return <div className="space-y-4"><EventFilters bookings={bookings.filter(match)} tasks={tasks}/></div>
  if (section === 'tasks') return <div className="space-y-4"><TaskListPanel tasks={tasks} bookings={bookings} files={asRows(data.files)} updateTaskStatus={updateTaskStatus} openForm={openForm} remove={remove}/>
    <Panel title="Reusable Checklists" action={<PortalButton size="sm" onClick={()=>openForm('checklist')}><Plus size={14}/>New Checklist</PortalButton>}>{asRows(data.checklists).length?<ChecklistList checklists={asRows(data.checklists)} items={asRows(data.checklistItems)} onAdd={(id)=>openForm('checklist_item',undefined,{checklist_id:id})} onEdit={(entity,record)=>openForm(entity,record)} onRemove={(id)=>void remove('checklist_item',id)} onArchive={(id)=>void remove('checklist',id)}/>:<EmptyText>Create checklists, then add reusable items and relative due dates.</EmptyText>}</Panel>
    </div>
  if (section === 'meetings') return <Panel title="Planning Meetings" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('meeting')}><Plus size={14}/>Schedule Meeting</PortalButton>}>{meetings.length?meetings.map((meeting)=>{const matchedEvent=bookings.find((event)=>event.id===meeting.booking_id);return <div id={`meeting-${meeting.id}`} key={meeting.id} className="flex flex-wrap items-center gap-3 border-b border-[color:var(--portal-border)] py-4 last:border-0"><div className="rounded-xl bg-[#caa24c]/10 px-3 py-2 text-center"><Clock3 size={16} className="mx-auto text-[#a17b35]"/><span className="mt-1 block text-xs font-bold text-[color:var(--portal-text)]">{displayDate(meeting.starts_at,{month:'short',day:'numeric'})}</span></div><div className="min-w-0 flex-1"><h3 className="font-semibold text-[color:var(--portal-text)]">{meeting.title}</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{matchedEvent?.inquiry_id?<Link href={`/portal/leads/${matchedEvent.inquiry_id}`} className="no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{matchedEvent.client_name||'General'}</Link>:(matchedEvent?.client_name||'General')} · {displayDate(meeting.starts_at,{hour:'numeric',minute:'2-digit'})} · {meeting.duration_minutes} min</p></div><PortalStatusBadge status={labelStatus(meeting.status)}/>{meeting.video_url?<a href={meeting.video_url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#caa24c] px-3 py-2 text-xs font-bold text-white hover:text-white">Join</a>:null}<button type="button" onClick={()=>openForm('meeting',meeting)} className="p-2 text-[color:var(--portal-muted)]" aria-label="Edit meeting"><Pencil size={14}/></button>{meeting.booking_id?<button type="button" onClick={()=>openForm('task',undefined,{title:`Follow up: ${meeting.title}`,category:'Meeting follow-up',booking_id:meeting.booking_id})} className="text-xs font-bold text-[#a17b35]">Add follow-up task</button>:null}</div>}):<EmptyText>Schedule a planning meeting for a confirmed event. Meetings without a link remain available for in-person or phone consultations.</EmptyText>}</Panel>
  if (section === 'design-library') return <DesignStudioSection designs={designs} files={files} bookings={bookings} search={query} busyDesignId={designActionBusyId} onCreateLayout={createNewLayout} onEdit={(design)=>openForm('design',design)} onEditLayout={openLayoutEditor} onAttach={(design)=>openForm('upload',undefined,{attachment_type:'design',design_id:design.id,expected_revision:String(design.revision||1),category:'design_inspiration'})} onDuplicate={(design)=>void duplicate(design)} onUseTemplate={(design,bookingId)=>void duplicate(design,bookingId)} onArchive={(design)=>void remove('design',design.id)} onRestore={(design)=>void restoreDesign(design.id)} />
  if (section === 'vendors') return <div className="space-y-4"><Panel title="Vendor Directory" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('vendor')}><Plus size={14}/>Add Vendor</PortalButton>}>{vendors.length?vendors.map((vendor)=><div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0" key={vendor.id}><div className="min-w-0 flex-1"><p className="font-semibold text-[color:var(--portal-text)]">{vendor.business_name}</p><p className="mt-1 text-xs capitalize text-[color:var(--portal-muted)]">{vendor.category?.replaceAll('_',' ')}{vendor.contact_person?` · ${vendor.contact_person}`:''}</p></div>{vendor.email?<a href={`mailto:${vendor.email}`} className="text-xs text-[#a17b35]">{vendor.email}</a>:null}<button onClick={()=>openForm('vendor',vendor)} className="p-2 text-[color:var(--portal-muted)]" aria-label="Edit vendor"><Pencil size={14}/></button><button onClick={()=>void remove('vendor',vendor.id)} className="p-2 text-[color:var(--portal-muted)] hover:text-red-500" aria-label="Archive vendor"><Trash2 size={14}/></button></div>):<EmptyText>Add vendors once, then reuse the same vendor record across events.</EmptyText>}</Panel>
    {bookings.length?<Panel title="Event Vendor Assignments" action={<p className="text-xs text-[color:var(--portal-muted)]">Vendor schedules and access notes are internal</p>}>{asRows(data.assignments).map((assignment)=>{const event=bookings.find((item)=>item.id===assignment.booking_id);const vendor=vendors.find((item)=>item.id===assignment.vendor_id);return <div className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0" key={assignment.id}><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{vendor?.business_name || 'Vendor'} <span className="font-normal text-[color:var(--portal-muted)]">· {event?.inquiry_id?<Link href={`/portal/leads/${event.inquiry_id}`} className="no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{event.client_name||'Event'}</Link>:(event?.client_name||'Event')}</span></span><PortalStatusBadge status={labelStatus(assignment.status)}/><button type="button" onClick={()=>openForm('event_vendor',assignment)} className="p-2 text-[color:var(--portal-muted)]" aria-label="Edit event vendor assignment"><Pencil size={14}/></button></div>})}<EmptyText>Assign vendors inside an event workspace.</EmptyText></Panel>:null}</div>
  if (section === 'files') return <Panel title="Private Planner Files" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('upload')}><Plus size={14}/>Upload File</PortalButton>}>{files.length?files.map((file)=><div key={file.id} className="flex flex-wrap items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0"><FileText size={17} className="text-[#a17b35]"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{file.title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{file.file_name} · {Math.max(1,Math.round(Number(file.size_bytes)/1024))} KB · {file.expires_at?`Expires ${displayDate(file.expires_at)}`:'No expiration set'} · Internal</p></div><a href={`/api/planner/files?id=${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">Preview</a><a href={`/api/planner/files?id=${file.id}&download=1`} className="text-xs font-bold text-[#a17b35]">Download</a>{!file.design_id?<button type="button" onClick={()=>openForm('file',file)} className="p-2 text-[color:var(--portal-muted)]" aria-label="Edit file details"><Pencil size={14}/></button>:null}<button type="button" onClick={()=>void removeFile(file)} className="p-2 text-[color:var(--portal-muted)] hover:text-red-500" aria-label="Delete file"><Trash2 size={14}/></button></div>):<PortalEmptyState title="No Planner files yet" description="Upload a file to a confirmed event, vendor, or design. Files remain private to the owner portal." icon={<FolderOpen size={22}/>} action={<PortalButton variant="primary" onClick={()=>openForm('upload')}><Plus size={15}/>Upload File</PortalButton>}/>}</Panel>
  return null
}

function TaskListPanel({tasks,bookings,files,updateTaskStatus,openForm,remove}:{tasks:Row[];bookings:Row[];files:Row[];updateTaskStatus:(task:Row)=>void;openForm:(entity:Entity|'upload',record?:Row,defaults?:Record<string,string>)=>void;remove:(entity:Entity,id:string)=>void}) {
  const [status,setStatus]=useState('all')
  const [priority,setPriority]=useState('all')
  const [assignee,setAssignee]=useState('all')
  const [due,setDue]=useState('all')
  const [eventId,setEventId]=useState('all')
  const today=luxorPlannerDateKey()
  const assignees=[...new Set(tasks.map((task)=>String(task.assigned_to||'')).filter(Boolean))]
  const eventFiltered=filterPlannerTasksByEvent(tasks,eventId)
  const filtered=eventFiltered.filter((task)=>
    (status==='all'||task.status===status)
    &&(priority==='all'||task.priority===priority)
    &&(assignee==='all'||task.assigned_to===assignee)
    &&(due==='all'||(due==='overdue'&&task.status!=='completed'&&task.due_date&&task.due_date<today)||(due==='upcoming'&&task.due_date&&task.due_date>=today)||(due==='no_date'&&!task.due_date))
  )
  const documentFor=(task:Row)=>files.find((file)=>file.id===task.milestone_file_id)
  return <Panel title="Planning Tasks" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('task')}><Plus size={14}/>New Task</PortalButton>}>
    <div className="mb-4 grid gap-2 border-b border-[color:var(--portal-border)] pb-4 sm:grid-cols-2 xl:grid-cols-5">
      <PortalSelect value={eventId} onChange={setEventId} options={[{value:'all',label:'All events'},...bookings.map((event)=>({value:event.id,label:event.client_name||'Event'})),...(tasks.some((task)=>!task.booking_id)?[{value:'__unlinked__',label:'Unlinked history'}]:[])]}/>
      <PortalSelect value={status} onChange={setStatus} options={[{value:'all',label:'All statuses'},...['not_started','in_progress','completed'].map((value)=>({value,label:value.replaceAll('_',' ')}))]}/>
      <PortalSelect value={priority} onChange={setPriority} options={[{value:'all',label:'All priorities'},...['high','medium','low'].map((value)=>({value,label:`${value} priority`}))]}/>
      <PortalSelect value={assignee} onChange={setAssignee} options={[{value:'all',label:'All assignees'},...assignees.map((value)=>({value,label:value}))]}/>
      <PortalSelect value={due} onChange={setDue} options={[{value:'all',label:'All due dates'},{value:'overdue',label:'Overdue'},{value:'upcoming',label:'Upcoming'},{value:'no_date',label:'No due date'}]}/>
    </div>
    {filtered.length?filtered.map((task)=>{const presentation=getPlannerTaskHistoryPresentation(task.booking_id);const taskEvent=bookings.find((event)=>event.id===task.booking_id);return <div key={task.id} className="flex flex-wrap items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0">
      {presentation.editable?<button type="button" onClick={()=>void updateTaskStatus(task)} className="flex h-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-2 text-[10px] font-bold text-[#a17b35]" aria-label={`Change task status from ${labelStatus(task.status)}`}>{task.status==='completed'?<Check size={15}/>:task.status==='in_progress'?'In progress':'Start'}</button>:<span className="rounded-md bg-[color:var(--portal-soft)] px-2 py-1 text-[10px] font-semibold text-[color:var(--portal-muted)]">History</span>}
      <div className="min-w-0 flex-1">{presentation.eventHref?<Link href={presentation.eventHref} className={`text-sm font-semibold ${task.status==='completed'?'text-[color:var(--portal-muted)] line-through':'text-[color:var(--portal-text)]'}`}>{task.title}</Link>:<p className={`text-sm font-semibold ${task.status==='completed'?'text-[color:var(--portal-muted)] line-through':'text-[color:var(--portal-text)]'}`}>{task.title}</p>}<p className="mt-1 text-xs text-[color:var(--portal-muted)]">{presentation.label} · {taskEvent?.inquiry_id?<Link href={`/portal/leads/${taskEvent.inquiry_id}`} className="no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{taskEvent.client_name||'Event was removed'}</Link>:(taskEvent?.client_name||'Event was removed')} · {task.category||'Planning'}{task.assigned_to?` · ${task.assigned_to}`:''}</p>{documentFor(task)?<a href={`/api/planner/files?id=${documentFor(task)?.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#a17b35]">Document: {documentFor(task)?.title||documentFor(task)?.file_name}</a>:null}</div>
      {task.due_date?<span className={`text-xs ${task.status!=='completed'&&task.due_date<today?'text-red-500':'text-[color:var(--portal-muted)]'}`}>{displayDate(task.due_date)}</span>:null}
      <PortalStatusBadge status={labelStatus(task.status)}/>{presentation.editable?<><button type="button" onClick={()=>openForm('task',task)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit ${task.title}`}><Pencil size={14}/></button><button type="button" onClick={()=>void remove('task',task.id)} className="p-2 text-[color:var(--portal-muted)] hover:text-red-500" aria-label="Delete task"><Trash2 size={14}/></button></>:null}
    </div>}):<EmptyText>No tasks match these filters. Create a task or clear filters.</EmptyText>}
  </Panel>
}

function renderWorkspace(tab: string, data: Record<string,any>, booking: Row, query: string, openForm:(entity:Entity|'upload',record?:Row,defaults?:Record<string,string>)=>void, updateTaskStatus:(task:Row)=>void, remove:(entity:Entity,id:string)=>void, removeFile:(file:Row)=>void, duplicate:(design:Row,targetBookingId?:string)=>void, openLayoutEditor:(design:Row)=>void, importLinkedLayout:(design:Row)=>void, layoutBusy:boolean,designActionBusyId:string|null) {
  const tasks=asRows(data.tasks).filter((task)=>!query||JSON.stringify(task).toLowerCase().includes(query.toLowerCase()))
  const meetings=asRows(data.meetings)
  const designs=asRows(data.designs)
  const templateFiles=asRows(data.templateFiles)
  const vendors=asRows(data.vendors)
  const files=asRows(data.files)
  const eventVendors=asRows(data.assignments)
  const eventPill=<div className="flex flex-wrap gap-2 text-xs text-[color:var(--portal-muted)]">{booking.guest_count? <span className="rounded-lg bg-[color:var(--portal-soft)] px-3 py-2">{booking.guest_count} guests</span>:null}{booking.package_name?<span className="rounded-lg bg-[color:var(--portal-soft)] px-3 py-2">{booking.package_name}</span>:null}<span className="rounded-lg bg-[color:var(--portal-soft)] px-3 py-2">{booking.start_time||'Time TBD'}{booking.end_time?` – ${booking.end_time}`:''}</span></div>
  const progressPercent=tasks.length?Math.round(tasks.filter((task)=>task.status==='completed').length/tasks.length*100):null
  if(tab==='overview') {
    const heroCardContent = (
      <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#a17b35]">{booking.event_type||'Confirmed event'}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)] transition-colors group-hover:text-[#a8792f] dark:group-hover:text-[#f1d27a]">{booking.client_name}</h2>
            <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{displayDate(booking.event_date)} · {labelStatus(booking.status)}</p>
          </div>
          {eventPill}
        </div>
        {progressPercent!==null?<div className="mt-5"><div className="mb-2 flex justify-between text-xs text-[color:var(--portal-muted)]"><span>Planning task completion</span><span>{progressPercent}% · {tasks.filter((task)=>task.status==='completed').length} of {tasks.length}</span></div><div className="h-2 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"><div className="h-full rounded-full bg-[#caa24c] transition-[width]" style={{width:`${progressPercent}%`}}/></div></div>:null}
      </>
    )
    return <div className="space-y-4">
      {booking.inquiry_id ? (
        <Link href={`/portal/leads/${String(booking.inquiry_id)}`} className={`${cardClass()} group block p-4 no-underline transition-all hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)]/40 sm:p-5`}>
          {heroCardContent}
        </Link>
      ) : (
        <section className={cardClass()+' p-4 sm:p-5'}>
          {heroCardContent}
        </section>
      )}
    <div className="grid gap-4 xl:grid-cols-2"><Panel title="Next Steps">{tasks.filter((task)=>task.status!=='completed').slice(0,5).map((task)=><button key={task.id} onClick={()=>void updateTaskStatus(task)} className="flex w-full items-center gap-3 border-b border-[color:var(--portal-border)] py-3 text-left last:border-0"><span className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--portal-border)] text-[#a17b35]">{task.status==='completed'?<Check size={13}/>:null}</span><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{task.title}</span><span className="text-xs text-[color:var(--portal-muted)]">{task.due_date?displayDate(task.due_date):''}</span></button>)}{tasks.every((task)=>task.status==='completed')?<EmptyText>No open planning tasks.</EmptyText>:null}</Panel>
    <Panel title="Current Designs">{designs.filter((design)=>design.status==='approved'||design.status==='draft'||design.status==='revision_requested').slice(0,3).map((design)=><div className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0" key={design.id}><Palette size={17} className="text-[#a17b35]"/><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{design.name}</span><PortalStatusBadge status={labelStatus(design.status)}/></div>)}{!designs.length?<EmptyText>Event designs will appear here when concepts are added.</EmptyText>:null}</Panel>
    <Panel title="Next Meeting">{meetings.filter((meeting)=>meeting.status==='scheduled'&&String(meeting.starts_at)>=new Date().toISOString()).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))).slice(0,1).map((meeting)=><div key={meeting.id} className="flex items-center gap-3"><Clock3 size={18} className="text-[#a17b35]"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[color:var(--portal-text)]">{meeting.title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{displayDate(meeting.starts_at,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</p></div>{meeting.video_url?<a href={meeting.video_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">Join</a>:null}</div>)}{!meetings.some((meeting)=>meeting.status==='scheduled'&&String(meeting.starts_at)>=new Date().toISOString())?<EmptyText>No upcoming meeting.</EmptyText>:null}</Panel>
    <Panel title="Event Milestones" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('task',undefined,{category:'milestone'})}><Plus size={14}/>Add milestone</PortalButton>}><MilestonePlan tasks={tasks} meetings={meetings} files={files} bookingId={booking.id} updateTaskStatus={updateTaskStatus} openForm={openForm}/></Panel></div>
    <div className="flex flex-wrap gap-2"><Link href="/portal/finances" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-bold text-[color:var(--portal-text)]">View Payments <ArrowRight size={14}/></Link></div></div>
  }
  if(tab==='tasks') return <div className="space-y-4"><Panel title="Event Tasks" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('task')}><Plus size={14}/>New Task</PortalButton>}>{tasks.length?tasks.map((task)=><div key={task.id} className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0"><button type="button" onClick={()=>void updateTaskStatus(task)} className="flex h-8 min-w-16 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-2 text-[10px] font-bold text-[#a17b35]" aria-label="Cycle task status">{task.status==='completed'?<Check size={15}/>:task.status==='in_progress'?'In progress':'Start'}</button><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{task.title}{files.find((file)=>file.id===task.milestone_file_id)?<a href={`/api/planner/files?id=${task.milestone_file_id}`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-semibold text-[#a17b35]">Document: {files.find((file)=>file.id===task.milestone_file_id)?.title||'Open'}</a>:null}</span><span className="text-xs text-[color:var(--portal-muted)]">{task.due_date?displayDate(task.due_date):'No due date'}</span><PortalStatusBadge status={labelStatus(task.status)}/><button type="button" onClick={()=>openForm('task',task)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit ${task.title}`}><Pencil size={14}/></button><button type="button" onClick={()=>void remove('task',task.id)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Delete ${task.title}`}><Trash2 size={14}/></button></div>):<EmptyText>No planning tasks for this event yet.</EmptyText>}</Panel><ChecklistApply booking={booking} /></div>
  if(tab==='design') return <div className="space-y-4">
    <Panel title="Event Design Studio" action={<div className="flex flex-wrap justify-end gap-2"><PortalButton variant="primary" size="sm" onClick={()=>openForm('design',undefined,{design_kind:'event_concept'})}><Plus size={14}/>New Concept</PortalButton></div>}>
      {designs.filter((design)=>design.design_kind==='event_concept').length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{designs.filter((design)=>design.design_kind==='event_concept').map((design)=><DesignCard key={design.id} design={design} files={files.filter((file)=>file.design_id===design.id)} onDuplicate={()=>void duplicate(design)} onEdit={()=>openForm('design',design)} onAttach={()=>openForm('upload',undefined,{attachment_type:'design',design_id:design.id,expected_revision:String(design.revision||1),category:'design_inspiration'})} onArchive={()=>void remove('design',design.id)} onOpenLayout={()=>openLayoutEditor(design)} onImportLayout={()=>void importLinkedLayout(design)} layoutBusy={layoutBusy}/>)}</div>:<EmptyText>Create an event-specific concept from scratch or start with a reusable Design Studio template.</EmptyText>}
    </Panel>
    <Panel title="Use a Design Studio Template" action={<Link href="/portal/planner/design-library" className="text-xs font-bold text-[#a17b35] hover:underline">Browse all templates <ArrowRight size={13} className="inline"/></Link>}>
      {asRows(data.templates).filter((template)=>!template.archived_at).length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{asRows(data.templates).filter((template)=>!template.archived_at).map((template)=><DesignStudioCard key={template.id} design={template} files={templateFiles.filter((file)=>file.design_id===template.id)} actionBusy={designActionBusyId===template.id} templateBookingId={String(booking.id)} onUseTemplate={()=>void duplicate(template,booking.id)}/>)}</div>:<EmptyText>No reusable templates yet. Create one in Design Studio, then apply an independent copy here.</EmptyText>}
      {booking.status!=='confirmed'?<p className="mt-2 text-xs text-[color:var(--portal-muted)]">Templates can be applied to confirmed events only.</p>:null}
    </Panel>
    <PlannerSharePanel bookingId={String(booking.id)} designs={designs} files={files}/>
  </div>
  if(tab==='meetings') return <Panel title="Event Meetings" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('meeting')}><Plus size={14}/>Schedule Meeting</PortalButton>}>{meetings.length?meetings.map((meeting)=><div id={`meeting-${meeting.id}`} key={meeting.id} className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0"><Clock3 size={18} className="text-[#a17b35]"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[color:var(--portal-text)]">{meeting.title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{displayDate(meeting.starts_at,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})} · {meeting.duration_minutes} min</p>{meeting.agenda?<p className="mt-1 text-xs text-[color:var(--portal-muted)]">{meeting.agenda}</p>:null}</div>{meeting.video_url?<a href={meeting.video_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">Join</a>:null}<PortalStatusBadge status={labelStatus(meeting.status)}/><button type="button" onClick={()=>openForm('meeting',meeting)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit ${meeting.title}`}><Pencil size={14}/></button></div>):<EmptyText>No event meetings scheduled.</EmptyText>}</Panel>
  if(tab==='vendors') return <div className="space-y-4"><Panel title="Event Vendors" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('event_vendor')}><Plus size={14}/>Assign Vendor</PortalButton>}>{eventVendors.map((assignment)=>{const vendor=vendors.find((value)=>value.id===assignment.vendor_id);const attached=files.filter((file)=>file.event_vendor_id===assignment.id);const required=Array.isArray(assignment.required_documents)?assignment.required_documents:[];return <div key={assignment.id} className="border-b border-[color:var(--portal-border)] py-4 last:border-0"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="font-semibold text-[color:var(--portal-text)]">{vendor?.business_name || 'Vendor'}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{assignment.services||vendor?.category?.replaceAll('_',' ')}</p></div><PortalStatusBadge status={labelStatus(assignment.status)}/><button type="button" onClick={()=>openForm('event_vendor',assignment)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit ${vendor?.business_name||'vendor'} assignment`}><Pencil size={14}/></button><PortalButton size="sm" onClick={()=>openForm('upload',undefined,{attachment_type:'event_vendor',event_vendor_id:assignment.id,category:'insurance'})}><Plus size={12}/>Add document</PortalButton></div>{required.length?<div className="mt-3 flex flex-wrap gap-2">{required.map((requirement:string)=>{const matching=attached.filter((file)=>fileMatchesRequirement(file,requirement));const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const match=matching.find((file)=>!file.expires_at||file.expires_at>=today)||matching[0];const expired=Boolean(match?.expires_at&&match.expires_at<today);return <span key={requirement} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${!match?'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300':expired?'border-red-500/30 bg-red-500/5 text-red-500':'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'}`}>{requirement}: {!match?'Missing':expired?'Expired':'Received'}</span>})}</div>:null}</div>})}{!eventVendors.length?<EmptyText>Assign a directory vendor to this event. Vendor notes and access details remain private.</EmptyText>:null}</Panel></div>
  if(tab==='files') return <Panel title="Event Files & Documents" action={<PortalButton variant="primary" size="sm" onClick={()=>openForm('upload')}><Plus size={14}/>Upload File</PortalButton>}>{files.map((file)=><div key={file.id} className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3 last:border-0"><FileText size={16} className="text-[#a17b35]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--portal-text)]">{file.title}</span><a href={`/api/planner/files?id=${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">Preview</a><a href={`/api/planner/files?id=${file.id}&download=1`} className="text-xs font-bold text-[#a17b35]">Download</a><button type="button" onClick={()=>void removeFile(file)} className="p-2 text-[color:var(--portal-muted)] hover:text-red-500" aria-label="Delete file"><Trash2 size={14}/></button></div>)}{!files.length?<EmptyText>Files must be uploaded and selected for this event; they are never automatically client-visible.</EmptyText>:null}</Panel>
  if(tab==='payments') return <Panel title="Payments"><p className="text-sm text-[color:var(--portal-muted)]">Payment status: <strong className="capitalize text-[color:var(--portal-text)]">{booking.payment_status||'Unavailable'}</strong></p><p className="mt-2 text-xs text-[color:var(--portal-muted)]">Final payment due: {booking.final_payment_due_date?displayDate(booking.final_payment_due_date):'Not set'}. Payment amounts and schedules remain in Finances.</p><BookingExpenseSummary bookingId={String(booking.id)} contractTotal={typeof booking.contract_total === 'number' && Number.isFinite(booking.contract_total) ? booking.contract_total : null}/><div className="mt-4"><Link href="/portal/finances" className="inline-flex items-center gap-2 text-sm font-bold text-[#a17b35]">Open Finances <ArrowRight size={14}/></Link></div></Panel>
  if(tab==='activity') return <Panel title="Event Planning Activity"><Timeline booking={booking} tasks={tasks} meetings={meetings} designs={designs}/></Panel>
  return null
}

function EventFilters({bookings,tasks}:{bookings:Row[];tasks:Row[]}) {
  const [type,setType]=useState('all')
  const [status,setStatus]=useState('all')
  const [planning,setPlanning]=useState('all')
  const [from,setFrom]=useState('')
  const [to,setTo]=useState('')
  const types=[...new Set(bookings.map((event)=>String(event.event_type||'Other')))]
  const bookingFiltered=bookings.filter((event)=>(type==='all'||String(event.event_type||'Other')===type)&&(status==='all'||event.status===status)&&(!from||String(event.event_date||'')>=from)&&(!to||String(event.event_date||'')<=to))
  const filtered=filterPlannerEventsByPlanningState(bookingFiltered,tasks,planning)
  return <Panel title="Confirmed Event Workspaces" action={<p className="text-xs text-[color:var(--portal-muted)]">{filtered.length} of {bookings.length} records</p>}><div className="mb-4 grid gap-3 border-b border-[color:var(--portal-border)] pb-4 sm:grid-cols-2 xl:grid-cols-5"><label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Event type<PortalSelect value={type} onChange={setType} options={[{value:'all',label:'All types'},...types.map((value)=>({value,label:value}))]}/></label><label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Booking status<PortalSelect value={status} onChange={setStatus} options={[{value:'all',label:'All booking statuses'},{value:'confirmed',label:'Confirmed'},{value:'completed',label:'Completed'}]}/></label><label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Planning progress<PortalSelect value={planning} onChange={setPlanning} options={[{value:'all',label:'All planning progress'},{value:'not_started',label:'Not started'},{value:'in_progress',label:'In progress'},{value:'complete',label:'Complete'}]}/></label><label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">From date<PortalDatePicker value={from} onChange={setFrom} className="w-full" allowPastDates/></label><label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">To date<PortalDatePicker value={to} onChange={setTo} className="w-full" allowPastDates/></label></div>{filtered.length?filtered.map((event)=>{const progress=getPlannerProgress(tasks.filter((task)=>task.booking_id===event.id));return <EventRow key={event.id} event={event} full planningProgress={progress.state} nextTask={tasks.filter((task)=>task.booking_id===event.id&&task.status!=='completed').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))[0]}/> }):<EmptyText>No events match these filters. Clear one or more filters to see other bookings.</EmptyText>}</Panel>
}

function PlannerSearchResults({results}:{results:Record<string,any>}) { const bookings=asRows(results.bookings);const tasks=asRows(results.tasks);const designs=asRows(results.designs);const vendors=asRows(results.vendors);const files=asRows(results.files);const count=bookings.length+tasks.length+designs.length+vendors.length+files.length;return <Panel title="Search results" action={<span className="text-xs text-[color:var(--portal-muted)]">{count} matches</span>}>{count?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{bookings.map((item)=><Link key={`event-${item.id}`} href={`/portal/planner/event/${item.id}`} className="rounded-xl border border-[color:var(--portal-border)] p-3 hover:border-[#caa24c]/35"><span className="text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">Event</span><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.client_name}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{item.event_type} · {displayDate(item.event_date)}</p></Link>)}{tasks.map((item)=>{const presentation=getPlannerTaskHistoryPresentation(item.booking_id);const content=<><span className="text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">{presentation.editable?'Task':'Unlinked history'}</span><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{item.booking?.client_name||'Event was removed'} · {item.due_date?displayDate(item.due_date):'No due date'}</p></>;return presentation.eventHref?<Link key={`task-${item.id}`} href={presentation.eventHref} className="rounded-xl border border-[color:var(--portal-border)] p-3 hover:border-[#caa24c]/35">{content}</Link>:<div key={`task-${item.id}`} className="rounded-xl border border-[color:var(--portal-border)] p-3">{content}</div>})}{designs.map((item)=><Link key={`design-${item.id}`} href={item.booking_id?`/portal/planner/event/${item.booking_id}?tab=design`:'/portal/planner/design-library'} className="rounded-xl border border-[color:var(--portal-border)] p-3 hover:border-[#caa24c]/35"><span className="text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">Design</span><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.name}</p><p className="mt-1 text-xs capitalize text-[color:var(--portal-muted)]">{labelStatus(item.status)}</p></Link>)}{vendors.map((item)=><Link key={`vendor-${item.id}`} href="/portal/planner/vendors" className="rounded-xl border border-[color:var(--portal-border)] p-3 hover:border-[#caa24c]/35"><span className="text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">Vendor</span><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.business_name}</p><p className="mt-1 text-xs capitalize text-[color:var(--portal-muted)]">{item.category}</p></Link>)}{files.map((item)=><a key={`file-${item.id}`} href={`/api/planner/files?id=${item.id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-[color:var(--portal-border)] p-3 hover:border-[#caa24c]/35"><span className="text-[10px] font-bold uppercase tracking-wider text-[#a17b35]">File</span><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.title}</p><p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{item.file_name}</p></a>)}</div>:<EmptyText>No events, tasks, designs, vendors, or files matched that search.</EmptyText>}</Panel> }

function ChecklistList({checklists,items,onAdd,onEdit,onRemove,onArchive}:{checklists:Row[];items:Row[];onAdd:(id:string)=>void;onEdit:(entity:Entity,record:Row)=>void;onRemove:(id:string)=>void;onArchive:(id:string)=>void}) { return <div>{checklists.map((checklist)=><div key={checklist.id} className="border-b border-[color:var(--portal-border)] py-3 last:border-0"><div className="flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{checklist.name} <span className="font-normal text-[color:var(--portal-muted)]">· {checklist.event_type || 'All events'}</span></span><button type="button" onClick={()=>onEdit('checklist',checklist)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit ${checklist.name}`}><Pencil size={13}/></button><button type="button" onClick={()=>onArchive(checklist.id)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Archive ${checklist.name}`}><Trash2 size={13}/></button><PortalButton size="sm" onClick={()=>onAdd(checklist.id)}><Plus size={12}/>Add task</PortalButton></div>{items.filter((item)=>item.checklist_id===checklist.id).map((item)=><div key={item.id} className="ml-3 mt-2 flex items-center gap-3 border-l border-[color:var(--portal-border)] pl-3"><span className="min-w-0 flex-1 text-xs text-[color:var(--portal-muted)]">{item.title}</span>{Number.isInteger(item.days_before_event)?<span className="text-[10px] text-[color:var(--portal-muted)]">{item.days_before_event<0?`${Math.abs(Number(item.days_before_event))} days after`:`${item.days_before_event} days before`}</span>:null}<button type="button" onClick={()=>onEdit('checklist_item',item)} className="p-1 text-[color:var(--portal-muted)]" aria-label={`Edit ${item.title}`}><Pencil size={12}/></button><button type="button" onClick={()=>onRemove(item.id)} className="p-1 text-[color:var(--portal-muted)] hover:text-red-500" aria-label={`Remove ${item.title}`}><Trash2 size={12}/></button></div>)}</div>)}</div> }

function Summary({title,count,icon,href}:{title:string;count:number;icon:React.ReactNode;href:string}) { return <Link href={href} className={cardClass()+' flex items-center gap-4 p-4 transition-colors hover:border-[#caa24c]/30'}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#a17b35]">{icon}</span><span className="font-serif text-3xl font-semibold text-[color:var(--portal-text)]">{count}</span><span className="flex-1 text-sm font-semibold text-[color:var(--portal-muted)]">{title}</span><ChevronRight size={16}/></Link> }
function Panel({title,action,children}:{title:string;action?:React.ReactNode;children:React.ReactNode}) { return <section className={cardClass()+' min-w-0 p-4 sm:p-5'}><div className="mb-2 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3"><h2 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">{title}</h2>{action}</div>{children}</section> }
function EmptyText({children}:{children:React.ReactNode}) { return <p className="py-4 text-sm leading-6 text-[color:var(--portal-muted)]">{children}</p> }
function EventRow({event,full=false,nextTask,planningProgress}:{event:Row;full?:boolean;nextTask?:Row;planningProgress?:string}) { return <Link href={`/portal/planner/event/${event.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--portal-border)] py-3 last:border-0 hover:bg-[color:var(--portal-soft)]"><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-[color:var(--portal-text)]">{event.client_name}</strong><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{event.event_type||'Event'} · {displayDate(event.event_date)}{event.guest_count?` · ${event.guest_count} guests`:''}</span>{full?<span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{event.package_name||'Package not set'} · {event.start_time||'Time TBD'}{event.end_time?` – ${event.end_time}`:''} · {event.payment_status||'Payment status unavailable'}{nextTask?` · Next: ${nextTask.title}${nextTask.due_date?` (${displayDate(nextTask.due_date)})`:''}`:' · No open planning task'}</span>:null}{planningProgress?<span className="mt-1 block text-xs font-semibold capitalize text-[#a17b35]">Planning: {labelStatus(planningProgress)}</span>:null}</span><PortalStatusBadge status={labelStatus(event.status)}/><ChevronRight size={16} className="text-[color:var(--portal-muted)]"/></Link> }
function DesignRevisionHistory({designId}:{designId:string}) {
  const [rows,setRows]=useState<Row[]>([])
  const [hasMore,setHasMore]=useState(false)
  const [loaded,setLoaded]=useState(false)
  const [busy,setBusy]=useState(false)
  const load=async(cursor?:number)=>{
    setBusy(true)
    try {
      const response=await fetch(`/api/planner?section=design_history&designId=${encodeURIComponent(designId)}${cursor?`&before=${cursor}`:''}`,{cache:'no-store'})
      const result=await response.json()
      if(response.ok){setRows((prior)=>cursor?[...prior,...asRows(result.revisions)]:asRows(result.revisions));setHasMore(Boolean(result.hasMore));setLoaded(true)}
    } finally { setBusy(false) }
  }
  return <details className="mt-3 rounded-lg border border-[color:var(--portal-border)] p-3" onToggle={(event)=>{if(event.currentTarget.open&&!loaded&&!busy)void load()}}>
    <summary className="cursor-pointer text-xs font-bold text-[color:var(--portal-text)]">Revision history</summary>
    {busy&&!loaded?<p className="mt-2 text-xs text-[color:var(--portal-muted)]">Loading revisions…</p>:null}
    {rows.length?<ol className="mt-2 space-y-2">{rows.map((row)=>{const snapshot=row.snapshot&&typeof row.snapshot==='object'?row.snapshot as Row:{} as Row;const assets=asRows(snapshot.assets);return <li key={row.id} className="border-t border-[color:var(--portal-border)] pt-2 text-xs text-[color:var(--portal-muted)]"><span className="font-semibold text-[color:var(--portal-text)]">Revision {row.revision}</span>{row.saved_at?` · ${displayDate(row.saved_at,{month:'short',day:'numeric',year:'numeric'})}`:''}<p className="mt-1">{snapshot.name||'Design'}{snapshot.status?` · ${labelStatus(snapshot.status)}`:''}</p>{assets.length?<div className="mt-1 flex flex-wrap gap-2">{assets.map((asset)=><a key={asset.id} href={`/api/planner/files?id=${asset.id}`} target="_blank" rel="noreferrer" className="font-bold text-[#a17b35]">{asset.title||asset.file_name} ↗</a>)}</div>:<p className="mt-1">No attached assets in this revision.</p>}</li>})}</ol>:loaded?<p className="mt-2 text-xs text-[color:var(--portal-muted)]">No previous revisions.</p>:null}
    {hasMore?<button type="button" disabled={busy} onClick={()=>{const oldest=Math.min(...rows.map((row)=>Number(row.revision)));if(Number.isFinite(oldest))void load(oldest)}} className="mt-3 text-xs font-bold text-[#a17b35]">{busy?'Loading…':'Load older revisions'}</button>:null}
  </details>
}

function DesignStudioBuilder({onCreateLayout,onOpenBuilder,loading}:{onCreateLayout:()=>void;onOpenBuilder:()=>void;loading:boolean}) {
  return <section className={cardClass()+' mb-4 p-4 sm:p-6'}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a17b35]">Design Studio</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">Layout Builder</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--portal-muted)]">Create editable floor plans and seating layouts, then save them as reusable masters for future confirmed events.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <PortalButton variant="primary" onClick={onCreateLayout}><Plus size={15}/>Create New Layout</PortalButton>
        <PortalButton onClick={onOpenBuilder} disabled={loading}><LayoutGrid size={15}/>Open Layout Builder</PortalButton>
      </div>
    </div>
  </section>
}

function DesignStudioSection({designs,files,bookings,search,busyDesignId,onCreateLayout,onEdit,onEditLayout,onAttach,onDuplicate,onUseTemplate,onArchive,onRestore}:{designs:Row[];files:Row[];bookings:Row[];search:string;busyDesignId:string|null;onCreateLayout:()=>void;onEdit:(design:Row)=>void;onEditLayout:(design:Row)=>void;onAttach:(design:Row)=>void;onDuplicate:(design:Row)=>void;onUseTemplate:(design:Row,bookingId:string)=>void;onArchive:(design:Row)=>void;onRestore:(design:Row)=>void}) {
  const [gallerySearch,setGallerySearch]=useState('')
  const [category,setCategory]=useState('all')
  const [showArchived,setShowArchived]=useState(false)
  const visibleDesigns=designs.filter((design)=>Boolean(design.archived_at)===showArchived)
  const categories=Array.from(new Set(visibleDesigns.map((design)=>text(design.category).trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b))
  const term=`${search} ${gallerySearch}`.trim().toLowerCase()
  const filtered=visibleDesigns.filter((design)=>{
    if(category!=='all'&&design.category!==category)return false
    if(!term)return true
    return [design.name,design.category,design.description,design.design_style,design.event_type,...(Array.isArray(design.palette)?design.palette:[])].some((value)=>String(value||'').toLowerCase().includes(term))
  })
  const confirmedBookings=bookings.filter((booking)=>booking.status==='confirmed')
  return <div className="space-y-4">
    <Panel title={showArchived?'Archived Designs':'Saved Designs'} action={<button type="button" onClick={()=>setShowArchived((current)=>!current)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]">{showArchived?'Back to active designs':'View archive'}</button>}>
      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="sr-only" htmlFor="design-studio-search">Search saved designs</label>
        <input id="design-studio-search" className={inputClass()} value={gallerySearch} onChange={(event)=>setGallerySearch(event.target.value)} placeholder="Search names, palettes, styles…" />
        <PortalSelect value={category} onChange={setCategory} options={[{value:'all',label:'All categories'},...categories.map((value)=>({value,label:value.replaceAll('_',' ').replaceAll('-',' ')}))]} aria-label="Filter designs by category" />
      </div>
      {filtered.length?<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((design)=><DesignStudioCard key={design.id} design={design} files={files.filter((file)=>file.design_id===design.id)} bookings={confirmedBookings} actionBusy={busyDesignId===design.id} archived={showArchived} onDuplicate={()=>onDuplicate(design)} onUseTemplate={(bookingId)=>onUseTemplate(design,bookingId)} onEdit={()=>onEdit(design)} onAttach={()=>onAttach(design)} onOpenLayout={()=>onEditLayout(design)} onArchive={()=>onArchive(design)} onRestore={()=>onRestore(design)} />)}</div>:showArchived?<EmptyText>No archived designs. Archived masters remain recoverable here; this view never permanently deletes them.</EmptyText>:visibleDesigns.length?<EmptyText>No designs match the current search and category.</EmptyText>:<div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-[color:var(--portal-muted)]">Your saved layouts and design masters will appear here. Start with the Layout Builder above.</p><PortalButton variant="primary" size="sm" onClick={onCreateLayout}><Plus size={14}/>Create New Layout</PortalButton></div>}
    </Panel>
  </div>
}

function LayoutThumbnail({layout}:{layout:EventLayoutDocument}) {
  const roomWidth=layout.roomWidthFeet||33
  const mainDepth=layout.roomHeightFeet||75
  const secondaryWidth=layout.secondaryRoomWidthFeet||20.83
  const secondaryDepth=layout.secondaryRoomDepthFeet||21.58
  const totalDepth=mainDepth+secondaryDepth
  const scale=Math.min(104/roomWidth,64/totalDepth)
  const offsetX=(120-roomWidth*scale)/2
  const offsetY=(80-totalDepth*scale)/2
  const roundKinds=new Set(['round-table','cocktail-table'])
  return <svg viewBox="0 0 120 80" role="img" aria-label={`Floor plan preview: ${layout.name}`} className="h-full w-full p-3 text-[#a17b35]">
    <rect x={offsetX} y={offsetY} width={roomWidth*scale} height={mainDepth*scale} rx="2" fill="var(--portal-card)" stroke="currentColor" strokeWidth="1.2"/>
    <rect x={offsetX+(roomWidth-secondaryWidth)*scale/2} y={offsetY+mainDepth*scale} width={secondaryWidth*scale} height={secondaryDepth*scale} rx="1.5" fill="var(--portal-soft)" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5"/>
    {layout.items.map((item)=>{
      const x=offsetX+(item.x/100)*roomWidth*scale
      const y=offsetY+(item.y/100)*totalDepth*scale
      const width=Math.max(1.4,item.width*scale)
      const height=Math.max(1.4,item.height*scale)
      const fill=item.color||((item.kind.includes('table')||item.kind==='chair')?'#d9be8b':'#a17b35')
      const transform=`rotate(${item.rotation} ${x+width/2} ${y+height/2})`
      return roundKinds.has(item.kind)
        ? <circle key={item.id} cx={x+width/2} cy={y+height/2} r={Math.max(width,height)/2} fill={fill} fillOpacity="0.82" stroke="var(--portal-card)" strokeWidth="0.5" transform={transform}/>
        : <rect key={item.id} x={x} y={y} width={width} height={height} rx="0.8" fill={fill} fillOpacity="0.82" stroke="var(--portal-card)" strokeWidth="0.45" transform={transform}/>
    })}
  </svg>
}

function DesignStudioCard({design,files=[],bookings=[],onDuplicate,onUseTemplate,onArchive,onRestore,onEdit,onAttach,onOpenLayout,actionBusy=false,archived=false,templateBookingId}:{design:Row;files?:Row[];bookings?:Row[];onDuplicate?:()=>void;onUseTemplate?:(bookingId:string)=>void;onArchive?:()=>void;onRestore?:()=>void;onEdit?:()=>void;onAttach?:()=>void;onOpenLayout?:()=>void;actionBusy?:boolean;archived?:boolean;templateBookingId?:string}) {
  const [chooseEvent,setChooseEvent]=useState(false)
  const image=files.find((file)=>String(file.content_type).startsWith('image/'))
  const content=design.content&&typeof design.content==='object'?design.content as Record<string,unknown>:{ }
  const layout=normalizePlannerEventLayout(content.event_layout)
  const updated=design.updated_at||design.created_at
  return <article className={cardClass()+' overflow-hidden'}>
    <div className="relative flex aspect-[1.8] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--portal-soft)_90%,#caa24c),var(--portal-card))] text-[#a17b35]">
      {layout?<LayoutThumbnail layout={layout}/>:image?<Image src={'/api/planner/files?id='+image.id} alt={String(design.name)+' inspiration'} fill sizes="(max-width: 640px) 90vw, 30vw" unoptimized className="object-cover"/>:<Palette size={30} strokeWidth={1.4}/>}
      {layout?<span className="absolute bottom-2 left-2 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 px-2 py-1 text-[9px] font-semibold text-[color:var(--portal-muted)]">Editable layout preview</span>:null}
    </div>
    <div className="p-3.5 sm:p-4">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{design.name}</h3><p className="mt-1 truncate text-xs capitalize text-[color:var(--portal-muted)]">{String(design.category||design.design_style||'Design concept').replaceAll('_',' ').replaceAll('-',' ')}</p></div><PortalStatusBadge status={labelStatus(design.status)}/></div>
      <p className="mt-2 text-[10px] text-[color:var(--portal-faint)]">{updated?'Updated '+displayDate(updated,{month:'short',day:'numeric',year:'numeric'}):'Date not recorded'}</p>
      {design.description?<p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--portal-muted)]">{design.description}</p>:null}
      {Array.isArray(design.palette)&&design.palette.length?<div className="mt-2 flex flex-wrap gap-1.5">{design.palette.slice(0,4).map((value:string)=><span key={value} className="rounded-full border border-[color:var(--portal-border)] px-2 py-1 text-[10px] text-[color:var(--portal-muted)]">{value}</span>)}</div>:null}
      <DesignRevisionHistory designId={design.id}/>
      {files.length?<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{files.slice(0,4).map((file)=><a key={file.id} href={'/api/planner/files?id='+file.id} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[#a17b35]">{file.title} ↗</a>)}</div>:null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--portal-border)] pt-3 text-xs font-semibold">
        {onEdit?<button type="button" onClick={onEdit} disabled={actionBusy} className="text-[color:var(--portal-muted)] disabled:opacity-50">Edit details</button>:null}
        {onOpenLayout?<button type="button" onClick={onOpenLayout} disabled={actionBusy} className="text-[color:var(--portal-muted)] disabled:opacity-50">{layout?'Edit layout':'Open builder'}</button>:null}
        {!archived&&onAttach?<button type="button" onClick={onAttach} disabled={actionBusy} className="text-[color:var(--portal-muted)] disabled:opacity-50">Add image</button>:null}
        {!archived&&onDuplicate?<button type="button" onClick={onDuplicate} disabled={actionBusy} className="text-[#a17b35] disabled:opacity-50">{actionBusy?'Copying…':'Duplicate'}</button>:null}
        {!archived&&onUseTemplate&&!templateBookingId?<button type="button" onClick={()=>setChooseEvent((current)=>!current)} disabled={actionBusy} className="text-[#a17b35] disabled:opacity-50">Use Template</button>:null}
        {!archived&&onUseTemplate&&templateBookingId?<button type="button" onClick={()=>onUseTemplate(templateBookingId)} disabled={actionBusy} className="text-[#a17b35] disabled:opacity-50">{actionBusy?'Applying…':'Use Template'}</button>:null}
        {!archived&&onArchive?<button type="button" onClick={onArchive} disabled={actionBusy} className="ml-auto text-[color:var(--portal-muted)] disabled:opacity-50">Archive</button>:null}
        {archived&&onRestore?<button type="button" onClick={onRestore} disabled={actionBusy} className="text-[#a17b35] disabled:opacity-50">{actionBusy?'Restoring…':'Restore'}</button>:null}
      </div>
      {chooseEvent&&!templateBookingId&&onUseTemplate?<div className="mt-3 rounded-lg bg-[color:var(--portal-soft)] p-3"><p className="mb-2 text-[11px] font-semibold text-[color:var(--portal-muted)]">Choose a confirmed event for an independent copy</p>{bookings.length?<PortalSelect value="" onChange={(id)=>{onUseTemplate(id);setChooseEvent(false)}} options={bookings.map((booking)=>({value:booking.id,label:String(booking.client_name)+' · '+displayDate(booking.event_date,{month:'short',day:'numeric',year:'numeric'})}))} placeholder="Select event…"/>:<p className="text-xs text-[color:var(--portal-muted)]">There are no confirmed events available for this template yet.</p>}</div>:null}
    </div>
  </article>
}

function DesignCard({design,files=[],onDuplicate,onArchive,onEdit,onAttach,onOpenLayout,onImportLayout,layoutBusy=false}:{design:Row;files?:Row[];onDuplicate:()=>void;onArchive?:()=>void;onEdit?:()=>void;onAttach?:()=>void;onOpenLayout?:()=>void;onImportLayout?:()=>void;layoutBusy?:boolean}) { const image=files.find((file)=>String(file.content_type).startsWith('image/'));return <article className={cardClass()+' overflow-hidden'}><div className="relative flex aspect-[1.8] items-center justify-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--portal-soft)_90%,#caa24c),var(--portal-card))] text-[#a17b35]">{image?<Image src={`/api/planner/files?id=${image.id}`} alt={`${design.name} inspiration`} fill sizes="(max-width: 640px) 90vw, 30vw" unoptimized className="object-cover"/>:<Palette size={32} strokeWidth={1.4}/>}</div><div className="p-4"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{design.name}</h3><p className="mt-1 truncate text-xs capitalize text-[color:var(--portal-muted)]">{design.design_style||design.category?.replaceAll('_',' ')||'Design concept'}</p></div><PortalStatusBadge status={labelStatus(design.status)}/></div><div className="mt-3 flex flex-wrap gap-1.5">{Array.isArray(design.palette)?design.palette.slice(0,4).map((value:string)=><span key={value} className="rounded-full border border-[color:var(--portal-border)] px-2 py-1 text-[10px] text-[color:var(--portal-muted)]">{value}</span>):null}</div><DesignRevisionHistory designId={design.id}/>{files.length?<div className="mt-3 flex flex-wrap gap-2">{files.map((file)=><a key={file.id} href={`/api/planner/files?id=${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">{file.title} ↗</a>)}</div>:null}<div className="mt-3 flex flex-wrap gap-x-3 gap-y-2"><button type="button" onClick={onDuplicate} className="text-xs font-bold text-[#a17b35]">Duplicate</button>{onEdit?<button type="button" onClick={onEdit} className="text-xs font-bold text-[color:var(--portal-muted)]">Edit</button>:null}{onAttach?<button type="button" onClick={onAttach} className="text-xs font-bold text-[color:var(--portal-muted)]">Add image or file</button>:null}{onOpenLayout?<button type="button" onClick={onOpenLayout} className="text-xs font-bold text-[color:var(--portal-muted)]">{design.content?.event_layout?'Edit floor plan':'Create floor plan'}</button>:null}{onImportLayout?<button type="button" disabled={layoutBusy} onClick={onImportLayout} className="text-xs font-bold text-[color:var(--portal-muted)] disabled:opacity-50">Import linked floor plan</button>:null}{onArchive?<button type="button" onClick={onArchive} className="ml-auto text-xs text-[color:var(--portal-muted)]">Archive</button>:null}</div></div></article> }
function MilestonePlan({tasks,meetings,files,bookingId,updateTaskStatus,openForm}:{tasks:Row[];meetings:Row[];files:Row[];bookingId:string;updateTaskStatus:(task:Row)=>void;openForm:(entity:Entity|'upload',record?:Row,defaults?:Record<string,string>)=>void}) {
  const milestones=tasks.filter((task)=>task.category==='milestone').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))
  return milestones.length?<ol className="divide-y divide-[color:var(--portal-border)]">{milestones.map((item)=>{const meeting=meetings.find((row)=>row.id===item.milestone_meeting_id);const file=files.find((row)=>row.id===item.milestone_file_id);return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3"><button type="button" onClick={()=>void updateTaskStatus(item)} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-bold capitalize text-[#a17b35]">{labelStatus(item.status)}</button><span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{item.title}</span><span className="text-xs text-[color:var(--portal-muted)]">{item.due_date?displayDate(item.due_date):'Date not set'}</span>{meeting?<Link href={`/portal/planner/event/${bookingId}?tab=meetings#meeting-${meeting.id}`} className="text-xs font-bold text-[#a17b35]">Meeting: {meeting.title}</Link>:null}{file?<a href={`/api/planner/files?id=${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#a17b35]">Document: {file.title}</a>:null}<button type="button" onClick={()=>openForm('task',item)} className="p-2 text-[color:var(--portal-muted)]" aria-label={`Edit milestone ${item.title}`}><Pencil size={14}/></button></li>})}</ol>:<EmptyText>Add dated milestones and link the event meeting or a private event document.</EmptyText>
}
function Timeline({booking,tasks,meetings,designs}:{booking:Row;tasks:Row[];meetings:Row[];designs:Row[]}) { const entries=[{date:booking.booked_at||booking.created_at,title:'Booking confirmed',detail:`${booking.event_type||'Event'} · ${booking.client_name}`},...tasks.map((item)=>({date:item.updated_at||item.created_at,title:item.status==='completed'?'Task completed':item.title,detail:item.due_date?`Due ${displayDate(item.due_date)}`:'Planning task'})),...meetings.map((item)=>({date:item.starts_at,title:item.title,detail:`Meeting · ${labelStatus(item.status)}`})),...designs.map((item)=>({date:item.updated_at||item.created_at,title:item.name,detail:`Design · ${labelStatus(item.status)}`}))].filter((entry)=>entry.date).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);return entries.length?<ol className="divide-y divide-[color:var(--portal-border)]">{entries.map((entry,index)=><li key={`${entry.title}-${index}`} className="py-3 first:pt-2"><p className="text-sm font-semibold text-[color:var(--portal-text)]">{entry.title}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{entry.detail} · {displayDate(entry.date,{month:'short',day:'numeric',year:'numeric'})}</p></li>)}</ol>:<EmptyText>Planning activity will appear here as bookings, tasks, meetings, and designs change.</EmptyText> }

function ChecklistApply({booking}:{booking:Row}) { const [items,setItems]=useState<Row[]>([]);const [checklist,setChecklist]=useState('');const [loading,setLoading]=useState(false);const [message,setMessage]=useState('');useEffect(()=>{let live=true;void fetch('/api/planner?section=tasks',{cache:'no-store'}).then((response)=>response.json()).then((result)=>{if(live)setItems(asRows(result.checklists))}).catch(()=>{});return()=>{live=false}},[]);if(!items.length)return null;return <Panel title="Reusable Checklists" action={<p className="text-xs text-[color:var(--portal-muted)]">Dates are based on the event date</p>}><div className="flex flex-wrap items-center gap-3"><PortalSelect value={checklist} onChange={setChecklist} options={items.map((item)=>({value:item.id,label:item.name}))} placeholder="Choose checklist…" className="min-w-56 flex-1"/><PortalButton disabled={!checklist||loading} onClick={async()=>{setLoading(true);const response=await fetch('/api/planner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'apply_checklist',booking_id:booking.id,checklist_id:checklist})});const result=await response.json();setMessage(response.ok?`${result.created} tasks added; duplicate tasks were skipped.`:result.error||'Could not apply checklist.');setLoading(false)}}>{loading?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}Apply</PortalButton></div>{message?<p className="mt-3 text-xs text-[color:var(--portal-muted)]" role="status">{message}</p>:null}</Panel> }

function RecordModal({entity,form,setForm,fields,data,bookingId,onClose,onSubmit,busy,notice}:{entity:Entity|'upload';form:Record<string,string>;setForm:(value:Record<string,string>)=>void;fields:Field[];data:Record<string,any>;bookingId?:string;onClose:()=>void;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;busy:boolean;notice:string}) { const vendors=asRows(data.vendors);const bookings=asRows(data.bookings);const designs=asRows(data.designs);const assignments=asRows(data.assignments);const meetings=asRows(data.meetings);const files=asRows(data.files);const linkedBooking=(file:Row)=>file.booking_id||designs.find((design)=>design.id===file.design_id)?.booking_id||assignments.find((assignment)=>assignment.id===file.event_vendor_id)?.booking_id;const fieldList=fields.map((field)=>field.key==='vendor_id'?{...field,options:vendors.map((vendor)=>({value:vendor.id,label:vendor.business_name}))}:field.key==='booking_id'?{...field,options:bookings.filter((item)=>item.status==='confirmed').map((item)=>({value:item.id,label:item.client_name}))}:field.key==='checklist_id'?{...field,options:asRows(data.checklists).map((item)=>({value:item.id,label:item.name}))}:field.key==='milestone_meeting_id'?{...field,options:meetings.filter((meeting)=>meeting.booking_id===form.booking_id).map((meeting)=>({value:meeting.id,label:`${meeting.title} · ${displayDate(meeting.starts_at)}`}))}:field.key==='milestone_file_id'?{...field,options:files.filter((item)=>linkedBooking(item)===form.booking_id).map((item)=>({value:item.id,label:item.title||item.file_name}))}:field);const set=(key:string,value:string)=>setForm({...form,[key]:value});const [file,setFile]=useState<File|null>(null);const assignmentOptions=assignments.map((assignment)=>({value:assignment.id,label:`${vendors.find((vendor)=>vendor.id===assignment.vendor_id)?.business_name||'Vendor'} · ${bookings.find((item)=>item.id===assignment.booking_id)?.client_name||'Event'}`}));return <form onSubmit={onSubmit} className="space-y-4">{entity==='upload'?<><label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">File<input type="file" name="file" required onChange={(event)=>setFile(event.target.files?.[0]||null)} className={inputClass()} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"/></label><p className="text-xs text-[color:var(--portal-muted)]">Private upload, maximum 25 MB. PDF, images, Office documents, and text files are supported.</p><label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">Title<input name="title" className={inputClass()} defaultValue={file?.name||''}/></label><label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">Category<PortalSelect value={form.category||'other'} onChange={(value)=>set('category',value)} options={['client_documents','contracts','insurance','vendor_agreements','permits','design_inspiration','floor_plans','event_operations','financial_documents','other'].map((value)=>({value,label:value.replaceAll('_',' ')}))}/></label>{!bookingId||form.attachment_type?<><label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">Attach to<PortalSelect value={form.attachment_type||''} onChange={(value)=>{setForm({...form,attachment_type:value,booking_id:'',vendor_id:'',design_id:'',event_vendor_id:'',expected_revision:''})}} options={[{value:'booking',label:'Confirmed event'},{value:'vendor',label:'Vendor'},{value:'design',label:'Design'},{value:'event_vendor',label:'Event vendor documents'}]} placeholder="Choose a record…"/></label>{form.attachment_type==='booking'?<PortalSelect value={form.booking_id||''} onChange={(value)=>set('booking_id',value)} options={bookings.map((item)=>({value:item.id,label:item.client_name}))} placeholder="Choose event…" className="w-full"/>:form.attachment_type==='vendor'?<PortalSelect value={form.vendor_id||''} onChange={(value)=>set('vendor_id',value)} options={vendors.map((item)=>({value:item.id,label:item.business_name}))} placeholder="Choose vendor…" className="w-full"/>:form.attachment_type==='design'?<PortalSelect value={form.design_id||''} onChange={(value)=>{const design=designs.find((item)=>item.id===value);setForm({...form,design_id:value,expected_revision:String(design?.revision||'')})}} options={designs.map((item)=>({value:item.id,label:item.name}))} placeholder="Choose design…" className="w-full"/>:form.attachment_type==='event_vendor'?<PortalSelect value={form.event_vendor_id||''} onChange={(value)=>set('event_vendor_id',value)} options={assignmentOptions} placeholder="Choose event vendor…" className="w-full"/>:null}</>:null}<label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">Expiration date (optional)<PortalDatePicker value={form.expires_at||''} onChange={(value)=>set('expires_at',value)} className="w-full" allowPastDates/></label></>:fieldList.filter((field)=>entity!=='task'||field.key!=='milestone_meeting_id'||form.category==='milestone').map((field)=><label key={field.key} className="block space-y-2 text-xs font-semibold capitalize text-[color:var(--portal-muted)]">{field.key==='milestone_file_id'&&entity==='task'&&form.category!=='milestone'?'Related event document':field.label}{field.kind==='textarea'?<textarea required={field.required} value={form[field.key]||''} onChange={(event)=>set(field.key,event.target.value)} className={inputClass()+' min-h-24'} placeholder={field.placeholder}/>:field.kind==='date'?<PortalDatePicker value={form[field.key]||''} onChange={(value)=>set(field.key,value)} className="w-full" allowPastDates/>:field.kind==='select'?<><PortalSelect value={form[field.key]||''} onChange={(value)=>set(field.key,value)} options={field.key==='category'&&entity==='design'?[...(field.options||[]),...Array.from(new Set([...designs,...asRows(data.templates)].map((item)=>String(item.category||'').trim()).filter((value)=>value&&!field.options?.some((option)=>option.value===value)))).map((value)=>({value,label:value.replaceAll('_',' ').replaceAll('-',' ')})),{value:'__custom__',label:'Custom category…'}]:field.key==='category'&&entity==='vendor'?[...(field.options||[]),...Array.from(new Set(vendors.map((item)=>String(item.category||'').trim()).filter((value)=>value&&!field.options?.some((option)=>option.value===value)))).map((value)=>({value,label:value.replaceAll('_',' ').replaceAll('-',' ')})),{value:'__custom__',label:'Custom category…'}]:(field.options||[])} placeholder={`Choose ${field.label.toLowerCase()}…`}/>{field.key==='category'&&(entity==='design'||entity==='vendor')&&form.category==='__custom__'?<input type="text" required maxLength={80} value={form.category_custom||''} onChange={(event)=>set('category_custom',event.target.value)} className={inputClass()} placeholder="Enter a category"/>:null}</>:field.kind==='time'?<input type="time" required={field.required} value={form[field.key]||''} onChange={(event)=>set(field.key,event.target.value)} className={inputClass()}/>:field.kind==='number'?<input type="number" min="0" step="1" required={field.required} value={form[field.key]||''} onChange={(event)=>set(field.key,event.target.value)} className={inputClass()}/>:<input type="text" required={field.required} value={form[field.key]||''} onChange={(event)=>set(field.key,event.target.value)} className={inputClass()} placeholder={field.placeholder}/>}</label>)}{entity==='event_vendor'?<label className="block space-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">Event<PortalSelect value={form.booking_id||bookingId||''} onChange={(value)=>set('booking_id',value)} options={bookings.filter((item)=>item.status==='confirmed').map((item)=>({value:item.id,label:item.client_name}))} placeholder="Choose confirmed event…"/></label>:null}{notice?<p role="alert" className="text-sm text-red-500">{notice}</p>:null}<div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4"><PortalButton onClick={onClose}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={busy||entity==='upload'&&!file}>{busy?<Loader2 size={14} className="animate-spin"/>:null}{entity==='upload'?'Upload':'Save'}</PortalButton></div></form> }
