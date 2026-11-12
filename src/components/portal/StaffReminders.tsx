'use client'

import { useCallback, useEffect, useState } from 'react'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect, PortalSkeleton } from '@/components/portal/PortalUI'
import type { LuxorTask, LuxorPromotion } from '@/lib/luxorInquiryTypes'
import { formatLuxorTourDate, luxorTodayKey } from '@/lib/luxorTourMetrics'

type Reminder = { id: string; subject: string; scheduled_for: string; status: string; last_error: string | null }
const field = 'h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)]'

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toLowerCase()
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null
  if (meridiem) hour = hour % 12 + (meridiem === 'pm' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function centralTime(date: string, time: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  if (![y, m, d, h, min].every(Number.isFinite)) return null
  const target = Date.UTC(y, m - 1, d, h, min)
  let stamp = target
  const format = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(format.formatToParts(new Date(stamp)).map(x => [x.type, Number(x.value)]))
    stamp += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  const p = Object.fromEntries(format.formatToParts(new Date(stamp)).map(x => [x.type, Number(x.value)]))
  if (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) !== target) return null
  for (const offset of [-3600000, 3600000]) {
    const other = Object.fromEntries(format.formatToParts(new Date(stamp + offset)).map(x => [x.type, Number(x.value)]))
    if (Date.UTC(other.year, other.month - 1, other.day, other.hour, other.minute) === target) return null
  }
  return new Date(stamp).toISOString()
}

export function StaffReminders({ open, onClose, tasks }: { open: boolean; onClose: () => void; tasks: (LuxorTask & { inquiry_context?: { full_name: string } | null })[] }) {
  const [kind, setKind] = useState<'task' | 'promotion'>('task')
  const [sourceId, setSourceId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [promotions, setPromotions] = useState<LuxorPromotion[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b] = await Promise.all([fetch('/api/portal/staff-reminders', { cache: 'no-store' }), fetch('/api/portal/promotions', { cache: 'no-store' })])
      if (!a.ok || !b.ok) throw new Error('Could not load reminders and promotions.')
      const [saved, promos] = await Promise.all([a.json(), b.json()])
      setReminders(saved.reminders); setPromotions(promos); setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load reminders.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) void load() }, [open, load])
  const options = kind === 'task'
    ? tasks.filter(t => t.status === 'pending').map(t => ({ value: t.id, label: `${t.inquiry_context?.full_name ? `${t.inquiry_context.full_name} · ` : ''}${t.title}${t.due_date ? ` · Due ${formatLuxorTourDate(t.due_date)}` : ''}` }))
    : promotions.filter(p => p.active && p.expires_on && p.expires_on >= luxorTodayKey()).map(p => ({ value: p.id, label: `${p.name} · Expires ${p.expires_on ? formatLuxorTourDate(p.expires_on) : ''}` }))
  async function save() {
    const normalized = normalizeTime(time)
    const scheduledFor = normalized ? centralTime(date, normalized) : null
    if (!sourceId || !scheduledFor || Date.parse(scheduledFor) <= Date.now()) { setError('Choose an item and a valid future date and time in Central time. During a clock change, choose an unambiguous time.'); return }
    const promotion = kind === 'promotion' ? promotions.find(p => p.id === sourceId) : null
    if (promotion?.expires_on && date > promotion.expires_on) { setError('Choose a reminder date on or before the promotion expires.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/portal/staff-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, sourceId, scheduledFor }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save reminder.')
      setSourceId(''); setDate(''); setTime(''); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save reminder.') }
    finally { setBusy(false) }
  }
  async function cancel(id: string) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/portal/staff-reminders?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not cancel reminder.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel reminder.') }
    finally { setBusy(false) }
  }
  return <PortalModal isOpen={open} onClose={onClose} title="Staff reminders" description="Choose when Arianna should receive an email about an open task or an expiring promotion." maxWidth="max-w-xl" fullScreenOnCompact>
    <div className="space-y-4">
      <label className="block space-y-1 text-sm font-medium"><span>Remind me about</span><PortalSelect value={kind} onChange={v => { setKind(v as 'task' | 'promotion'); setSourceId('') }} options={[{ value: 'task', label: 'Follow-up or task' }, { value: 'promotion', label: 'Promotion expiration' }]} /></label>
      <label className="block space-y-1 text-sm font-medium"><span>{kind === 'task' ? 'Open task' : 'Active promotion'}</span><PortalSelect value={sourceId} onChange={setSourceId} options={[{ value: '', label: 'Choose an item' }, ...options]} /></label>
      {!loading && options.length === 0 && <p className="text-xs text-[color:var(--portal-muted)]">{kind === 'task' ? 'There are no open tasks to choose.' : 'No active promotions have an upcoming expiration date.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium"><span>Reminder date</span><PortalDatePicker value={date} onChange={setDate} placeholder="Choose date" /></label><label className="block space-y-1 text-sm font-medium"><span>Time (Central)</span><input className={field} type="text" autoComplete="off" placeholder="e.g. 9:30 AM" value={time} onChange={e => setTime(e.target.value)} /></label></div>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Reminders are sent to Arianna. Before sending, Luxor checks whether the item is still open and unchanged. Create a new reminder after changing its date or title.</p>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <PortalButton variant="primary" disabled={busy || loading} onClick={() => void save()}>Schedule reminder</PortalButton>
      <div className="border-t border-[color:var(--portal-border)] pt-4"><h3 className="text-sm font-semibold">Scheduled and recent reminders</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Showing up to 100 scheduled and 20 recent reminders.</p>{loading ? <div className="mt-2 space-y-3 pt-1"><div className="space-y-1.5"><PortalSkeleton className="h-4 w-48 rounded" /><PortalSkeleton className="h-3 w-32 rounded" /></div><div className="space-y-1.5"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-3 w-28 rounded" /></div></div> : reminders.length === 0 ? <p className="mt-2 text-sm text-[color:var(--portal-muted)]">No reminders scheduled yet.</p> : <ul className="mt-2 divide-y divide-[color:var(--portal-border)]">{reminders.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm">{r.subject}</p><p className="text-xs text-[color:var(--portal-muted)]">{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(r.scheduled_for))} Central · {r.status === 'cancelled' && r.last_error !== 'Cancelled by staff.' ? 'skipped' : r.status}{r.status === 'failed' ? ' — delivery needs review' : ''}</p></div>{r.status === 'queued' && <PortalButton variant="ghost" size="sm" disabled={busy} onClick={() => void cancel(r.id)}>Cancel</PortalButton>}</li>)}</ul>}</div>
    </div>
  </PortalModal>
}
