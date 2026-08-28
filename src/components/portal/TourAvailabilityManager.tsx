'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Loader2 } from 'lucide-react'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import {
  isLuxorTourSlotAtLeast24HoursAway,
  LUXOR_TOUR_EARLIEST_START_TIME,
  LUXOR_TOUR_TIME_OPTIONS,
  LUXOR_WEEKDAY_LABELS,
  tourTimesForAvailability,
  type LuxorTourAvailability,
  type LuxorTourSlot,
} from '@/lib/luxorTourSlots'

const FALLBACK_SCHEDULE: LuxorTourAvailability[] = LUXOR_WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  is_open: weekday === 2 || weekday === 3,
  start_time: '16:00',
  end_time: '19:00',
}))

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function TourAvailabilityManager({
  title = 'Tour availability',
  description = 'Choose exactly which days and times you want to offer. Visitors will only see published dates that match this schedule.',
  publishLabel = 'Open selected dates',
  onUpdated,
}: { title?: string; description?: string; publishLabel?: string; onUpdated?: () => void | Promise<void> } = {}) {
  const { notify } = useToast()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [slots, setSlots] = useState<LuxorTourSlot[]>([])
  const [schedule, setSchedule] = useState<LuxorTourAvailability[]>(FALLBACK_SCHEDULE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'schedule' | 'publish' | 'unpublish' | null>(null)

  async function loadSlots() {
    try {
      setLoading(true)
      const response = await fetch('/api/tour-slots?manage=1', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load tour availability.')
      setSlots(payload.slots || [])
      if (Array.isArray(payload.availability) && payload.availability.length === 7) setSchedule(payload.availability)
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Could not load tour availability.', variant: 'error' })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSlots() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  }, [month])
  const eligibleDates = useMemo(() => calendarDays
    .filter((date): date is Date => Boolean(date))
    .map(isoDate)
    .filter((date) => { const day = schedule[new Date(`${date}T12:00:00Z`).getUTCDay()]; return Boolean(day?.is_open) && isLuxorTourSlotAtLeast24HoursAway(date, day?.start_time || LUXOR_TOUR_EARLIEST_START_TIME) }), [calendarDays, schedule])
  const publishedByDate = useMemo(() => {
    const map = new Map<string, { open: number; booked: number }>()
    for (const slot of slots) {
      const item = map.get(slot.slot_date) || { open: 0, booked: 0 }
      if (slot.status === 'available' && slot.booked_count === 0) item.open += 1
      if (slot.status === 'booked' || slot.booked_count > 0) item.booked += 1
      map.set(slot.slot_date, item)
    }
    return map
  }, [slots])
  const openTimes = schedule.filter((day) => day.is_open).reduce((sum, day) => sum + tourTimesForAvailability(day).length, 0)

  function updateSchedule(weekday: number, patch: Partial<LuxorTourAvailability>) {
    setSchedule((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day))
  }

  async function saveSchedule() {
    try {
      setSaving('schedule')
      const response = await fetch('/api/tour-slots', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ availability: schedule }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save the tour schedule.')
      setSchedule(payload.availability || schedule)
      await loadSlots()
      notify({ title: 'Weekly tour schedule saved.', variant: 'success' })
      await onUpdated?.()
    } catch (error) { notify({ title: error instanceof Error ? error.message : 'Could not save the tour schedule.', variant: 'error' }) } finally { setSaving(null) }
  }

  async function updateDays(action: 'publish' | 'unpublish') {
    if (!selectedDates.length) return
    try {
      setSaving(action)
      const response = await fetch('/api/tour-slots', { method: action === 'publish' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'publish' ? { dates: selectedDates } : { dates: selectedDates, action }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Could not ${action} those dates.`)
      setSlots(payload.slots || [])
      setSelectedDates([])
      notify({ title: action === 'publish' ? 'Selected tour dates are open.' : 'Selected tour dates are closed. Existing bookings stay reserved.', variant: 'success' })
      await onUpdated?.()
    } catch (error) { notify({ title: error instanceof Error ? error.message : `Could not ${action} those dates.`, variant: 'error' }) } finally { setSaving(null) }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{title}</h3><p className="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">{description}</p></div>
        <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:text-right"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-faint)]">Public schedule</p><p className="mt-1 text-xs font-semibold text-[color:var(--portal-text)]">{schedule.filter((day) => day.is_open).map((day) => LUXOR_WEEKDAY_LABELS[day.weekday].slice(0, 3)).join(' · ') || 'No days selected'}</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{openTimes} time{openTimes === 1 ? '' : 's'} per week</p></div>
      </div>
      <div className="mt-5 space-y-2">{schedule.map((day) => <div key={day.weekday} className={`grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_8rem_auto] sm:items-center ${day.is_open ? 'border-[#caa24c]/35 bg-[#caa24c]/[0.06]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'}`}>
        <button type="button" aria-pressed={day.is_open} onClick={() => updateSchedule(day.weekday, { is_open: !day.is_open })} className="flex items-center gap-3 text-left"><span className={`flex h-5 w-5 items-center justify-center rounded border ${day.is_open ? 'border-[#caa24c] bg-[#caa24c] text-[#241b0d]' : 'border-[color:var(--portal-faint)]'}`}>{day.is_open ? <Check size={13} /> : null}</span><span><span className="block text-sm font-semibold text-[color:var(--portal-text)]">{LUXOR_WEEKDAY_LABELS[day.weekday]}</span><span className="block text-[10px] text-[color:var(--portal-muted)]">{day.is_open ? 'Open for tour requests' : 'No tours offered'}</span></span></button>
        <PortalSelect value={day.start_time.slice(0, 5)} onChange={(value) => updateSchedule(day.weekday, { start_time: value })} options={LUXOR_TOUR_TIME_OPTIONS.filter((option) => option.value < day.end_time.slice(0, 5))} disabled={!day.is_open} className="w-full" buttonClassName="min-h-10" placeholder="Start" />
        <PortalSelect value={day.end_time.slice(0, 5)} onChange={(value) => updateSchedule(day.weekday, { end_time: value })} options={LUXOR_TOUR_TIME_OPTIONS.filter((option) => option.value > day.start_time.slice(0, 5))} disabled={!day.is_open} className="w-full" buttonClassName="min-h-10" placeholder="End" />
        <span className="flex items-center gap-1 text-[10px] text-[color:var(--portal-muted)]"><Clock3 size={13} />{day.is_open ? `${tourTimesForAvailability(day).length} slots` : 'Closed'}</span>
      </div>)}</div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Changes update future, unbooked published times. Booked tours are never changed.</p><PortalButton type="button" variant="primary" onClick={() => void saveSchedule()} disabled={Boolean(saving)}>{saving === 'schedule' ? <Loader2 size={13} className="animate-spin" /> : null} Save weekly schedule</PortalButton></div>
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]"><section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><div className="mb-4 flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"><ChevronLeft size={16} /></button><p className="text-sm font-bold text-[color:var(--portal-text)]">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"><ChevronRight size={16} /></button></div><div className="grid grid-cols-7 gap-1 text-center">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="pb-2 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">{day}</span>)}{calendarDays.map((date, index) => { if (!date) return <span key={`empty-${index}`} />; const value = isoDate(date); const eligible = eligibleDates.includes(value); const selected = selectedDates.includes(value); const published = publishedByDate.get(value); return <button key={value} type="button" disabled={!eligible} onClick={() => setSelectedDates((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())} aria-pressed={selected} aria-label={`${value}${eligible ? ', available to open' : ', closed by weekly schedule'}`} className={`relative flex min-h-12 flex-col items-center justify-center rounded-lg border text-xs ${selected ? 'border-[#caa24c] bg-[#caa24c]/14 font-bold' : eligible ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/45' : 'cursor-not-allowed border-transparent text-[color:var(--portal-faint)] opacity-35'}`}><span>{date.getDate()}</span>{published?.open ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" /> : published?.booked ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#caa24c]" /> : null}{selected ? <Check size={10} className="absolute right-1 top-1 text-[#a8792f]" /> : null}</button>})}</div><div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--portal-border)] pt-4"><PortalButton type="button" size="sm" onClick={() => setSelectedDates((current) => [...new Set([...current, ...eligibleDates])].sort())}>Select open days this month</PortalButton><button type="button" onClick={() => setSelectedDates([])} className="text-[10px] font-bold text-[color:var(--portal-muted)]">Clear selection</button></div></section><aside className="flex flex-col rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><CalendarDays size={20} className="text-[#a8792f]" /><p className="mt-4 text-3xl font-semibold text-[color:var(--portal-text)]">{selectedDates.length}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">date{selectedDates.length === 1 ? '' : 's'} selected · {selectedDates.length * openTimes} tour times</p>{loading ? <p className="mt-4 flex items-center gap-2 text-xs text-[color:var(--portal-muted)]"><Loader2 size={13} className="animate-spin" /> Loading schedule…</p> : null}<div className="mt-auto space-y-2 pt-6"><PortalButton type="button" variant="primary" className="w-full" disabled={!selectedDates.length || Boolean(saving)} onClick={() => void updateDays('publish')}>{saving === 'publish' ? <Loader2 size={13} className="animate-spin" /> : null}{publishLabel}</PortalButton><PortalButton type="button" className="w-full" disabled={!selectedDates.length || Boolean(saving)} onClick={() => void updateDays('unpublish')}>{saving === 'unpublish' ? <Loader2 size={13} className="animate-spin" /> : null}Close selected dates</PortalButton></div><p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-faint)]">A date must be opened here before it appears on the public booking form.</p></aside></div>
  </div>
}
