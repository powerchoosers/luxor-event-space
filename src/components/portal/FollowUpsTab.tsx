'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarClock, Check, ChevronRight, CircleAlert, Clock3, Eye, FileText, Mail, MapPin, MessageSquare, MoreHorizontal, Pause, Phone, Plus, Search, Settings2, UserRound, X } from 'lucide-react'
import type { LuxorInquiry, LuxorTask } from '@/lib/luxorInquiryTypes'
import type { LuxorFollowUpTemplate } from '@/lib/luxorFollowUpsServer'
import { getCompletedTourLeads, getLuxorPostTourFollowUpStatus } from '@/lib/luxorTourMetrics'
import { buildFollowUpTaskPatch, getLuxorFollowUpTaskChannel, isLuxorFollowUpTask } from '@/lib/luxorFollowUpTaskPolicy'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect, PortalStatusBadge, type PortalStatusTone } from '@/components/portal/PortalUI'
import { LuxorCrmRecordCard } from '@/components/portal/LuxorCrmRecordCard'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { useToast } from '@/components/portal/ToastProvider'

type Channel = 'email' | 'phone'
type Activity = { id: string; at: string; kind: 'note' | 'call' | 'email' | 'follow-up'; label: string; detail: string }
type SequenceInfo = { status: 'active' | 'paused' | 'completed' | 'stopped'; ended_reason: string | null; response_received_at: string | null }
type SequenceAction = { id: string; enrollment_id: string; step_key: string; channel: string; scheduled_at: string; status: string; email_job_id: string | null }
type EmailAction = { id: string; inquiry_id: string; step_key: string; scheduled_at: string | null; status: string; enrollment_id?: string; channel?: string; email_job_id?: string | null }
type PausedEnrollment = { id: string; inquiry_id: string }
type FollowUpRow = { inquiryId: string; next: { id: string; channel: Channel; title: string; dueAt: string | null; dueDate: string | null; status: string; assignee: string; task?: LuxorTask }; activities: Activity[]; postTourStatus?: string }
type Filter = 'all' | 'new' | 'post_tour' | 'overdue'
type DetailTab = 'overview' | 'event' | 'proposals' | 'notes' | 'timeline'
type CallDraft = { lead: LuxorInquiry; task?: LuxorTask } | null
type ProfileWorkspace = { leadId: string; stage: 'tour' | 'proposal' | 'profile' } | null

function taskChannel(task: LuxorTask): Channel { return getLuxorFollowUpTaskChannel(task) }
function taskNotes(task: LuxorTask) { return (task.description ?? '').replace(/^\[follow-up:(?:email|phone)\]\s*/, '').replace(/^\[post-tour\]\s*/, '') }
function manualFollowUpDescription(channel: Channel, isPostTour: boolean, notes = '') {
  return `[follow-up:${channel}]${isPostTour ? ' [post-tour]' : ''}${notes.trim() ? ` ${notes.trim()}` : ''}`
}
function luxorDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
function luxorTime(iso: string) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) }
function luxorTimeInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.hour}:${values.minute}`
}
function luxorToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
function localLuxorIso(date: string, time: string) {
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
function stateFor(dueAt: string | null, dueDate: string | null, today: string) {
  const due = dueAt ? luxorDate(dueAt) : dueDate?.slice(0, 10)
  if (!due) return 'Upcoming'
  if (due < today) return 'Overdue'
  if (due === today) return 'Due today'
  return 'Upcoming'
}
function dateLabel(dueAt: string | null, dueDate: string | null) {
  if (dueAt) return `${luxorDate(dueAt)} · ${luxorTime(dueAt)}`
  return dueDate?.slice(0, 10) ?? 'No date'
}
function stageLabel(lead: LuxorInquiry) {
  if (lead.status === 'booked') return 'Booked'
  if (lead.status === 'closed_lost') return 'Lost / Closed'
  if (lead.metadata?.followUpStage === 'nurture') return 'Nurture'
  if (lead.tour_attendance_status === 'attended') return 'Post-Tour'
  if (lead.status === 'tour_confirmed') return 'Tour Scheduled'
  if (lead.flow === 'brochure_lead' || lead.source === 'homepage_brochure' || lead.status === 'new') return 'New Lead'
  if (lead.follow_up_disposition === 'no_response') return 'No Response'
  return lead.pipeline_stage?.replaceAll('_', ' ') || 'In Progress'
}
const FOLLOW_UP_STATUS_TONES: Record<string, PortalStatusTone> = {
  overdue: 'red',
  'due today': 'blue',
  scheduled: 'blue',
  'follow-up scheduled': 'blue',
  upcoming: 'gold',
  'needs follow-up': 'gold',
  completed: 'green',
  'follow-up completed': 'green',
  paused: 'neutral',
}
function followUpStatusTone(status: string): PortalStatusTone {
  return FOLLOW_UP_STATUS_TONES[status.trim().toLowerCase()] ?? 'neutral'
}
function followUpStageTone(stage: string): PortalStatusTone {
  const normalized = stage.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (normalized === 'new lead' || normalized === 'post tour') return 'purple'
  if (normalized === 'tour scheduled' || normalized === 'tour in progress') return 'blue'
  if (normalized === 'booked') return 'green'
  return 'neutral'
}
function isNewLead(lead: LuxorInquiry) { return lead.metadata?.followUpStage !== 'nurture' && (['brochure_lead', 'homepage_brochure'].includes(lead.flow) || lead.source === 'homepage_brochure' || lead.status === 'new') }
function isPostTour(lead: LuxorInquiry) { return lead.tour_attendance_status === 'attended' }
function isCurrentNewLead(lead: LuxorInquiry) {
  if (lead.metadata?.followUpStage === 'nurture' || isPostTour(lead)) return false
  if (['booked', 'closed_lost', 'tour_confirmed', 'proposal_sent'].includes(lead.status)) return false
  return isNewLead(lead)
}

export default function FollowUpsTab({ leads, onLeadsRefresh }: { leads: LuxorInquiry[]; onLeadsRefresh: () => Promise<void> }) {
  const { notify } = useToast()
  const [tasks, setTasks] = useState<LuxorTask[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [emailActions, setEmailActions] = useState<EmailAction[]>([])
  const [pausedEnrollmentIds, setPausedEnrollmentIds] = useState<string[]>([])
  const [pausedSequenceRecords, setPausedSequenceRecords] = useState<PausedEnrollment[]>([])
  const [sendingEnabled, setSendingEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [eventType, setEventType] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [adding, setAdding] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [newChannel, setNewChannel] = useState<Channel>('phone')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('09:00')
  const [assignee, setAssignee] = useState('')
  const [notes, setNotes] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<LuxorFollowUpTemplate[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [historyPage, setHistoryPage] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [sequence, setSequence] = useState<SequenceInfo | null>(null)
  const [sequenceActions, setSequenceActions] = useState<SequenceAction[]>([])
  const [recoveryDate, setRecoveryDate] = useState('')
  const [recoveryTime, setRecoveryTime] = useState('10:00')
  const [profileWorkspace, setProfileWorkspace] = useState<ProfileWorkspace>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [callDraft, setCallDraft] = useState<CallDraft>(null)
  const [callOutcome, setCallOutcome] = useState('')
  const [callNote, setCallNote] = useState('')
  const [nextStep, setNextStep] = useState('none')
  const [nextDate, setNextDate] = useState('')
  const [nextTime, setNextTime] = useState('10:00')
  const [nextChannel, setNextChannel] = useState<Channel>('phone')
  const [callSaving, setCallSaving] = useState(false)
  const [sequenceSaving, setSequenceSaving] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseDate, setPauseDate] = useState('')
  const [pauseReason, setPauseReason] = useState('')
  const [stopOpen, setStopOpen] = useState(false)
  const [stopReason, setStopReason] = useState('not_interested')
  const [stopDetail, setStopDetail] = useState('')
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({})
  const today = luxorToday()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [response, emailResponse] = await Promise.all([
        fetch('/api/tasks?all=1', { cache: 'no-store' }),
        fetch('/api/follow-ups?dashboard=1', { cache: 'no-store' }),
      ])
      if (!response.ok || !emailResponse.ok) throw new Error('Follow-up tasks could not be loaded.')
      const result = (await response.json()) as { tasks: LuxorTask[]; assignees: string[] }
      const emailResult = (await emailResponse.json()) as { emailActions: EmailAction[]; pausedEnrollmentIds?: string[]; pausedEnrollments?: PausedEnrollment[]; sendingEnabled: boolean }
      setTasks(result.tasks)
      setAssignees(result.assignees)
      setEmailActions(emailResult.emailActions)
      setPausedEnrollmentIds(emailResult.pausedEnrollmentIds ?? [])
      setPausedSequenceRecords(emailResult.pausedEnrollments ?? [])
      setSendingEnabled(emailResult.sendingEnabled)
      if (!assignee && result.assignees[0]) setAssignee(result.assignees[0])
    } catch (error) {
      notify({ title: 'Follow-up tasks could not be loaded', description: error instanceof Error ? error.message : 'Try again in a moment.', variant: 'error' })
    } finally { setLoading(false) }
  }, [assignee, notify])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!selectedId) { setActivity([]); setSequence(null); setSequenceActions([]); setHistoryPage(0); setHistoryHasMore(false); return }
    let active = true
    setActivity([]); setHistoryPage(0); setHistoryHasMore(false)
    fetch(`/api/follow-ups?inquiryId=${encodeURIComponent(selectedId)}&historyPage=0`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ history?: Activity[]; enrollment?: SequenceInfo | null; actions?: SequenceAction[]; hasMoreHistory?: boolean }> : Promise.reject(new Error('Could not load lead history.')))
      .then((result) => { if (active) { setActivity(result.history ?? []); setSequence(result.enrollment ?? null); setSequenceActions(result.actions ?? []); setHistoryHasMore(Boolean(result.hasMoreHistory)) } })
      .catch(() => { if (active) { setActivity([]); setSequence(null) } })
    return () => { active = false }
  }, [selectedId])

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])
  const eventTypes = useMemo(() => [...new Set(leads.map((lead) => lead.event_type).filter((value): value is string => Boolean(value)))].sort(), [leads])
  const pausedEnrollments = useMemo(() => new Set(pausedEnrollmentIds), [pausedEnrollmentIds])
  const followUpTasks = useMemo(() => tasks.filter(isLuxorFollowUpTask), [tasks])
  const completedTourLeads = useMemo(() => getCompletedTourLeads(leads), [leads])
  const rows = useMemo<FollowUpRow[]>(() => {
    const entries: Array<{ inquiryId: string; id: string; channel: Channel; title: string; dueAt: string | null; dueDate: string | null; status: string; assignee: string; task?: LuxorTask }> = [
      ...followUpTasks.filter((task) => task.status === 'pending' && !(task.automation_enrollment_id && pausedEnrollments.has(task.automation_enrollment_id))).map((task) => ({ inquiryId: task.inquiry_id, id: task.id, channel: taskChannel(task), title: task.title, dueAt: task.due_at ?? null, dueDate: task.due_date ?? null, status: stateFor(task.due_at ?? null, task.due_date ?? null, today), assignee: task.assigned_to ?? 'Unassigned', task })),
      ...emailActions.map((action) => ({ inquiryId: action.inquiry_id, id: action.id, channel: 'email' as const, title: `Email ${action.step_key.replace('email_', '#')}`, dueAt: action.scheduled_at, dueDate: null, status: stateFor(action.scheduled_at, null, today), assignee: 'Automated' })),
      ...pausedSequenceRecords.filter((item) => !emailActions.some((action) => action.inquiry_id === item.inquiry_id)).map((item) => ({ inquiryId: item.inquiry_id, id: `paused-${item.id}`, channel: 'email' as const, title: 'Brochure follow-up paused', dueAt: null, dueDate: null, status: 'Paused', assignee: 'Paused' })),
    ]
    const grouped = new Map<string, typeof entries>()
    for (const entry of entries) grouped.set(entry.inquiryId, [...(grouped.get(entry.inquiryId) ?? []), entry])
    const activityRows = [...grouped.entries()].flatMap(([inquiryId, items]) => {
      const lead = leadById.get(inquiryId)
      if (!lead) return []
      const ordered = [...items].sort((a, b) => {
        const aDate = a.dueAt ?? a.dueDate
        const bDate = b.dueAt ?? b.dueDate
        if (!aDate && bDate) return 1
        if (aDate && !bDate) return -1
        return (aDate ?? '').localeCompare(bDate ?? '')
      })
      const current = ordered[0]
      const allActivities: Activity[] = ordered.map((item) => ({ id: `next-${item.id}`, at: item.dueAt ?? item.dueDate ?? '', kind: 'follow-up', label: `${item.channel === 'phone' ? 'Phone call' : item.assignee === 'Automated' ? 'Automated email' : 'Email task'} · ${item.title}`, detail: `${item.status} · ${dateLabel(item.dueAt, item.dueDate)}${item.task && taskNotes(item.task) ? ` · ${taskNotes(item.task)}` : ''}` }))
      return [{ inquiryId, next: current, activities: allActivities }]
    })
    const postTourStatus = (inquiryId: string) => {
      return getLuxorPostTourFollowUpStatus(followUpTasks.filter((task) => task.inquiry_id === inquiryId))
    }
    const completedByLead = new Map(completedTourLeads.map((lead) => [lead.id, lead]))
    const rowsWithStatus = activityRows.map((row) => completedByLead.has(row.inquiryId) ? { ...row, postTourStatus: postTourStatus(row.inquiryId) } : row)
    const rowsByLead = new Set(activityRows.map((row) => row.inquiryId))
    const missingPostTourRows = completedTourLeads.filter((lead) => !rowsByLead.has(lead.id)).map((lead) => ({
      inquiryId: lead.id,
      next: { id: `post-tour-${lead.id}`, channel: 'email' as const, title: 'Post-Tour Follow-Up', dueAt: null, dueDate: null, status: postTourStatus(lead.id), assignee: 'Unassigned' },
      activities: [{ id: `post-tour-${lead.id}-activity`, at: lead.preferred_tour_date || '', kind: 'follow-up' as const, label: 'Completed tour', detail: `Tour date: ${lead.preferred_tour_date || 'Not recorded'}${lead.preferred_tour_time ? ` · ${lead.preferred_tour_time}` : ''}` }],
      postTourStatus: postTourStatus(lead.id),
    }))
    return [...rowsWithStatus, ...missingPostTourRows].sort((a, b) => (a.next.dueAt ?? a.next.dueDate ?? '').localeCompare(b.next.dueAt ?? b.next.dueDate ?? ''))
  }, [followUpTasks, emailActions, leadById, pausedEnrollmentIds, pausedSequenceRecords, today, completedTourLeads])
  const visibleRows = useMemo(() => rows.filter((row) => {
    const lead = leadById.get(row.inquiryId)!
    const search = `${lead.full_name} ${lead.email ?? ''} ${lead.phone ?? ''} ${row.activities.map((item) => item.label).join(' ')}`.toLowerCase()
    return search.includes(query.toLowerCase()) && (eventType === 'all' || lead.event_type === eventType)
      && (filter !== 'new' || isCurrentNewLead(lead)) && (filter !== 'post_tour' || isPostTour(lead))
      && (filter !== 'overdue' || row.next.status === 'Overdue')
  }), [rows, leadById, query, eventType, filter])
  const selected = selectedId ? leadById.get(selectedId) : undefined
  const getStageLabel = (lead: LuxorInquiry) => stageOverrides[lead.id] || stageLabel(lead)
  const selectedTasks = selectedId ? followUpTasks.filter((task) => task.inquiry_id === selectedId) : []
  const selectedHistory = useMemo(() => [
    ...activity,
    ...selectedTasks.map((task) => ({ id: `task-${task.id}`, at: task.completed_at || task.due_at || task.due_date || task.created_at, kind: taskChannel(task) === 'phone' ? 'call' as const : 'follow-up' as const, label: `${task.title} · ${task.status}${task.call_outcome ? ` · ${task.call_outcome.replaceAll('_', ' ')}` : ''}`, detail: taskNotes(task) })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [activity, selectedTasks])
  const stats = [
    { label: 'Due Today', value: rows.filter((row) => row.next.status === 'Due today').length, tone: 'blue' },
    { label: 'Overdue', value: rows.filter((row) => row.next.status === 'Overdue').length, tone: 'red' },
    { label: 'Upcoming', value: rows.filter((row) => row.next.status === 'Upcoming').length, tone: 'gold' },
  ]

  async function openTemplateSettings() {
    const response = await fetch('/api/follow-ups', { cache: 'no-store' })
    if (!response.ok) { notify({ title: 'Templates could not be loaded', variant: 'error' }); return }
    const data = await response.json() as { templates: LuxorFollowUpTemplate[] }
    setTemplates(data.templates); setSettingsOpen(true)
  }
  function changeTemplate(id: string, field: keyof LuxorFollowUpTemplate, value: string | boolean | number | null) { setTemplates((current) => current.map((template) => template.id === id ? { ...template, [field]: value } : template)) }
  async function saveTemplate(template: LuxorFollowUpTemplate) {
    const response = await fetch('/api/follow-ups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: template.id, updates: { name: template.name, subject: template.subject, body: template.body, cta_text: template.cta_text, cta_url: template.cta_url, secondary_cta_text: template.secondary_cta_text, secondary_cta_url: template.secondary_cta_url, delay_days: template.delay_days, active: template.active } }) })
    if (!response.ok) { notify({ title: 'Template could not be saved', variant: 'error' }); return }
    notify({ title: 'Follow-up template saved', description: 'Saving templates does not activate or change enrollment.', variant: 'success' })
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!leadId || !title.trim() || !dueDate || !dueTime) return
    const isPostTour = leadById.get(leadId)?.tour_attendance_status === 'attended'
    const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: leadId, title: title.trim(), description: manualFollowUpDescription(newChannel, isPostTour, notes), dueDate, dueAt: localLuxorIso(dueDate, dueTime), assignedTo: assignee || undefined, priority: 'medium' }) })
    if (!response.ok) { notify({ title: 'The follow-up could not be saved', variant: 'error' }); return }
    setAdding(false); setTitle(''); setNotes(''); setDueDate(''); setLeadId('')
    notify({ title: `${newChannel === 'phone' ? 'Phone' : 'Email'} follow-up task added`, description: 'No call or email was sent.', variant: 'success' })
    await refresh()
  }

  async function loadHistory(inquiryId: string, page = 0, append = false) {
    const response = await fetch(`/api/follow-ups?inquiryId=${encodeURIComponent(inquiryId)}&historyPage=${page}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load lead history.')
    const result = await response.json() as { history?: Activity[]; enrollment?: SequenceInfo | null; actions?: SequenceAction[]; hasMoreHistory?: boolean }
    if (selectedIdRef.current !== inquiryId) return
    setActivity((current) => {
      if (!append) return result.history ?? []
      const existingIds = new Set(current.map((item) => item.id))
      return [...current, ...(result.history ?? []).filter((item) => !existingIds.has(item.id))]
    })
    setSequence(result.enrollment ?? null)
    setSequenceActions(result.actions ?? [])
    setHistoryPage(page)
    setHistoryHasMore(Boolean(result.hasMoreHistory))
  }

  async function addNote(inquiryId: string, content: string, noteType = 'note', taskId?: string) {
    const response = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, content, noteType, taskId }) })
    if (!response.ok) throw new Error('The note could not be saved.')
    await loadHistory(inquiryId)
  }

  function resetCallDraft() {
    setCallDraft(null); setCallOutcome(''); setCallNote(''); setNextStep('none'); setNextDate(''); setNextTime('10:00'); setNextChannel('phone')
  }

  function pendingPhoneTask(inquiryId: string) {
    return followUpTasks.filter((task) => task.inquiry_id === inquiryId && task.status === 'pending' && taskChannel(task) === 'phone').sort((a, b) => {
      const aDate = a.due_at ?? a.due_date ?? ''
      const bDate = b.due_at ?? b.due_date ?? ''
      return aDate.localeCompare(bDate) || a.id.localeCompare(b.id)
    })[0]
  }

  function logCall(lead: LuxorInquiry, task?: LuxorTask) {
    if (!lead.phone) { notify({ title: 'No phone number on this lead', variant: 'warning' }); return }
    resetCallDraft()
    setCallDraft({ lead, task })
  }

  function openLeadWorkspace(lead: LuxorInquiry, stage: 'tour' | 'proposal' | 'profile') {
    setProfileWorkspace({ leadId: lead.id, stage })
  }

  async function closeLeadWorkspace() {
    const inquiryId = profileWorkspace?.leadId
    setProfileWorkspace(null)
    await onLeadsRefresh()
    await refresh()
    if (inquiryId) await loadHistory(inquiryId).catch(() => {})
  }

  function selectLead(inquiryId: string) {
    if (callDraft && callDraft.lead.id !== inquiryId) resetCallDraft()
    setMoreOpen(false)
    setSelectedId(inquiryId)
  }

  function openAddTask(inquiryId: string) {
    setLeadId(inquiryId)
    setTitle(''); setNotes(''); setDueDate(''); setDueTime('09:00'); setNewChannel('phone')
    setAdding(true)
  }

  async function updateTask(task: LuxorTask, outcome: string, note: string, step: string, nextAt: string | null, suppressResponse = false) {
    if (busyId === task.id) return
    setBusyId(task.id)
    try {
    const mapped = outcome === 'no_answer' ? 'no_answer' : outcome === 'voicemail_left' ? 'voicemail_left' : 'reached'
    const patch = buildFollowUpTaskPatch({ status: 'completed', outcome: mapped, channel: taskChannel(task), completedAt: new Date().toISOString() })
    const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, ...patch }) })
    if (!response.ok) throw new Error('The call task could not be updated.')
    if (mapped === 'reached' && !suppressResponse) {
      const result = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: task.inquiry_id, action: 'response' }) })
      if (!result.ok) throw new Error('Call saved, but the response could not be recorded.')
    }
    await addNote(task.inquiry_id, `Manual call outcome: ${outcome.replaceAll('_', ' ')}.${note.trim() ? ` ${note.trim()}` : ''}`, 'status_change', task.id)
    if (step === 'later' && nextAt) {
      const date = luxorDate(nextAt)
      const isPostTour = leadById.get(task.inquiry_id)?.tour_attendance_status === 'attended'
      const followUp = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: task.inquiry_id, title: 'Follow up after call', description: manualFollowUpDescription(nextChannel, isPostTour), dueDate: date, dueAt: nextAt, assignedTo: assignee || undefined, priority: 'medium' }) })
      if (!followUp.ok) throw new Error('Call saved, but the next follow-up could not be scheduled.')
    }
    await refresh()
    } catch (error) { throw error }
    finally { setBusyId(null) }
  }

  async function changeAssignee(task: LuxorTask, assignedTo: string) {
    if (busyId === task.id) return
    setBusyId(task.id)
    try {
      const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, assigned_to: assignedTo || null }) })
      if (!response.ok) throw new Error('Assignment could not be saved.')
      await refresh()
    } catch (error) { notify({ title: 'Assignment could not be saved', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' }) }
    finally { setBusyId(null) }
  }

  async function changeManualTask(task: LuxorTask, action: 'complete' | 'skip' | 'reschedule', date?: string) {
    if (busyId === task.id) return
    if (action === 'complete' && taskChannel(task) === 'phone') {
      const lead = leadById.get(task.inquiry_id)
      if (lead) logCall(lead, task)
      return
    }
    setBusyId(task.id)
    try {
      const patch = action === 'reschedule' && date
        ? buildFollowUpTaskPatch({ status: 'cancelled', dueDate: date, dueAt: localLuxorIso(date, task.due_at ? luxorTimeInput(task.due_at) : '09:00'), channel: taskChannel(task), completedAt: new Date().toISOString() })
        : buildFollowUpTaskPatch({ status: action === 'complete' ? 'completed' : 'cancelled', channel: taskChannel(task), completedAt: new Date().toISOString() })
      const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, ...patch }) })
      if (!response.ok) throw new Error('The follow-up task could not be updated.')
      await refresh()
    } catch (error) { notify({ title: 'The follow-up task could not be updated', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' }) }
    finally { setBusyId(null) }
  }

  async function saveCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!callDraft || !callOutcome) return
    setCallSaving(true)
    let callOutcomeSaved = false
    let declineSaved = false
    try {
      if (callOutcome === 'not_interested') {
        const decline = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: callDraft.lead.id, action: 'disposition', disposition: 'not_interested', reason: 'Manual call outcome' }) })
        if (!decline.ok) throw new Error('The lead’s decline could not be saved; no call outcome was recorded.')
        declineSaved = true
      }
      if (callDraft.task) await updateTask(callDraft.task, callOutcome, callNote, callOutcome === 'not_interested' ? 'none' : nextStep, callOutcome !== 'not_interested' && nextStep === 'later' && nextDate ? localLuxorIso(nextDate, nextTime) : null, callOutcome === 'not_interested')
      else {
        await addNote(callDraft.lead.id, `Manual call outcome: ${callOutcome.replaceAll('_', ' ')}.${callNote.trim() ? ` ${callNote.trim()}` : ''}`, 'status_change')
      }
      if (!callDraft.task && !['no_answer', 'not_interested'].includes(callOutcome)) {
        const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: callDraft.lead.id, action: 'response' }) })
        if (!response.ok) throw new Error('Call outcome saved, but the response could not be recorded.')
      }
      callOutcomeSaved = true
      if (callOutcome === 'not_interested') {
        await addNote(callDraft.lead.id, 'Lead declined further contact after a manual call. The active brochure sequence was stopped.', 'status_change')
      }
      if (callOutcome !== 'not_interested' && nextStep === 'later' && !callDraft.task && nextDate) {
        const isPostTour = callDraft.lead.tour_attendance_status === 'attended'
        const followUp = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: callDraft.lead.id, title: 'Follow up after call', description: manualFollowUpDescription(nextChannel, isPostTour), dueDate: nextDate, dueAt: localLuxorIso(nextDate, nextTime), assignedTo: assignee || undefined, priority: 'medium' }) })
        if (!followUp.ok) throw new Error('Call note saved, but the next follow-up could not be scheduled.')
      }
      if (callOutcome !== 'not_interested' && nextStep === 'stop') {
        const sequenceResponse = await fetch(`/api/follow-ups?inquiryId=${encodeURIComponent(callDraft.lead.id)}`, { cache: 'no-store' })
        if (!sequenceResponse.ok) throw new Error('Call outcome saved, but sequence status could not be confirmed. Retry stopping from the lead workspace.')
        const leadSequence = (await sequenceResponse.json() as { enrollment?: SequenceInfo | null }).enrollment
        if (leadSequence && ['active', 'paused'].includes(leadSequence.status)) {
          const stop = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: callDraft.lead.id, action: 'stop', stopReason: 'manual_stop' }) })
          if (!stop.ok) throw new Error('Call saved, but the sequence could not be stopped.')
          await addNote(callDraft.lead.id, 'Brochure follow-up stopped after a manual call. Reason: no further follow-up.', 'status_change')
        }
      }
      if (callOutcome !== 'not_interested' && nextStep === 'nurture' && !await moveToNurture(callDraft.lead.id)) throw new Error('Call saved, but the lead could not be moved to Nurture.')
      notify({ title: 'Call outcome saved', description: nextStep === 'later' ? 'The dated manual follow-up was added; sequence timing was not changed.' : 'The call note is saved to this lead’s timeline.', variant: 'success' })
      const completedLead = callDraft.lead
      resetCallDraft()
      await refresh()
      if (nextStep === 'tour' || nextStep === 'proposal') openLeadWorkspace(completedLead, nextStep)
      if (nextStep === 'thank_you') composeEmail(completedLead)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again in a moment.'
      notify({ title: callOutcomeSaved && nextStep === 'stop' ? 'Call outcome saved; sequence status unknown' : declineSaved ? 'Decline saved; call outcome needs retry' : 'Call outcome was not fully saved', description: message, variant: 'error' })
    }
    finally { setCallSaving(false) }
  }

  function dial(lead: LuxorInquiry, task?: LuxorTask) {
    if (!lead.phone) { notify({ title: 'No phone number on this lead', variant: 'warning' }); return }
    startLuxorBrowserCall({ phoneNumber: lead.phone, contactName: lead.full_name, inquiryId: lead.id })
    logCall(lead, task ?? pendingPhoneTask(lead.id))
  }
  function composeEmail(lead: LuxorInquiry) {
    if (!lead.email) { notify({ title: 'No email address on this lead', variant: 'warning' }); return }
    window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } }))
  }
  async function controlSequence(inquiryId: string, action: 'pause' | 'resume' | 'stop', reason?: string, detail?: string, date?: string) {
    if (sequenceSaving) return false
    setSequenceSaving(true)
    try {
      const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, action, stopReason: reason, reasonText: detail, resumeDate: date }) })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        notify({ title: 'Follow-up status could not be updated', description: body.error || 'Try again in a moment.', variant: 'error' }); return false
      }
      const result = await response.json() as { status: SequenceInfo['status'] }
      if (selectedIdRef.current === inquiryId) setSequence((current) => current ? { ...current, status: result.status, ended_reason: action === 'stop' ? reason ?? 'manual_stop' : current.ended_reason } : current)
      await refresh()
      return true
    } catch (error) {
      notify({ title: 'Follow-up status could not be updated', description: error instanceof Error ? error.message : 'Try again in a moment.', variant: 'error' })
      return false
    } finally { setSequenceSaving(false) }
  }
  async function savePause(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const ok = await controlSequence(selected.id, 'pause', undefined, pauseReason, pauseDate)
    if (!ok) return
    try {
      const resumeCopy = pauseDate ? ` Resume review date: ${pauseDate}.` : ''
      await addNote(selected.id, `Brochure follow-up paused.${pauseReason ? ` Reason: ${pauseReason}.` : ''}${resumeCopy} Remaining approved brochure steps keep their original schedule; no new timing or catch-up steps were applied.`, 'status_change')
      if (pauseDate) {
        const task = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: selected.id, title: 'Review paused follow-up', description: '[follow-up:phone] Review the pause and resume manually if appropriate. Automated sequence remains paused.', dueDate: pauseDate, dueAt: localLuxorIso(pauseDate, '09:00'), assignedTo: assignee || undefined, priority: 'medium' }) })
        if (!task.ok) throw new Error('Pause saved, but the manual review reminder could not be created.')
      }
      setPauseOpen(false); setPauseDate(''); setPauseReason('')
      notify({ title: 'Follow-Ups paused', description: pauseDate ? 'A manual review reminder was added for the selected date. Resume remains a human action.' : 'Existing brochure messages and reminders are paused.', variant: 'success' })
    } catch (error) { notify({ title: 'Pause saved with a reminder issue', description: error instanceof Error ? error.message : 'The note could not be saved.', variant: 'warning' }) }
  }
  async function saveStop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const ok = await controlSequence(selected.id, 'stop', stopReason, stopDetail)
    if (!ok) return
    try { await addNote(selected.id, `Brochure follow-up stopped. Reason: ${stopReason.replaceAll('_', ' ')}.${stopDetail.trim() ? ` ${stopDetail.trim()}` : ''} The lead record and prior history were preserved.`, 'status_change') }
    catch { notify({ title: 'Sequence stopped; reason note could not be saved', variant: 'warning' }) }
    setStopOpen(false); setStopDetail('')
    notify({ title: 'Follow-Ups stopped', description: 'Pending sequence steps were canceled. The lead and its history remain.', variant: 'success' })
  }
  async function resumeSequence() {
    if (!selected) return
    const ok = await controlSequence(selected.id, 'resume')
    if (ok) {
      try { await addNote(selected.id, 'Brochure follow-up resumed manually. Remaining steps retain their originally approved schedule; no overdue email burst was created.', 'status_change') }
      catch { /* Existing sequence state has already been updated. */ }
      notify({ title: 'Follow-Ups resumed', description: 'Existing steps retain their original schedule.', variant: 'success' })
    }
  }
  async function recoverOverdue(item: SequenceAction, decision: 'skip' | 'reschedule') {
    if (!selected || !sequence || sequence.status !== 'paused') return
    const scheduledAt = decision === 'reschedule' && recoveryDate ? localLuxorIso(recoveryDate, recoveryTime) : undefined
    const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: selected.id, action: 'recover_overdue', enrollmentId: item.enrollment_id, itemId: item.id, stepKey: item.step_key, decision, scheduledAt }) })
    if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; notify({ title: 'Overdue email was not changed', description: result.error || 'Try again after refreshing.', variant: 'error' }); return }
    await loadHistory(selected.id)
    notify({ title: decision === 'skip' ? 'Overdue email skipped' : 'Overdue email rescheduled', description: 'The sequence remains paused until you explicitly resume it.', variant: 'success' })
  }
  async function moveToNurture(inquiryId: string) {
    const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, action: 'nurture' }) })
    if (!response.ok) { notify({ title: 'Lead could not be moved to Nurture', variant: 'error' }); return false }
    setStageOverrides((current) => ({ ...current, [inquiryId]: 'Nurture' }))
    if (selectedIdRef.current === inquiryId) setSequence((current) => current ? { ...current, status: 'stopped', ended_reason: 'manual_stop' } : current)
    await refresh()
      notify({ title: 'Lead marked Nurture', description: 'The active brochure sequence was stopped. This is a status only; no nurture messages were enrolled or sent.', variant: 'success' })
    return true
  }

  return <section className="portal-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-1 text-[color:var(--portal-text)]">
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-4 py-3 text-sm"><div className="flex items-start gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0 text-[#caa24c]" /><p><strong>{sendingEnabled ? 'Automated brochure follow-up is on.' : 'Automated brochure follow-up is off.'}</strong> This status covers only consented brochure leads. Calls remain manual. Texting is unavailable. Replies are not matched automatically; staff must record them on the lead.</p></div></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-2xl text-[color:var(--portal-text)]">Follow-Ups</h2><PortalButton variant="ghost" onClick={() => void openTemplateSettings()}><Settings2 size={15} /> Edit brochure templates</PortalButton></div>
    {settingsOpen && <section className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">Brochure sequence templates</h3><p className="text-xs text-[color:var(--portal-muted)]">Saving does not expand consent, enrollment or send approval.</p></div><PortalButton variant="ghost" onClick={() => setSettingsOpen(false)}>Close</PortalButton></div>{templates.map((template) => <article key={template.id} className="grid gap-3 border-t border-[color:var(--portal-border)] pt-3 md:grid-cols-[minmax(12rem,0.7fr)_minmax(18rem,1.3fr)]"><div><div className="font-medium">{template.name}</div><div className="mt-1 text-xs text-[color:var(--portal-muted)]">{template.channel === 'email' ? 'Email' : 'Manual phone task'} · day {template.delay_days}</div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={template.active} onChange={(event) => changeTemplate(template.id, 'active', event.target.checked)} /> Template active</label><label className="mt-2 block text-xs">Day offset<input type="number" min="0" max="365" value={template.delay_days} onChange={(event) => changeTemplate(template.id, 'delay_days', Number(event.target.value))} className="mt-1 w-24 rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1" /></label><div className="mt-3 flex gap-2"><PortalButton size="sm" onClick={() => void saveTemplate(template)}>Save</PortalButton><PortalButton size="sm" variant="ghost" onClick={() => setPreviewId(previewId === template.id ? null : template.id)}><Eye size={14} /> Preview</PortalButton></div></div><div className="space-y-2">{template.channel === 'email' && <label className="block text-xs">Subject<input value={template.subject ?? ''} onChange={(event) => changeTemplate(template.id, 'subject', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label>}<label className="block text-xs">Body<textarea value={template.body ?? ''} onChange={(event) => changeTemplate(template.id, 'body', event.target.value)} rows={3} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label>{template.channel === 'email' && <div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">CTA label<input value={template.cta_text ?? ''} onChange={(event) => changeTemplate(template.id, 'cta_text', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label><label className="block text-xs">CTA link<input value={template.cta_url ?? ''} onChange={(event) => changeTemplate(template.id, 'cta_url', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label></div>}{previewId === template.id && <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm"><strong>{template.subject}</strong><p className="mt-2 whitespace-pre-wrap">{template.body}</p><span className="mt-2 inline-block text-xs">{template.cta_text} {template.cta_url}</span></div>}</div></article>)}</section>}

    <div className="grid grid-cols-3 gap-2">{stats.map((stat) => <div key={stat.label} className={`portal-card-surface rounded-xl px-4 py-3 shadow-none ${stat.tone === 'red' ? 'border-rose-300 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-500/10' : stat.tone === 'blue' ? 'border-sky-300 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-500/10' : stat.tone === 'gold' ? 'border-[#dfc98f] bg-[#fbf5e7] dark:border-[#caa24c]/35 dark:bg-[#caa24c]/10' : ''}`}><div className="text-2xl font-semibold">{stat.value}</div><div className="text-xs text-[color:var(--portal-muted)]">{stat.label}</div></div>)}</div>
    <div className="flex flex-col gap-3"><div className="flex flex-wrap items-center gap-2"><div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2"><Search size={15} className="text-[color:var(--portal-muted)]" /><input aria-label="Search leads or follow-ups" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads or follow-ups" className="w-full bg-transparent text-sm outline-none" /></div><PortalSelect value={eventType} onChange={setEventType} options={[{ value: 'all', label: 'All event types' }, ...eventTypes.map((value) => ({ value, label: value }))]} /></div><div className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap gap-2" role="group" aria-label="Filter leads">{([{ id: 'all', label: 'All' }, { id: 'new', label: 'New Leads' }, { id: 'post_tour', label: 'Post-Tour' }, { id: 'overdue', label: 'Overdue' }] as const).map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 rounded-full border px-4 text-xs font-semibold transition ${filter === item.id ? 'border-[#a8792f] bg-[#a8792f] text-white' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] hover:border-[#caa24c]/60'}`}>{item.label}</button>)}</div><div className="ml-auto"><PortalButton onClick={() => { if (leads[0]) openAddTask(leads[0].id) }}><Plus size={15} /> Add Follow-Up</PortalButton></div></div></div>

    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(21rem,0.85fr)]">
      <div className="space-y-3">
        {visibleRows.map((row) => {
          const lead = leadById.get(row.inquiryId)!
          const state = row.next.status
          const stage = getStageLabel(lead)
          const stageTone = followUpStageTone(stage)
          return (
            <LuxorCrmRecordCard
              key={row.inquiryId}
              lead={lead}
              avatar={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/15 font-serif text-lg text-[#8c6529]">{lead.full_name.slice(0, 1).toUpperCase()}</span>}
              badges={[{ label: stage, tone: stageTone }]}
              subtitle={<>{lead.event_type || 'Event not specified'} · {lead.target_date || 'Date not set'}{lead.guest_count ? ` · ${lead.guest_count} guests` : ''}</>}
              onOpen={() => { selectLead(row.inquiryId); setDetailTab('overview') }}
              className={`cursor-pointer ${state === 'Overdue' ? 'border-rose-300 dark:border-rose-400/40' : ''}`}
              contentColumn
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${state === 'Overdue' ? 'text-red-700 dark:text-red-300' : 'text-[color:var(--portal-text)]'}`}>
                    {row.next.channel === 'phone' ? <Phone size={14} /> : <Mail size={14} />}{row.next.title}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"><PortalStatusBadge status={state} tone={followUpStatusTone(state)} /><span className="font-medium text-[color:var(--portal-muted)]">· {dateLabel(row.next.dueAt, row.next.dueDate)}</span></p>
                  {row.postTourStatus && <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"><PortalStatusBadge status={row.postTourStatus} tone={followUpStatusTone(row.postTourStatus)} /><span className="font-medium text-[color:var(--portal-muted)]">· Tour {lead.preferred_tour_date || 'date not recorded'}{lead.preferred_tour_time ? ` at ${lead.preferred_tour_time}` : ''}</span></p>}
                </div>
                <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  {row.next.channel === 'phone' && <button type="button" onClick={() => dial(lead, row.next.task)} disabled={!lead.phone} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white transition hover:bg-[#916825] disabled:cursor-not-allowed disabled:opacity-50"><Phone size={14} /> Call</button>}
                  {row.next.channel === 'email' && row.next.assignee !== 'Automated' && <button type="button" onClick={() => composeEmail(lead)} disabled={!lead.email} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white disabled:opacity-50"><Mail size={14} /> Email</button>}
                  {row.next.channel === 'email' && row.next.assignee === 'Automated' && <button type="button" onClick={() => { selectLead(lead.id); setDetailTab('timeline') }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white"><Eye size={14} /> View</button>}
                  <button type="button" onClick={() => { selectLead(lead.id); setDetailTab('overview') }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold"><Eye size={14} /> View</button>
                  <button type="button" aria-label={`More actions for ${lead.full_name}`} onClick={() => { selectLead(lead.id); setMoreOpen((value) => !value) }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--portal-border)]"><MoreHorizontal size={16} /></button>
                </div>
              </div>
            </LuxorCrmRecordCard>
          )
        })}
        {!visibleRows.length && <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-12 text-center text-sm text-[color:var(--portal-muted)]">{loading ? 'Loading follow-ups…' : filter === 'post_tour' ? 'No completed tours match these filters.' : 'No matching follow-up leads. Add a task to keep the next step with its lead.'}</div>}
      </div>

      <aside className="min-h-[28rem] overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
        {selected ? <>
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3"><div><h2 className="font-serif text-xl">{selected.full_name}</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{selected.event_type ?? 'Event not specified'} · {selected.target_date ?? 'Date not set'}</p><span className="mt-2 inline-flex rounded-full bg-[#caa24c]/15 px-3 py-1 text-[11px] font-semibold text-[#8c6529] dark:text-[#f1d27a]">{getStageLabel(selected)}</span></div><button type="button" aria-label="Close lead workspace" onClick={() => { setSelectedId(null); setMoreOpen(false); resetCallDraft() }} className="rounded-lg border border-[color:var(--portal-border)] p-2"><X size={15} /></button></div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => dial(selected)} disabled={!selected.phone} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#a8792f] px-3 text-xs font-semibold text-white disabled:opacity-50"><Phone size={14} /> Call</button><button type="button" onClick={() => composeEmail(selected)} disabled={!selected.email} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold disabled:opacity-50"><Mail size={14} /> Email</button><button type="button" disabled title="Texting is not available" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold opacity-45"><MessageSquare size={14} /> Text (Soon)</button><button type="button" onClick={() => setMoreOpen((value) => !value)} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs"><MoreHorizontal size={14} /> More</button></div>
          <nav className="mt-4 flex overflow-x-auto border-b border-[color:var(--portal-border)]" role="tablist" aria-label="Lead workspace sections">{([{id:'overview',label:'Overview'},{id:'event',label:'Event Details'},{id:'proposals',label:'Proposals'},{id:'notes',label:'Notes'},{id:'timeline',label:'Timeline'}] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={detailTab === tab.id} onClick={() => setDetailTab(tab.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${detailTab === tab.id ? 'border-[#caa24c] text-[#8c6529] dark:text-[#f1d27a]' : 'border-transparent text-[color:var(--portal-muted)]'}`}>{tab.label}</button>)}</nav>
          {detailTab === 'overview' && <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><DetailItem icon={<Phone size={13} />} label="Phone" value={selected.phone ? formatPhoneDisplay(selected.phone) : 'Not provided'} /><DetailItem icon={<Mail size={13} />} label="Email" value={selected.email || 'Not provided'} /><DetailItem icon={<MapPin size={13} />} label="Location" value={typeof selected.metadata?.location === 'string' ? selected.metadata.location : 'Not provided'} /><DetailItem icon={<CalendarClock size={13} />} label="Event date" value={selected.target_date || 'Not set'} /><DetailItem icon={<UserRound size={13} />} label="Guest count" value={selected.guest_count ? String(selected.guest_count) : 'Not provided'} /><DetailItem icon={<FileText size={13} />} label="Event type" value={selected.event_type || 'Not specified'} /><DetailItem icon={<FileText size={13} />} label="Budget" value={selected.budget || 'Not provided'} /><DetailItem icon={<UserRound size={13} />} label="Lead source" value={selected.source.replaceAll('_', ' ')} /></div><div className="rounded-lg border border-[color:var(--portal-border)] p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Current status</div><p className="mt-1 text-sm font-semibold">{getStageLabel(selected)}</p><div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Current next step</div><p className="mt-1 text-sm">{rows.find((row) => row.inquiryId === selected.id)?.next.title ?? 'No pending follow-up'}{rows.find((row) => row.inquiryId === selected.id) && <span className="ml-2 text-xs text-[color:var(--portal-muted)]">{dateLabel(rows.find((row) => row.inquiryId === selected.id)!.next.dueAt, rows.find((row) => row.inquiryId === selected.id)!.next.dueDate)}</span>}</p></div><div className="grid grid-cols-2 gap-2"><QuickAction onClick={() => openAddTask(selected.id)} icon={<CalendarClock size={15} />} label="Add Follow-Up" /><QuickAction onClick={() => { openLeadWorkspace(selected, 'tour') }} icon={<CalendarClock size={15} />} label="Schedule Tour" /><QuickAction onClick={() => { openLeadWorkspace(selected, 'proposal') }} icon={<FileText size={15} />} label="Send Proposal" /><QuickAction onClick={() => { setDetailTab('notes') }} icon={<FileText size={15} />} label="Add Note" /><QuickAction onClick={() => logCall(selected, pendingPhoneTask(selected.id))} disabled={!selected.phone} icon={<Phone size={15} />} label="Log Call" /><QuickAction onClick={() => setPauseOpen(true)} icon={<Pause size={15} />} label="Pause Follow-Up" /></div><div className="rounded-lg border border-[color:var(--portal-border)] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">Brochure follow-up</strong><span className="text-xs text-[color:var(--portal-muted)]">{sequence?.status ?? 'not enrolled'}</span></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{sequence?.response_received_at ? 'Response recorded.' : 'Only approved brochure enrollment is managed here.'}</p>{sequence?.status === 'paused' && sequenceActions.filter((item) => item.channel === 'email' && ['scheduled', 'email_queued'].includes(item.status) && new Date(item.scheduled_at).getTime() <= Date.now()).map((item) => <div key={item.id} className="mt-3 rounded-lg border border-amber-400/40 bg-amber-50/50 p-3 dark:bg-amber-950/10"><p className="text-xs font-semibold">Overdue {item.step_key.replaceAll('_', ' ')} · {dateLabel(item.scheduled_at, null)}</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><div className="grid grid-cols-[1fr_7rem] gap-2"><PortalDatePicker value={recoveryDate} onChange={setRecoveryDate} placeholder="Choose future date" minDate={today} /><input aria-label="New email send time" type="time" value={recoveryTime} onChange={(event) => setRecoveryTime(event.target.value)} className="h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 text-sm" /></div><div className="flex gap-2"><PortalButton size="sm" variant="ghost" disabled={item.step_key === 'email_5'} onClick={() => void recoverOverdue(item, 'skip')}>Skip</PortalButton><PortalButton size="sm" disabled={!recoveryDate || (recoveryDate === today && recoveryTime <= luxorTimeInput(new Date().toISOString()))} onClick={() => void recoverOverdue(item, 'reschedule')}>Reschedule</PortalButton></div></div><p className="mt-2 text-[10px] text-[color:var(--portal-muted)]">{item.step_key === 'email_5' ? 'The final approved email cannot be skipped. Reschedule it or stop the sequence with a reason.' : 'Choose a future time explicitly. Rescheduling changes only this queued email; the sequence stays paused.'}</p></div>) }<div className="mt-3 flex flex-wrap gap-2">{sequence?.status === 'active' && <PortalButton size="sm" variant="ghost" onClick={() => setPauseOpen(true)}>Pause Follow-Ups</PortalButton>}{sequence?.status === 'paused' && <PortalButton size="sm" onClick={() => void resumeSequence()}>Resume Follow-Ups</PortalButton>}{(sequence?.status === 'active' || sequence?.status === 'paused') && <PortalButton size="sm" variant="ghost" onClick={() => setStopOpen(true)}>Stop Follow-Ups</PortalButton>}{(sequence?.status === 'active' || sequence?.status === 'paused' || (sequence?.status === 'completed' && sequence.ended_reason === 'day_30_no_response')) && !sequence.response_received_at && <PortalButton size="sm" variant="ghost" onClick={async () => { const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: selected.id, action: 'response' }) }); if (!response.ok) { notify({ title: 'Response could not be recorded', variant: 'error' }); return } const result = await response.json() as { recorded: boolean }; if (result.recorded) { setSequence((current) => current ? { ...current, response_received_at: new Date().toISOString(), ended_reason: current.status === 'completed' ? 'day_30_complete_after_response' : current.ended_reason } : current); await addNote(selected.id, 'Lead response recorded manually.', 'status_change') } }}>Record response</PortalButton>}</div></div></div>}
          {detailTab === 'event' && <div className="mt-4 space-y-3"><h3 className="font-serif text-lg">Event details</h3><DetailLine label="Type" value={selected.event_type || 'Not specified'} /><DetailLine label="Date" value={selected.target_date || 'Not set'} /><DetailLine label="Guests" value={selected.guest_count ? String(selected.guest_count) : 'Not provided'} /><DetailLine label="Budget" value={selected.budget || 'Not provided'} /><DetailLine label="Tour status" value={selected.tour_attendance_status?.replaceAll('_', ' ') || (selected.preferred_tour_date ? 'Scheduled' : 'No tour scheduled')} /><DetailLine label="Tour time" value={[selected.preferred_tour_date, selected.preferred_tour_time].filter(Boolean).join(' · ') || 'Not set'} />{selected.message && <div className="rounded-lg border border-[color:var(--portal-border)] p-3"><div className="text-xs font-semibold text-[color:var(--portal-muted)]">Original inquiry</div><p className="mt-1 whitespace-pre-wrap text-sm">{selected.message}</p></div>}<button type="button" onClick={() => openLeadWorkspace(selected, 'tour')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#caa24c]/40 px-3 text-xs font-semibold text-[#8c6529] dark:text-[#f1d27a]">Open tour controls <ChevronRight size={14} /></button></div>}
          {detailTab === 'proposals' && <div className="mt-4 space-y-3"><h3 className="font-serif text-lg">Proposals</h3><p className="text-sm text-[color:var(--portal-muted)]">Proposal versions, pricing, previews, and approved send controls remain in this lead’s existing proposal workspace.</p><button type="button" onClick={() => openLeadWorkspace(selected, 'proposal')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-semibold text-white"><FileText size={14} /> Open proposals and edit</button><p className="text-xs text-[color:var(--portal-muted)]">Sending remains a separate human action with the existing delivery review.</p></div>}
          {detailTab === 'notes' && <NotesPanel key={selected.id} lead={selected} history={selectedHistory} onSave={(content) => addNote(selected.id, content)} />}
          {detailTab === 'timeline' && <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-serif text-lg">Follow-Up Timeline</h3><span className="text-xs text-[color:var(--portal-muted)]">Chronological record</span></div>
            {selectedTasks.length > 0 && <section className="space-y-2" aria-label="Follow-up task controls">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Tasks</h4>
              {selectedTasks.map((task) => {
                const isPausedAutomationTask = Boolean(task.automation_enrollment_id && pausedEnrollmentIds.includes(task.automation_enrollment_id))
                return <article key={task.id} className="rounded-lg border border-[color:var(--portal-border)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="font-medium">{taskChannel(task) === 'email' ? <Mail className="mr-1 inline" size={14} /> : <Phone className="mr-1 inline" size={14} />}{task.title}</div><span className="text-xs text-[color:var(--portal-muted)]">{isPausedAutomationTask ? 'Paused sequence task' : stateFor(task.due_at ?? null, task.due_date ?? null, today)} · {dateLabel(task.due_at ?? null, task.due_date ?? null)}</span></div>
                  <div className="mt-2 max-w-64"><PortalSelect value={task.assigned_to ?? ''} onChange={(value) => void changeAssignee(task, value)} disabled={busyId === task.id || isPausedAutomationTask} options={[{ value: '', label: 'Assign to me' }, ...assignees.map((email) => ({ value: email, label: email }))]} /></div>
                  {taskNotes(task) && <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--portal-muted)]">{taskNotes(task)}</p>}
                  {task.status === 'pending' && !isPausedAutomationTask && <div className="mt-3 flex flex-wrap items-center gap-2">
                    {taskChannel(task) === 'phone'
                      ? <PortalButton size="sm" disabled={!selected.phone || busyId === task.id} onClick={() => dial(selected, task)}><Phone size={13} /> Call &amp; Log</PortalButton>
                      : <><PortalButton size="sm" disabled={!selected.email || busyId === task.id} onClick={() => composeEmail(selected)}><Mail size={13} /> Open Composer</PortalButton><PortalButton size="sm" variant="ghost" disabled={busyId === task.id} onClick={() => void changeManualTask(task, 'complete')}><Check size={13} /> Complete</PortalButton></>}
                    <div className="w-40"><PortalDatePicker value={task.due_at ? luxorDate(task.due_at) : task.due_date?.slice(0, 10) ?? ''} onChange={(date) => date && void changeManualTask(task, 'reschedule', date)} placeholder="Reschedule" minDate={today} /></div>
                    <PortalButton size="sm" variant="ghost" disabled={busyId === task.id} onClick={() => void changeManualTask(task, 'skip')}><X size={13} /> Skip</PortalButton>
                  </div>}
                </article>
              })}
            </section>}
            {selectedHistory.length ? <ol className="space-y-3">{selectedHistory.map((item) => <li key={item.id} className="flex gap-3 border-l-2 border-[#caa24c]/50 pl-3"><span className="mt-0.5 text-[#a8792f]">{item.kind === 'call' ? <Phone size={14} /> : item.kind === 'email' ? <Mail size={14} /> : item.kind === 'note' ? <FileText size={14} /> : <Clock3 size={14} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-xs">{item.label}</strong><time className="shrink-0 text-[10px] text-[color:var(--portal-muted)]">{item.at ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.at)) : ''}</time></div>{item.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--portal-muted)]">{item.detail}</p>}</div></li>)}</ol> : <p className="text-sm text-[color:var(--portal-muted)]">No calls, emails, notes, or scheduled follow-ups are recorded.</p>}
            {historyHasMore && <div className="flex justify-center"><PortalButton size="sm" variant="ghost" onClick={() => void loadHistory(selected.id, historyPage + 1, true).catch((error) => notify({ title: 'Earlier activity could not be loaded', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' }))}>Load earlier activity</PortalButton></div>}
          </div>}
          {moreOpen && <div className="mt-4 rounded-lg border border-[color:var(--portal-border)] p-2"><div className="grid gap-1 text-left">{[['Schedule or reschedule tour', 'event'], ['Send or edit proposal', 'proposals'], ['Add note', 'notes'], ['Change lead status', 'profile'], ['Move to Nurture', 'nurture']].map(([label, action]) => <button key={label} type="button" onClick={() => { if (action === 'event') openLeadWorkspace(selected, 'tour'); else if (action === 'profile') openLeadWorkspace(selected, 'profile'); else if (action === 'proposals') { setDetailTab('proposals'); openLeadWorkspace(selected, 'proposal') } else if (action === 'notes') setDetailTab('notes'); else void moveToNurture(selected.id) }} className="flex min-h-9 items-center rounded-md px-2 text-left text-xs hover:bg-[color:var(--portal-soft)]">{label}</button>)}{sequence?.status === 'active' && <button type="button" onClick={() => setPauseOpen(true)} className="flex min-h-9 items-center rounded-md px-2 text-left text-xs hover:bg-[color:var(--portal-soft)]">Pause Follow-Ups</button>}{sequence?.status === 'paused' && <button type="button" onClick={() => void resumeSequence()} className="flex min-h-9 items-center rounded-md px-2 text-left text-xs hover:bg-[color:var(--portal-soft)]">Resume Follow-Ups</button>}{(sequence?.status === 'active' || sequence?.status === 'paused') && <button type="button" onClick={() => setStopOpen(true)} className="flex min-h-9 items-center rounded-md px-2 text-left text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/20">Stop Follow-Ups</button>}</div></div>}
        </> : <div className="flex h-full min-h-56 flex-col items-center justify-center text-center text-sm text-[color:var(--portal-muted)]"><ChevronRight size={20} /><p className="mt-2">Choose a lead to open the full follow-up workspace.</p></div>}
      </aside>
    </div>

    <PortalModal isOpen={adding} onClose={() => setAdding(false)} title="Add Follow-Up" description="Create a manual reminder on the existing lead. This does not send an email or place a call." maxWidth="max-w-lg" zIndex={100}>
      <form onSubmit={saveTask} className="space-y-4"><label className="block text-sm">Lead<PortalSelect value={leadId} onChange={setLeadId} options={leads.map((lead) => ({ value: lead.id, label: lead.full_name }))} className="mt-1 w-full" buttonClassName="h-10" /></label><label className="block text-sm">Type<PortalSelect value={newChannel} onChange={(value) => setNewChannel(value as Channel)} options={[{ value: 'phone', label: 'Phone call' }, { value: 'email', label: 'Email task' }]} className="mt-1 w-full" buttonClassName="h-10" /></label><label className="block text-sm">Title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={newChannel === 'phone' ? 'Personal call' : 'Follow-up email'} className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm" /></label><label className="block text-sm">Due date<PortalDatePicker value={dueDate} onChange={setDueDate} placeholder="Choose date" minDate={today} className="mt-1 w-full [&>button]:h-10 [&>button]:rounded-lg [&>button]:px-3 [&>button]:py-2 [&>button]:normal-case [&>button]:tracking-normal" /></label><label className="block text-sm">Due time (Central)<input required type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm" /></label><label className="block text-sm">Assigned to<PortalSelect value={assignee} onChange={setAssignee} options={[{ value: '', label: 'Assign to me' }, ...assignees.map((email) => ({ value: email, label: email }))]} className="mt-1 w-full" buttonClassName="h-10" /></label><label className="block text-sm">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm" /></label><div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</PortalButton><PortalButton type="submit" disabled={!leadId || !dueDate || !dueTime}>Save Follow-Up</PortalButton></div></form>
    </PortalModal>

    <PortalModal isOpen={Boolean(callDraft)} onClose={resetCallDraft} title="Log Call Outcome" description="Record the result and choose a dated manual next step. This form does not place a call." maxWidth="max-w-xl" zIndex={110}>
      {callDraft && <form onSubmit={saveCall} className="space-y-4"><p className="text-sm text-[color:var(--portal-muted)]">{callDraft.lead.full_name} · {formatPhoneDisplay(callDraft.lead.phone)}. A dial action does not verify call completion; choose the outcome only after you know it.</p><fieldset><legend className="mb-2 text-xs font-semibold">Call outcome</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[['no_answer','No Answer'],['interested','Interested'],['wants_tour','Wants Tour'],['needs_time','Needs Time'],['not_interested','Not Interested']].map(([value,label]) => <button key={value} type="button" aria-pressed={callOutcome === value} onClick={() => { setCallOutcome(value); if (value === 'not_interested') setNextStep('none') }} className={`min-h-12 rounded-lg border px-2 text-xs font-semibold ${callOutcome === value ? 'border-[#a8792f] bg-[#a8792f]/10 text-[#8c6529] dark:text-[#f1d27a]' : 'border-[color:var(--portal-border)]'}`}>{label}</button>)}</div></fieldset><label className="block text-sm">Add a note<textarea value={callNote} onChange={(event) => setCallNote(event.target.value)} maxLength={500} rows={3} placeholder="Call summary or voicemail note" className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm" /></label><label className="block text-sm">Next step<PortalSelect value={nextStep} onChange={setNextStep} disabled={callOutcome === 'not_interested'} options={[{value:'none',label:'No change'}, {value:'tour',label:'Schedule Tour'}, {value:'proposal',label:'Send Proposal'}, {value:'later',label:'Follow Up Later'}, {value:'thank_you',label:'Send Thank You'}, {value:'nurture',label:'Move to Nurture'}, {value:'stop',label:'No Further Follow-Up'}]} className="mt-1 w-full" buttonClassName="h-10" /></label>{['tour','proposal'].includes(nextStep) && <button type="button" onClick={() => { const lead = callDraft.lead; resetCallDraft(); openLeadWorkspace(lead, nextStep as 'tour' | 'proposal') }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#caa24c]/50 px-3 text-xs font-semibold text-[#8c6529] dark:text-[#f1d27a]">Open existing {nextStep === 'tour' ? 'tour' : 'proposal'} controls <ChevronRight size={14} /></button>}{nextStep === 'thank_you' && <button type="button" onClick={() => composeEmail(callDraft.lead)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#caa24c]/50 px-3 text-xs font-semibold text-[#8c6529] dark:text-[#f1d27a]"><Mail size={14} /> Open manual email composer</button>}{nextStep === 'nurture' && <p className="text-xs text-[color:var(--portal-muted)]">This changes the lead’s stage only. It sends no messages and adds no nurture enrollment.</p>}{nextStep === 'later' && <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm sm:col-span-2">Follow-up date<PortalDatePicker value={nextDate} onChange={setNextDate} placeholder="Choose date" minDate={today} className="mt-1 w-full" /></label><label className="text-sm">Time<input type="time" value={nextTime} onChange={(event) => setNextTime(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm" /></label><label className="text-sm sm:col-span-3">Reminder type<PortalSelect value={nextChannel} onChange={(value) => setNextChannel(value as Channel)} options={[{value:'phone',label:'Phone call'}, {value:'email',label:'Email task (manual; no email sent)'}]} className="mt-1 w-full" buttonClassName="h-10" /></label></div>}<div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={resetCallDraft}>Cancel</PortalButton><PortalButton type="submit" disabled={!callOutcome || callSaving || (nextStep === 'later' && !nextDate)}><Check size={14} /> Save &amp; Schedule</PortalButton></div></form>}
    </PortalModal>

    <PortalModal isOpen={pauseOpen} onClose={() => setPauseOpen(false)} title="Pause Follow-Ups" description="Pause this lead’s approved brochure sequence. Any date below adds a manual review reminder; it will not automatically resume." maxWidth="max-w-md" zIndex={120}><form onSubmit={(event) => void savePause(event)} className="space-y-4"><label className="block text-sm">Review on (optional)<PortalDatePicker value={pauseDate} onChange={setPauseDate} placeholder="Choose a review date" minDate={today} className="mt-1 w-full" /></label><label className="block text-sm">Reason (optional)<PortalSelect value={pauseReason} onChange={setPauseReason} options={[{value:'',label:'Choose a reason'}, {value:'Client requested later',label:'Client requested later'}, {value:'Staff follow-up needed',label:'Staff follow-up needed'}, {value:'Other',label:'Other'}]} className="mt-1 w-full" buttonClassName="h-10" /></label><div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setPauseOpen(false)}>Cancel</PortalButton><PortalButton type="submit" disabled={sequenceSaving}><Pause size={14} /> Pause Follow-Ups</PortalButton></div></form></PortalModal>

    <PortalModal isOpen={stopOpen} onClose={() => setStopOpen(false)} title="Stop Follow-Ups" description="Cancel remaining steps in this brochure sequence. The lead and its history stay in place." maxWidth="max-w-md" zIndex={120}><form onSubmit={(event) => void saveStop(event)} className="space-y-4"><label className="block text-sm">Reason<PortalSelect value={stopReason} onChange={setStopReason} options={[{value:'lost_another_venue',label:'Booked Elsewhere'}, {value:'not_interested',label:'Not Interested'}, {value:'event_canceled',label:'Event Canceled'}, {value:'no_response',label:'No Response'}, {value:'duplicate',label:'Duplicate'}, {value:'other',label:'Other'}]} className="mt-1 w-full" buttonClassName="h-10" /></label>{stopReason === 'other' && <label className="block text-sm">Details<input required value={stopDetail} onChange={(event) => setStopDetail(event.target.value)} maxLength={300} className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm" /></label>}<p className="text-xs text-[color:var(--portal-muted)]">No thank-you message is preselected or sent. Use the email composer separately if a reviewed message is appropriate.</p><div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setStopOpen(false)}>Cancel</PortalButton><PortalButton type="submit" disabled={sequenceSaving} className="bg-red-700 hover:bg-red-800">Stop Follow-Ups</PortalButton></div></form></PortalModal>

    <PortalModal isOpen={Boolean(profileWorkspace)} onClose={() => { void closeLeadWorkspace() }} title={profileWorkspace ? `${leadById.get(profileWorkspace.leadId)?.full_name ?? 'Lead'} · ${profileWorkspace.stage === 'tour' ? 'Tour controls' : profileWorkspace.stage === 'proposal' ? 'Proposal workspace' : 'Lead status'}` : undefined} description="Existing lead tools open here so closing returns to this Follow-Ups workspace." maxWidth="max-w-7xl" zIndex={130}>
      {profileWorkspace && <iframe title={`${leadById.get(profileWorkspace.leadId)?.full_name ?? 'Lead'} workspace`} src={`/portal/leads/${profileWorkspace.leadId}${profileWorkspace.stage === 'profile' ? '' : `?stage=${profileWorkspace.stage}`}`} className="h-[78vh] min-h-[34rem] w-full rounded-lg border border-[color:var(--portal-border)] bg-white" />}
    </PortalModal>
  </section>
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="min-w-0"><div className="flex items-center gap-1.5 text-[10px] text-[color:var(--portal-muted)]">{icon}{label}</div><div className="mt-1 break-words text-xs font-medium">{value}</div></div> }
function DetailLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-[color:var(--portal-border)] py-2 text-sm"><span className="text-[color:var(--portal-muted)]">{label}</span><strong className="text-right font-medium">{value}</strong></div> }
function QuickAction({ onClick, icon, label, disabled = false }: { onClick: () => void; icon: ReactNode; label: string; disabled?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-[color:var(--portal-border)] px-2 text-[10px] font-semibold hover:border-[#caa24c]/55"><span className="text-[#a8792f]">{icon}</span>{label}</button> }
function NotesPanel({ lead, history, onSave }: { lead: LuxorInquiry; history: Activity[]; onSave: (content: string) => Promise<void> }) {
  const { notify } = useToast()
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    try { await onSave(content.trim()); setContent(''); notify({ title: 'Note added to lead timeline', variant: 'success' }) }
    catch (error) { notify({ title: 'Note could not be added', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' }) }
    finally { setSaving(false) }
  }
  const noteItems = history.filter((item) => item.kind === 'note')
  return <div className="mt-4 space-y-4"><h3 className="font-serif text-lg">Notes</h3><form onSubmit={submit} className="space-y-2"><label htmlFor="lead-follow-up-note" className="text-xs font-semibold">Add a note for {lead.full_name}</label><textarea id="lead-follow-up-note" required value={content} onChange={(event) => setContent(event.target.value)} rows={4} className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm" /><div className="flex justify-end"><PortalButton type="submit" disabled={!content.trim() || saving}>Add Note</PortalButton></div></form><div className="space-y-3">{noteItems.map((item) => <article key={item.id} className="border-l-2 border-[#caa24c]/50 pl-3"><div className="flex justify-between gap-2 text-xs"><strong>{item.label}</strong><time>{item.at ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' }).format(new Date(item.at)) : ''}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--portal-muted)]">{item.detail}</p></article>)}{!noteItems.length && <p className="text-xs text-[color:var(--portal-muted)]">No notes recorded.</p>}</div></div>
}
