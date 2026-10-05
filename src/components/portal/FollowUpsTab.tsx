'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Check, ChevronRight, CircleAlert, Eye, Mail, Phone, Plus, Search, Settings2, X } from 'lucide-react'
import type { LuxorInquiry, LuxorTask } from '@/lib/luxorInquiryTypes'
import type { LuxorFollowUpTemplate } from '@/lib/luxorFollowUpsServer'
import { buildFollowUpTaskPatch, getLuxorFollowUpTaskChannel, isLuxorFollowUpTask, phoneCompletionNeedsOutcome } from '@/lib/luxorFollowUpTaskPolicy'
import { PortalButton, PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type Channel = 'email' | 'phone'
type Activity = { id: string; at: string; kind: 'note' | 'call' | 'email'; label: string; detail: string }
type SequenceInfo = { status: 'active' | 'paused' | 'completed' | 'stopped'; ended_reason: string | null; response_received_at: string | null }
type EmailAction = { id: string; inquiry_id: string; step_key: string; scheduled_at: string; status: string }
type FollowUpRow = { id: string; inquiryId: string; channel: Channel; title: string; dueAt: string | null; dueDate: string | null; status: string; assignee: string; task?: LuxorTask }

function taskChannel(task: LuxorTask): Channel {
  return getLuxorFollowUpTaskChannel(task)
}

function taskNotes(task: LuxorTask) {
  return (task.description ?? '').replace(/^\[follow-up:(?:email|phone)\]\s*/, '')
}

function dateState(task: LuxorTask, today: string) {
  if (task.status === 'completed') return 'Completed'
  if (task.status === 'cancelled') return 'Skipped'
  if (!task.due_at && !task.due_date) return 'Upcoming'
  const due = task.due_at ? luxorDate(task.due_at) : task.due_date!.slice(0, 10)
  if (due < today) return 'Overdue'
  if (due === today) return 'Due today'
  return 'Upcoming'
}

function luxorDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function luxorTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
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

function luxorToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export default function FollowUpsTab({ leads }: { leads: LuxorInquiry[] }) {
  const { notify } = useToast()
  const [tasks, setTasks] = useState<LuxorTask[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [emailActions, setEmailActions] = useState<EmailAction[]>([])
  const [sendingEnabled, setSendingEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('all')
  const [taskStatus, setTaskStatus] = useState('all')
  const [eventType, setEventType] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const [sequence, setSequence] = useState<SequenceInfo | null>(null)
  const [savedDispositions, setSavedDispositions] = useState<Record<string, string>>({})
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
      const emailResult = (await emailResponse.json()) as { emailActions: EmailAction[]; sendingEnabled: boolean }
      setTasks(result.tasks)
      setAssignees(result.assignees)
      setEmailActions(emailResult.emailActions)
      setSendingEnabled(emailResult.sendingEnabled)
      if (!assignee && result.assignees[0]) setAssignee(result.assignees[0])
    } catch (error) {
      notify({ title: 'Follow-up tasks could not be loaded', description: error instanceof Error ? error.message : 'Try again in a moment.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [assignee, notify])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!selectedId) { setActivity([]); setSequence(null); return }
    let active = true
    void fetch(`/api/follow-ups?inquiryId=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ history?: Activity[]; enrollment?: SequenceInfo | null }> : Promise.reject(new Error('Could not load lead history.')))
      .then((result) => { if (active) { setActivity(result.history ?? []); setSequence(result.enrollment ?? null) } })
      .catch(() => { if (active) { setActivity([]); setSequence(null) } })
    return () => { active = false }
  }, [selectedId])

  async function changeSequence(action: 'pause' | 'resume' | 'stop') {
    if (!selectedId) return
    const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: selectedId, action }) })
    if (!response.ok) { notify({ title: 'Sequence status could not be updated', variant: 'error' }); return }
    const result = await response.json() as { status: SequenceInfo['status'] }
    setSequence((current) => current ? { ...current, status: result.status } : current)
    await refresh()
  }

  async function openTemplateSettings() {
    const response = await fetch('/api/follow-ups', { cache: 'no-store' })
    if (!response.ok) { notify({ title: 'Templates could not be loaded', variant: 'error' }); return }
    const data = await response.json() as { templates: LuxorFollowUpTemplate[] }
    setTemplates(data.templates)
    setSettingsOpen(true)
  }

  function changeTemplate(id: string, field: keyof LuxorFollowUpTemplate, value: string | boolean | number | null) {
    setTemplates((current) => current.map((template) => template.id === id ? { ...template, [field]: value } : template))
  }

  async function saveTemplate(template: LuxorFollowUpTemplate) {
    const response = await fetch('/api/follow-ups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: template.id, updates: { name: template.name, subject: template.subject, body: template.body, cta_text: template.cta_text, cta_url: template.cta_url, secondary_cta_text: template.secondary_cta_text, secondary_cta_url: template.secondary_cta_url, delay_days: template.delay_days, active: template.active } }) })
    if (!response.ok) { notify({ title: 'Template could not be saved', variant: 'error' }); return }
    notify({ title: 'Follow-up template saved', description: 'Saved settings do not activate automated sending.', variant: 'success' })
  }

  async function saveDisposition(inquiryId: string, disposition: string) {
    const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, action: 'disposition', disposition: disposition || null }) })
    if (!response.ok) { notify({ title: 'Lead disposition could not be saved', variant: 'error' }); return }
    setSavedDispositions((current) => ({ ...current, [inquiryId]: disposition }))
    if (['not_interested', 'lost_another_venue', 'event_canceled'].includes(disposition)) {
      setSequence((current) => current ? { ...current, status: 'stopped', ended_reason: disposition } : current)
    }
    notify({ title: 'Lead disposition updated', description: disposition === 'no_response' ? 'No Response does not stop the sequence.' : disposition ? 'Pending brochure follow-ups have been stopped.' : 'The disposition was cleared.', variant: 'success' })
  }

  async function markLeadResponse(inquiryId: string) {
    const response = await fetch('/api/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, action: 'response' }) })
    if (!response.ok) { notify({ title: 'The response could not be recorded', variant: 'error' }); return }
    const result = await response.json() as { recorded: boolean }
    if (!result.recorded) return
    setSequence((current) => current ? { ...current, response_received_at: new Date().toISOString() } : current)
    notify({ title: 'Lead response recorded', description: 'The sequence continues. It will not be marked No Response.', variant: 'success' })
  }

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])
  const eventTypes = useMemo(() => [...new Set(leads.map((lead) => lead.event_type).filter((value): value is string => Boolean(value)))].sort(), [leads])
  const followUpTasks = useMemo(() => tasks.filter(isLuxorFollowUpTask), [tasks])
  const rows = useMemo<FollowUpRow[]>(() => [
    ...followUpTasks.map((task) => ({ id: task.id, inquiryId: task.inquiry_id, channel: taskChannel(task), title: task.title, dueAt: task.due_at ?? null, dueDate: task.due_date ?? null, status: dateState(task, today), assignee: task.assigned_to ?? 'Unassigned', task })),
    ...emailActions.map((action) => ({ id: action.id, inquiryId: action.inquiry_id, channel: 'email' as const, title: `Email ${action.step_key.replace('email_', '#')}`, dueAt: action.scheduled_at, dueDate: null, status: luxorDate(action.scheduled_at) < today ? 'Overdue' : luxorDate(action.scheduled_at) === today ? 'Due today' : 'Upcoming', assignee: 'Automated' })),
  ], [followUpTasks, emailActions, today])
  const filtered = useMemo(() => rows.filter((row) => {
    const lead = leadById.get(row.inquiryId)
    const text = `${lead?.full_name ?? ''} ${lead?.email ?? ''} ${lead?.phone ?? ''} ${row.title}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (channel === 'all' || row.channel === channel)
      && (eventType === 'all' || lead?.event_type === eventType)
      && (taskStatus === 'all' || row.status.toLowerCase().replace(' ', '_') === taskStatus)
  }).sort((a, b) => (a.dueAt ?? a.dueDate ?? '').localeCompare(b.dueAt ?? b.dueDate ?? '')), [rows, leadById, query, channel, eventType, taskStatus])
  const selected = selectedId ? leadById.get(selectedId) : undefined
  const selectedTasks = selectedId ? followUpTasks.filter((task) => task.inquiry_id === selectedId).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')) : []
  const pending = followUpTasks.filter((task) => task.status === 'pending')
  const stats = [
    { label: 'Leads in Follow Up', value: new Set(rows.filter((row) => row.status !== 'Completed' && row.status !== 'Skipped').map((row) => row.inquiryId)).size },
    { label: 'Due Today', value: rows.filter((row) => row.status === 'Due today').length },
    { label: 'Overdue', value: rows.filter((row) => row.status === 'Overdue').length },
    { label: 'Automated Emails', value: emailActions.length },
    { label: 'Phone Calls', value: pending.filter((task) => taskChannel(task) === 'phone').length },
    { label: 'Upcoming', value: rows.filter((row) => row.status === 'Upcoming').length },
  ]

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!leadId || !title.trim() || !dueDate || !dueTime) return
    const description = `[follow-up:${newChannel}]${notes.trim() ? ` ${notes.trim()}` : ''}`
    const dueAt = localLuxorIso(dueDate, dueTime)
    const response = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId: leadId, title: title.trim(), description, dueDate, dueAt, assignedTo: assignee || undefined, priority: 'medium' }),
    })
    if (!response.ok) {
      notify({ title: 'The follow-up could not be saved', variant: 'error' })
      return
    }
    setAdding(false); setTitle(''); setNotes(''); setDueDate(''); setLeadId('')
    notify({ title: `${newChannel === 'phone' ? 'Phone' : 'Email'} follow-up task added`, description: 'No call or email was sent.', variant: 'success' })
    await refresh()
  }

  async function changeAssignee(task: LuxorTask, assignedTo: string) {
    const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, assigned_to: assignedTo || null }) })
    if (!response.ok) { notify({ title: 'Assignment could not be saved', variant: 'error' }); return }
    await refresh()
  }

  async function updateTask(task: LuxorTask, status: 'completed' | 'cancelled', dueDateValue?: string, outcome?: string) {
    if (status === 'completed' && phoneCompletionNeedsOutcome(taskChannel(task), outcome, Boolean(dueDateValue))) return
    setBusyId(task.id)
    try {
      const time = task.due_at ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(task.due_at)) : '09:00'
      const dueAt = dueDateValue ? localLuxorIso(dueDateValue, time) : undefined
      const taskPatch = buildFollowUpTaskPatch({ status, dueDate: dueDateValue, dueAt, outcome, channel: taskChannel(task), completedAt: new Date().toISOString() })
      const response = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...taskPatch }),
      })
      if (!response.ok) throw new Error('Could not update this follow-up.')
      if (outcome === 'reached') {
        await markLeadResponse(task.inquiry_id)
      }
      await refresh()
    } catch (error) {
      notify({ title: 'Could not update this follow-up', description: error instanceof Error ? error.message : 'Try again in a moment.', variant: 'error' })
    } finally { setBusyId(null) }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 text-[color:var(--portal-text)]">
      <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-4 py-3 text-sm">
        <div className="flex items-start gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0 text-[#caa24c]" /><p><strong>{sendingEnabled ? 'Automated brochure follow-up is on.' : 'Automated brochure follow-up is off.'}</strong> Email #1 uses the existing brochure delivery. New sequence enrollment requires an opted-in brochure lead. Email replies are not automatically matched here; check Inbox and record a response on the lead to prevent an incorrect No Response outcome. Calls remain manual reminders, and no texts are sent.</p></div>
      </div>
      <div><PortalButton variant="ghost" onClick={() => void openTemplateSettings()}><Settings2 size={15} /> Edit templates</PortalButton></div>
      {settingsOpen && <section className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] p-4"><div className="flex items-center justify-between"><div><h2 className="font-medium">Brochure sequence templates</h2><p className="text-xs text-[color:var(--portal-muted)]">Preview and save template content, timing, and individual active flags. Saving here cannot approve or enable sequence delivery.</p></div><PortalButton variant="ghost" onClick={() => setSettingsOpen(false)}>Close</PortalButton></div>{templates.map((template) => <article key={template.id} className="grid gap-3 border-t border-[color:var(--portal-border)] pt-3 md:grid-cols-[minmax(12rem,0.7fr)_minmax(18rem,1.3fr)]"><div><div className="font-medium">{template.name}</div><div className="mt-1 text-xs text-[color:var(--portal-muted)]">{template.channel === 'email' ? 'Email' : 'Manual phone task'} · day {template.delay_days}</div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={template.active} onChange={(event) => changeTemplate(template.id, 'active', event.target.checked)} /> Template active</label><label className="mt-2 block text-xs">Day offset<input type="number" min="0" max="365" value={template.delay_days} onChange={(event) => changeTemplate(template.id, 'delay_days', Number(event.target.value))} className="mt-1 w-24 rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1" /></label><div className="mt-3 flex gap-2"><PortalButton size="sm" onClick={() => void saveTemplate(template)}>Save</PortalButton><PortalButton size="sm" variant="ghost" onClick={() => setPreviewId(previewId === template.id ? null : template.id)}><Eye size={14} /> Preview</PortalButton></div></div><div className="space-y-2">{template.channel === 'email' && <label className="block text-xs">Subject<input value={template.subject ?? ''} onChange={(event) => changeTemplate(template.id, 'subject', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label>}<label className="block text-xs">Body<textarea value={template.body ?? ''} onChange={(event) => changeTemplate(template.id, 'body', event.target.value)} rows={3} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label>{template.channel === 'email' && <div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">CTA label<input value={template.cta_text ?? ''} onChange={(event) => changeTemplate(template.id, 'cta_text', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label><label className="block text-xs">CTA link<input value={template.cta_url ?? ''} onChange={(event) => changeTemplate(template.id, 'cta_url', event.target.value)} className="mt-1 w-full rounded border border-[color:var(--portal-border)] bg-transparent px-2 py-1.5" /></label></div>}{previewId === template.id && <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm"><strong>{template.subject}</strong><p className="mt-2 whitespace-pre-wrap">{template.body}</p><span className="mt-2 inline-block text-xs">{template.cta_text} {template.cta_url}</span></div>}</div></article>)}</section>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => <div key={stat.label} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-4 py-3"><div className="text-2xl font-semibold">{stat.value}</div><div className="text-xs text-[color:var(--portal-muted)]">{stat.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[15rem] flex-1 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2"><Search size={15} className="text-[color:var(--portal-muted)]" /><input aria-label="Search follow-ups" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads or follow-ups" className="w-full bg-transparent text-sm outline-none" /></div>
        <div role="group" aria-label="Filter by follow-up type"><PortalSelect value={channel} onChange={setChannel} options={[{ value: 'all', label: 'All types' }, { value: 'email', label: 'Email tasks' }, { value: 'phone', label: 'Phone calls' }]} /></div>
        <div role="group" aria-label="Filter by event"><PortalSelect value={eventType} onChange={setEventType} options={[{ value: 'all', label: 'All events' }, ...eventTypes.map((value) => ({ value, label: value }))]} /></div>
        <div role="group" aria-label="Filter by task status"><PortalSelect value={taskStatus} onChange={setTaskStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'due_today', label: 'Due today' }, { value: 'overdue', label: 'Overdue' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'Completed' }, { value: 'skipped', label: 'Skipped' }]} /></div>
        <PortalButton onClick={() => { setLeadId(leads[0]?.id ?? ''); setAdding(true) }}><Plus size={15} /> Add Follow-Up</PortalButton>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)]">
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-[color:var(--portal-border)] text-xs text-[color:var(--portal-muted)]"><tr>{['Lead', 'Event Type', 'Event Date', 'Next Follow-Up', 'Follow-Up Type', 'Lead Stage', 'Status', 'Assigned To'].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead><tbody>
            {filtered.map((row) => {
              const lead = leadById.get(row.inquiryId)
              const state = row.status
              const overdue = state === 'Overdue'
              return <tr key={row.id} className={`cursor-pointer border-b border-[color:var(--portal-border)]/70 ${overdue ? 'bg-red-500/[0.06]' : ''}`} onClick={() => setSelectedId(row.inquiryId)}>
                <td className="px-3 py-3 font-medium">{lead?.full_name ?? 'Lead unavailable'}</td><td className="px-3 py-3">{lead?.event_type ?? '-'}</td><td className="px-3 py-3">{lead?.target_date ?? '-'}</td>
                <td className={`px-3 py-3 ${overdue ? 'font-semibold text-red-600' : ''}`}>{row.dueAt ? `${luxorDate(row.dueAt)} · ${luxorTime(row.dueAt)}` : row.dueDate ?? 'No date'}<div className="text-xs text-[color:var(--portal-muted)]">{row.title}</div></td>
                <td className="px-3 py-3">{row.channel === 'email' ? <Mail size={15} className="inline" /> : <Phone size={15} className="inline" />} <span className="ml-1">{row.task ? (row.channel === 'email' ? 'Email task' : 'Phone call') : 'Automated email'}</span></td>
                <td className="px-3 py-3">{lead?.pipeline_stage?.replaceAll('_', ' ') ?? 'Inquiry'}</td><td className="px-3 py-3">{state}</td><td className="px-3 py-3">{row.assignee}</td>
              </tr>
            })}
            {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-[color:var(--portal-muted)]">{loading ? 'Loading follow-ups…' : 'No follow-up tasks yet. Add a task to keep it with the lead’s record.'}</td></tr>}
          </tbody></table></div>
        </div>

        <aside className="min-h-[18rem] overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] p-4">
          {selected ? <>
            <div className="border-b border-[color:var(--portal-border)] pb-3"><h2 className="font-serif text-xl">{selected.full_name}</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{selected.event_type ?? 'Event not specified'} · {selected.target_date ?? 'Date not set'}</p><p className="mt-2 text-sm">{selected.phone ?? 'No phone'} <span className="mx-1 text-[color:var(--portal-muted)]">·</span> {selected.email ?? 'No email'}</p><label className="mt-3 block text-xs">Follow-Up Disposition<PortalSelect value={Object.prototype.hasOwnProperty.call(savedDispositions, selected.id) ? savedDispositions[selected.id] : selected.follow_up_disposition ?? ''} onChange={(value) => void saveDisposition(selected.id, value)} options={[{ value: '', label: 'No disposition' }, { value: 'no_response', label: 'No Response (sequence continues)' }, { value: 'not_interested', label: 'Not Interested (stop sequence)' }, { value: 'lost_another_venue', label: 'Lost to Another Venue (stop sequence)' }, { value: 'event_canceled', label: 'Event Canceled (stop sequence)' }]} /></label></div>
            <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} /> Follow-Up Timeline</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[color:var(--portal-muted)]">Automated sequence: {sequence?.status ?? 'not enrolled'}{sequence?.response_received_at ? ' · response recorded, sequence continues' : ''}</span>
              {(sequence?.status === 'active' || sequence?.status === 'paused') && !sequence.response_received_at && <button onClick={() => void markLeadResponse(selected.id)} className="rounded-md border border-[color:var(--portal-border)] px-2.5 py-1.5">Record response</button>}
              {sequence?.status === 'active' && <button onClick={() => void changeSequence('pause')} className="rounded-md border border-[color:var(--portal-border)] px-2.5 py-1.5">Pause sequence</button>}
              {sequence?.status === 'paused' && <button onClick={() => void changeSequence('resume')} className="rounded-md border border-[color:var(--portal-border)] px-2.5 py-1.5">Resume sequence</button>}
              {(sequence?.status === 'active' || sequence?.status === 'paused') && <button onClick={() => void changeSequence('stop')} className="rounded-md border border-[color:var(--portal-border)] px-2.5 py-1.5">Stop sequence</button>}
            </div>
            <div className="mt-3 space-y-3">{selectedTasks.map((task) => <article key={task.id} className="rounded-lg border border-[color:var(--portal-border)] p-3"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2 font-medium">{taskChannel(task) === 'email' ? <Mail size={15} /> : <Phone size={15} />}{task.title}</div><span className="text-xs text-[color:var(--portal-muted)]">{dateState(task, today)}</span></div><div className="mt-1 text-xs text-[color:var(--portal-muted)]">{task.due_at ? `${luxorDate(task.due_at)} / ${luxorTime(task.due_at)}` : task.due_date ?? 'Date not set'} / Manual task</div><div className="mt-2 max-w-64"><PortalSelect value={task.assigned_to ?? ""} onChange={(value) => void changeAssignee(task, value)} options={[{ value: "", label: "Assign to me" }, ...assignees.map((email) => ({ value: email, label: email }))]} /></div>{taskNotes(task) && <p className="mt-2 whitespace-pre-wrap text-sm">{taskNotes(task)}</p>}
              {task.status === 'pending' && <div className="mt-3 flex flex-wrap items-center gap-2">{taskChannel(task) === 'phone' ? <div className="min-w-40"><PortalSelect value="" onChange={(outcome) => void updateTask(task, 'completed', undefined, outcome)} options={[{ value: '', label: 'Call outcome…' }, { value: 'reached', label: 'Reached' }, { value: 'no_answer', label: 'No answer' }, { value: 'voicemail_left', label: 'Voicemail left' }]} /></div> : <button disabled={busyId === task.id} onClick={() => void updateTask(task, 'completed', undefined, 'completed')} className="inline-flex items-center gap-1 rounded-md bg-[color:var(--portal-accent)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--portal-accent-contrast)] disabled:opacity-50"><Check size={13} /> Complete</button>}<div className="min-w-36"><PortalDatePicker value={task.due_at ? luxorDate(task.due_at) : task.due_date?.slice(0,10) ?? ''} onChange={(date) => date && void updateTask(task, 'completed', date)} placeholder="Reschedule" minDate={today} /></div><button disabled={busyId === task.id} onClick={() => void updateTask(task, 'cancelled')} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--portal-border)] px-2.5 py-1.5 text-xs"><X size={13} /> Skip</button></div>}
            </article>)}</div>
            {!selectedTasks.length && <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No follow-up activity recorded for this lead yet.</p>}
            <h3 className="mt-5 border-t border-[color:var(--portal-border)] pt-4 text-sm font-semibold">Recorded history</h3>
            <div className="mt-2 space-y-2">{activity.map((item) => <article key={item.id} className="border-l-2 border-[color:var(--portal-border)] pl-3"><div className="flex justify-between gap-2 text-xs"><strong className="capitalize">{item.kind} · {item.label}</strong><time className="shrink-0 text-[color:var(--portal-muted)]">{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.at))}</time></div>{item.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--portal-muted)]">{item.detail}</p>}</article>)}{!activity.length && <p className="text-xs text-[color:var(--portal-muted)]">No calls, emails, or notes are recorded for this lead.</p>}</div>
          </> : <div className="flex h-full min-h-56 flex-col items-center justify-center text-center text-sm text-[color:var(--portal-muted)]"><ChevronRight size={20} /><p className="mt-2">Select a lead to view its follow-up timeline.</p></div>}
        </aside>
      </div>

      {adding && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAdding(false)}><form onSubmit={saveTask} className="w-full max-w-lg space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="font-serif text-xl">Add Follow-Up</h2><button type="button" onClick={() => setAdding(false)} aria-label="Close" className="rounded p-1 hover:bg-[color:var(--portal-soft)]"><X size={18} /></button></div><p className="text-sm text-[color:var(--portal-muted)]">This creates a task on the existing lead record. Email tasks do not send email.</p><label className="block text-sm">Lead<PortalSelect value={leadId} onChange={setLeadId} options={leads.map((lead) => ({ value: lead.id, label: lead.full_name }))} /></label><label className="block text-sm">Type<PortalSelect value={newChannel} onChange={(value) => setNewChannel(value as Channel)} options={[{ value: 'phone', label: 'Phone call' }, { value: 'email', label: 'Email task' }]} /></label><label className="block text-sm">Title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={newChannel === 'phone' ? 'Personal call' : 'Follow-up email'} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2" /></label><label className="block text-sm">Due date<div className="mt-1"><PortalDatePicker value={dueDate} onChange={setDueDate} placeholder="Choose date" minDate={today} /></div></label><label className="block text-sm">Due time (Central)<input required type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2" /></label><label className="block text-sm">Assigned to<PortalSelect value={assignee} onChange={setAssignee} options={[{ value: '', label: 'Assign to me' }, ...assignees.map((email) => ({ value: email, label: email }))]} /></label><label className="block text-sm">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2" /></label><div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</PortalButton><PortalButton type="submit" disabled={!leadId || !dueDate || !dueTime}>Save task</PortalButton></div></form></div>}
    </section>
  )
}
