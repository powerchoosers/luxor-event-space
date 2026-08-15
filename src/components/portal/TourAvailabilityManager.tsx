'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { PortalButton } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { isLuxorTourDay, isLuxorTourSlotAtLeast24HoursAway, LUXOR_TOUR_TIMES, type LuxorTourSlot } from '@/lib/luxorTourSlots'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type TourAvailabilityManagerProps = {
  title?: string
  description?: string
  publishLabel?: string
  onUpdated?: () => void | Promise<void>
}

export function TourAvailabilityManager({
  title = 'Tour booking days',
  description = `Select several weekdays, then open or close them together. Each open day publishes ${LUXOR_TOUR_TIMES.length} 30-minute times from 8:00 AM through 1:00 AM; every time accepts one client and closes 24 hours before it starts.`,
  publishLabel = 'Open selected days',
  onUpdated,
}: TourAvailabilityManagerProps = {}) {
  const { notify } = useToast()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [slots, setSlots] = useState<LuxorTourSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'publish' | 'unpublish' | null>(null)

  async function loadSlots() {
    try {
      setLoading(true)
      const response = await fetch('/api/tour-slots?manage=1', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load tour days.')
      setSlots(payload.slots || [])
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Could not load tour days.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSlots()
  }, [])

  const publishedByDate = useMemo(() => {
    const result = new Map<string, { open: number; booked: number }>()
    for (const slot of slots) {
      const current = result.get(slot.slot_date) || { open: 0, booked: 0 }
      if (slot.status === 'available' && slot.booked_count === 0) current.open += 1
      if (slot.status === 'booked' || slot.booked_count > 0) current.booked += 1
      result.set(slot.slot_date, current)
    }
    return result
  }, [slots])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
    const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [
      ...Array.from({ length: firstDay.getDay() }, () => null),
      ...Array.from({ length: lastDate }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ]
  }, [month])

  const eligibleDates = useMemo(() => calendarDays
    .filter((date): date is Date => Boolean(date))
    .map(isoDate)
    .filter((date) => isLuxorTourDay(date) && isLuxorTourSlotAtLeast24HoursAway(date, LUXOR_TOUR_TIMES[0]?.startTime || '08:00:00')),
  [calendarDays])

  function toggleDate(date: string) {
    setSelectedDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort())
  }

  function selectMonth() {
    setSelectedDates((current) => [...new Set([...current, ...eligibleDates])].sort())
  }

  async function updateDays(action: 'publish' | 'unpublish') {
    if (!selectedDates.length) return
    try {
      setSaving(action)
      const response = await fetch('/api/tour-slots', {
        method: action === 'publish' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'publish' ? { dates: selectedDates } : { dates: selectedDates, action }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `Could not ${action} those tour days.`)
      setSlots(payload.slots || [])
      notify({
        title: action === 'publish'
          ? `${selectedDates.length} tour ${selectedDates.length === 1 ? 'day' : 'days'} opened.`
          : `${selectedDates.length} tour ${selectedDates.length === 1 ? 'day' : 'days'} closed. Existing bookings were kept.`,
        variant: 'success',
      })
      setSelectedDates([])
      await onUpdated?.()
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : `Could not ${action} those tour days.`, variant: 'error' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{title}</h3>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">
            {description}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-faint)]">Weekly hours</p>
          <p className="mt-1 text-xs font-semibold text-[color:var(--portal-text)]">Mon–Fri · 8 AM–1 AM</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]"><ChevronLeft size={16} /></button>
            <p className="text-sm font-bold text-[color:var(--portal-text)]">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => <span key={day} className="pb-2 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">{day}</span>)}
            {calendarDays.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />
              const value = isoDate(date)
              const eligible = eligibleDates.includes(value)
              const selected = selectedDates.includes(value)
              const published = publishedByDate.get(value)
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!eligible}
                  onClick={() => toggleDate(value)}
                  aria-pressed={selected}
                  aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${published?.open ? `, ${published.open} open times` : ''}`}
                  className={`relative flex min-h-12 flex-col items-center justify-center rounded-lg border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${selected ? 'border-[#caa24c] bg-[#caa24c]/14 font-bold text-[color:var(--portal-text)]' : eligible ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] hover:border-[#caa24c]/45' : 'cursor-not-allowed border-transparent text-[color:var(--portal-faint)] opacity-35'}`}
                >
                  <span>{date.getDate()}</span>
                  {published?.open ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" /> : published?.booked ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#caa24c]" /> : null}
                  {selected ? <Check size={10} className="absolute right-1 top-1 text-[#a8792f]" /> : null}
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--portal-border)] pt-4">
            <PortalButton type="button" size="sm" onClick={selectMonth}>Select all weekdays</PortalButton>
            <button type="button" onClick={() => setSelectedDates([])} className="text-[10px] font-bold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Clear selection</button>
            <span className="ml-auto text-[10px] text-[color:var(--portal-muted)]"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" /> Open</span>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <CalendarDays size={20} className="text-[#a8792f]" />
          <p className="mt-4 text-3xl font-semibold text-[color:var(--portal-text)]">{selectedDates.length}</p>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">days selected · {selectedDates.length * LUXOR_TOUR_TIMES.length} tour times</p>
          {loading ? <p className="mt-4 flex items-center gap-2 text-xs text-[color:var(--portal-muted)]"><Loader2 size={13} className="animate-spin" /> Loading current schedule…</p> : null}
          <div className="mt-auto space-y-2 pt-6">
            <PortalButton type="button" variant="primary" className="w-full" disabled={!selectedDates.length || Boolean(saving)} onClick={() => void updateDays('publish')}>
              {saving === 'publish' ? <Loader2 size={13} className="animate-spin" /> : null} {publishLabel}
            </PortalButton>
            <PortalButton type="button" className="w-full" disabled={!selectedDates.length || Boolean(saving)} onClick={() => void updateDays('unpublish')}>
              {saving === 'unpublish' ? <Loader2 size={13} className="animate-spin" /> : null} Close selected days
            </PortalButton>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-[color:var(--portal-faint)]">Closing a day hides its open times. Any time already booked stays safely reserved.</p>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-faint)]">Times created on every open day</p>
        <p className="mt-2 text-xs leading-6 text-[color:var(--portal-text)]">
          {slots.length === 0 && !loading ? 'No tour days are open yet. ' : ''}
          8:00 AM through 1:00 AM in 30-minute intervals.
        </p>
      </div>
    </div>
  )
}
