'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Plus,
  Trash2,
  X,
  Bell,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { PortalButton, PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import {
  DEFAULT_TOUR_SCHEDULE_SETTINGS,
  formatTourSlotDate,
  formatTourSlotTime,
  getWeeksAheadCutoffDate,
  isLuxorTourSlotAtLeast24HoursAway,
  LUXOR_TOUR_TIME_OPTIONS,
  LUXOR_WEEKDAY_LABELS,
  luxorTourTimeDisplayOrder,
  normalizeTourTime,
  tourTimesForAvailability,
  WEEKS_AHEAD_OPTIONS,
  type LuxorTourAvailability,
  type LuxorTourScheduleMode,
  type LuxorTourScheduleSettings,
  type LuxorTourSlot,
} from '@/lib/luxorTourSlots'

const FALLBACK_SCHEDULE: LuxorTourAvailability[] = LUXOR_WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  is_open: weekday === 2 || weekday === 3 || weekday === 4,
  start_time: '16:00:00',
  end_time: '19:00:00',
  times: weekday === 2 || weekday === 3 || weekday === 4 ? ['16:00:00', '17:00:00', '18:00:00'] : [],
}))

const WEEKS_AHEAD_SELECT_OPTIONS = WEEKS_AHEAD_OPTIONS.map((weeks) => ({
  value: String(weeks),
  label: `${weeks} week${weeks === 1 ? '' : 's'} ahead`,
}))

const REMINDER_DAY_OPTIONS = LUXOR_WEEKDAY_LABELS.map((day, index) => ({
  value: String(index),
  label: day,
}))

const REMINDER_TIME_OPTIONS = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
  { value: '17:00', label: '5:00 PM' },
]

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function TourAvailabilityManager({
  title = 'Tour availability',
  description = 'Choose when guests can request a private venue tour.',
  onUpdated,
}: {
  title?: string
  description?: string
  publishLabel?: string
  onUpdated?: () => void | Promise<void>
  defaultExpanded?: boolean
} = {}) {
  const { notify } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'weekly' | 'flexible' | 'settings' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Core Data State
  const [slots, setSlots] = useState<LuxorTourSlot[]>([])
  const [schedule, setSchedule] = useState<LuxorTourAvailability[]>(FALLBACK_SCHEDULE)
  const [settings, setSettings] = useState<LuxorTourScheduleSettings>(DEFAULT_TOUR_SCHEDULE_SETTINGS)

  // Flexible Schedule State
  const [flexibleDates, setFlexibleDates] = useState<Array<{ date: string; times: string[] }>>([])
  const [newFlexibleDate, setNewFlexibleDate] = useState('')
  const [selectedGridTimes, setSelectedGridTimes] = useState<string[]>([])
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  // Temporary selected time pickers
  const [weeklyTimeSelect, setWeeklyTimeSelect] = useState<Record<number, string>>({})

  // Preview form state
  const [previewSelectedDate, setPreviewSelectedDate] = useState('')
  const [previewSelectedTime, setPreviewSelectedTime] = useState('')

  async function loadData() {
    try {
      setLoading(true)
      const response = await fetch('/api/tour-slots?manage=1', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load tour availability.')

      const loadedSlots: LuxorTourSlot[] = payload.slots || []
      setSlots(loadedSlots)

      if (Array.isArray(payload.availability) && payload.availability.length === 7) {
        setSchedule(
          payload.availability.map((day: LuxorTourAvailability) => ({
            ...day,
            times: Array.isArray(day.times) && day.times.length > 0
              ? day.times
              : day.is_open
                ? tourTimesForAvailability(day).map((t) => t.startTime)
                : [],
          })),
        )
      }

      if (payload.settings) {
        setSettings({
          ...DEFAULT_TOUR_SCHEDULE_SETTINGS,
          ...payload.settings,
        })
      }

      // Group future slots into flexible dates
      const dateMap = new Map<string, string[]>()
      const today = isoDate(new Date())
      for (const slot of loadedSlots) {
        if (slot.slot_date >= today && slot.status === 'available') {
          const list = dateMap.get(slot.slot_date) || []
          if (!list.includes(slot.start_time)) list.push(slot.start_time)
          dateMap.set(slot.slot_date, list)
        }
      }
      const loadedFlexible = Array.from(dateMap.entries())
        .map(([date, times]) => ({
          date,
          times: times.sort((a, b) => luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setFlexibleDates(loadedFlexible)
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Could not load tour availability.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Active mode switcher
  const mode = settings.mode

  function handleModeChange(newMode: LuxorTourScheduleMode) {
    setSettings((current) => ({ ...current, mode: newMode }))
  }

  // Weeks Ahead calculation & preview stats
  const weeksAhead = settings.weeks_ahead
  const cutoffDate = useMemo(() => getWeeksAheadCutoffDate(weeksAhead), [weeksAhead])
  const todayStr = useMemo(() => isoDate(new Date()), [])

  const availableSlotsInWindow = useMemo(() => {
    return slots.filter((slot) => {
      return (
        slot.status === 'available' &&
        slot.booked_count < slot.capacity &&
        slot.slot_date >= todayStr &&
        slot.slot_date <= cutoffDate &&
        isLuxorTourSlotAtLeast24HoursAway(slot.slot_date, slot.start_time)
      )
    })
  }, [slots, todayStr, cutoffDate])

  const previewDateRange = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startDate = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const end = new Date(`${cutoffDate}T12:00:00Z`)
    const endDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${startDate} – ${endDate}`
  }, [cutoffDate])

  // Weekly Schedule Helpers
  function toggleWeeklyDay(weekday: number) {
    setSchedule((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day
        const nextIsOpen = !day.is_open
        let nextTimes = day.times || []
        if (nextIsOpen && nextTimes.length === 0) {
          nextTimes = ['16:00:00', '17:00:00', '18:00:00']
        }
        return {
          ...day,
          is_open: nextIsOpen,
          times: nextTimes,
        }
      }),
    )
  }

  function addTimeToDay(weekday: number, timeStr: string) {
    if (!timeStr) return
    const formatted = normalizeTourTime(timeStr)
    setSchedule((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day
        const existing = day.times || []
        if (existing.includes(formatted)) return day
        const nextTimes = [...existing, formatted].sort(
          (a, b) => luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b),
        )
        return { ...day, times: nextTimes }
      }),
    )
    setWeeklyTimeSelect((prev) => ({ ...prev, [weekday]: '' }))
  }

  function removeTimeFromDay(weekday: number, timeStr: string) {
    setSchedule((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day
        const nextTimes = (day.times || []).filter((t) => t !== timeStr)
        return { ...day, times: nextTimes }
      }),
    )
  }

  // Flexible Schedule Helpers
  function handleSelectFlexibleDate(dateStr: string) {
    setNewFlexibleDate(dateStr)
    const existing = flexibleDates.find((d) => d.date === dateStr)
    if (existing) {
      setSelectedGridTimes(existing.times)
    } else {
      setSelectedGridTimes([])
    }
  }

  function toggleGridTime(timeStr: string) {
    const formatted = normalizeTourTime(timeStr)
    setSelectedGridTimes((current) => {
      if (current.includes(formatted)) {
        return current.filter((t) => t !== formatted)
      }
      return [...current, formatted].sort(
        (a, b) => luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b),
      )
    })
  }

  function selectAllGridTimes() {
    const allTimes = LUXOR_TOUR_TIME_OPTIONS.map((opt) => normalizeTourTime(opt.value)).sort(
      (a, b) => luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b),
    )
    setSelectedGridTimes(allTimes)
  }

  function clearAllGridTimes() {
    setSelectedGridTimes([])
  }

  function addSelectedTimesToDate() {
    if (!newFlexibleDate) {
      notify({ title: 'Please choose a date first.', variant: 'error' })
      return
    }
    if (selectedGridTimes.length === 0) {
      notify({ title: 'Please select at least one tour time.', variant: 'error' })
      return
    }

    const sortedTimes = [...selectedGridTimes].sort(
      (a, b) => luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b),
    )

    setFlexibleDates((current) => {
      const exists = current.some((d) => d.date === newFlexibleDate)
      if (exists) {
        return current.map((d) => (d.date === newFlexibleDate ? { ...d, times: sortedTimes } : d))
      }
      return [...current, { date: newFlexibleDate, times: sortedTimes }].sort((a, b) =>
        a.date.localeCompare(b.date),
      )
    })

    notify({
      title: `Saved ${sortedTimes.length} tour time${sortedTimes.length === 1 ? '' : 's'} for ${formatTourSlotDate(newFlexibleDate)}.`,
      variant: 'success',
    })
  }

  function editFlexibleDate(dateStr: string) {
    handleSelectFlexibleDate(dateStr)
  }

  function removeFlexibleDate(dateStr: string) {
    setFlexibleDates((current) => current.filter((d) => d.date !== dateStr))
    if (newFlexibleDate === dateStr) {
      setSelectedGridTimes([])
    }
  }

  function removeTimeFromFlexibleDate(dateStr: string, timeStr: string) {
    setFlexibleDates((current) =>
      current.map((item) => {
        if (item.date !== dateStr) return item
        return { ...item, times: item.times.filter((t) => t !== timeStr) }
      }),
    )
    if (newFlexibleDate === dateStr) {
      setSelectedGridTimes((current) => current.filter((t) => t !== timeStr))
    }
  }

  // Calendar mini grid for flexible view
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ]
  }, [month])

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

  // Save Operations
  async function saveWeeklySchedule() {
    try {
      setSaving('weekly')
      const response = await fetch('/api/tour-slots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availability: schedule,
          settings: { ...settings, mode: 'weekly' },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save weekly schedule.')
      if (payload.availability) setSchedule(payload.availability)
      if (payload.slots) setSlots(payload.slots)
      if (payload.settings) setSettings(payload.settings)
      notify({ title: 'Weekly recurring tour schedule saved.', variant: 'success' })
      await onUpdated?.()
    } catch (error) {
      notify({
        title: error instanceof Error ? error.message : 'Could not save weekly schedule.',
        variant: 'error',
      })
    } finally {
      setSaving(null)
    }
  }

  async function saveFlexibleSchedule() {
    try {
      setSaving('flexible')
      const response = await fetch('/api/tour-slots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flexibleSchedule: { dates: flexibleDates },
          settings: { ...settings, mode: 'flexible' },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save flexible schedule.')
      if (payload.slots) setSlots(payload.slots)
      if (payload.settings) setSettings(payload.settings)
      notify({ title: 'Flexible tour schedule saved.', variant: 'success' })
      await onUpdated?.()
    } catch (error) {
      notify({
        title: error instanceof Error ? error.message : 'Could not save flexible schedule.',
        variant: 'error',
      })
    } finally {
      setSaving(null)
    }
  }

  // Preview Form Data
  const previewAvailableDates = useMemo(() => {
    const dates = new Set(availableSlotsInWindow.map((s) => s.slot_date))
    return Array.from(dates).sort()
  }, [availableSlotsInWindow])

  const previewSlotsForSelectedDate = useMemo(() => {
    if (!previewSelectedDate) return []
    return availableSlotsInWindow.filter((s) => s.slot_date === previewSelectedDate)
  }, [availableSlotsInWindow, previewSelectedDate])

  if (loading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center">
        <Loader2 size={24} className="animate-spin text-[#caa24c]" />
        <p className="text-xs font-medium text-[color:var(--portal-muted)]">Loading tour availability & schedule settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* SECTION HEADER & PUBLIC STATUS BANNER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">
            {title}
          </span>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{description}</p>
        </div>

        <PortalButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setPreviewSelectedDate(previewAvailableDates[0] || '')
            setPreviewOpen(true)
          }}
          className="flex items-center gap-2 self-start font-semibold text-[#caa24c]"
        >
          <Eye size={14} /> Preview Guest Booking Form
        </PortalButton>
      </div>

      {/* TOP STATUS CARD (Prompt Req 7) */}
      <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--portal-faint)]">
                Public Schedule
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {availableSlotsInWindow.length > 0 ? 'Tours are currently accepting bookings' : 'No upcoming open slots'}
              </span>
            </div>
            <p className="text-xs font-medium text-[color:var(--portal-text)]">
              {mode === 'weekly' ? 'Weekly Schedule' : 'Flexible Schedule'} · {weeksAhead} week{weeksAhead === 1 ? '' : 's'} ahead · <strong className="text-[#caa24c]">{availableSlotsInWindow.length}</strong> available tour times
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-right">
            <CalendarDays size={16} className="text-[#caa24c]" />
            <div className="text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Window</p>
              <p className="text-xs font-semibold text-[color:var(--portal-text)]">{previewDateRange}</p>
            </div>
          </div>
        </div>
      </section>

      {/* SCHEDULING METHOD SELECTOR (Prompt Req 6) */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
          Scheduling method
        </label>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            onClick={() => handleModeChange('weekly')}
            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition-all ${
              mode === 'weekly'
                ? 'border-[#caa24c] bg-[#caa24c]/15 text-[#f1d27a] shadow-sm'
                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Weekly Schedule
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('flexible')}
            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition-all ${
              mode === 'flexible'
                ? 'border-[#caa24c] bg-[#caa24c]/15 text-[#f1d27a] shadow-sm'
                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Flexible Schedule
          </button>
        </div>
      </div>

      {/* 1. WEEKLY RECURRING SCHEDULE (Prompt Req 1 & 6) */}
      {mode === 'weekly' && (
        <div className="space-y-6 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <div className="border-b border-[color:var(--portal-border)] pb-3">
            <h3 className="text-sm font-bold text-[color:var(--portal-text)]">Weekly recurring availability</h3>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
              Tours will automatically repeat on these selected days and times for every upcoming week.
            </p>
          </div>

          {/* Days of Week List */}
          <div className="space-y-3">
            {schedule.map((day) => {
              const dayTimes = day.times || []
              const availableTimeOptions = LUXOR_TOUR_TIME_OPTIONS.filter(
                (opt) => !dayTimes.includes(normalizeTourTime(opt.value)),
              )

              return (
                <div
                  key={day.weekday}
                  className={`rounded-xl border p-4 transition-all ${
                    day.is_open
                      ? 'border-[#caa24c]/35 bg-[#caa24c]/[0.04]'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] opacity-70'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => toggleWeeklyDay(day.weekday)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          day.is_open
                            ? 'border-[#caa24c] bg-[#caa24c] text-[#241b0d]'
                            : 'border-[color:var(--portal-faint)]'
                        }`}
                      >
                        {day.is_open ? <Check size={13} /> : null}
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-[color:var(--portal-text)]">
                          {LUXOR_WEEKDAY_LABELS[day.weekday]}
                        </span>
                        <span className="block text-[10px] text-[color:var(--portal-muted)]">
                          {day.is_open ? `${dayTimes.length} tour time${dayTimes.length === 1 ? '' : 's'} offered` : 'No tours offered'}
                        </span>
                      </div>
                    </button>

                    {day.is_open && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Time Chips */}
                        {dayTimes.map((timeStr) => (
                          <span
                            key={timeStr}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/40 bg-[#caa24c]/15 px-2.5 py-1 text-xs font-semibold text-[color:var(--portal-text)]"
                          >
                            <Clock3 size={12} className="text-[#caa24c]" />
                            {formatTourSlotTime(timeStr)}
                            <button
                              type="button"
                              onClick={() => removeTimeFromDay(day.weekday, timeStr)}
                              aria-label={`Remove ${formatTourSlotTime(timeStr)} from ${LUXOR_WEEKDAY_LABELS[day.weekday]}`}
                              className="ml-0.5 rounded p-0.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/30 hover:text-[color:var(--portal-text)]"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}

                        {/* Inline Add Time Dropdown */}
                        <div className="w-32">
                          <PortalSelect
                            value={weeklyTimeSelect[day.weekday] || ''}
                            onChange={(val) => addTimeToDay(day.weekday, val)}
                            options={availableTimeOptions}
                            placeholder="+ Add time"
                            className="w-full"
                            buttonClassName="!min-h-8 !py-1 text-xs !bg-[color:var(--portal-card)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Weeks Ahead Horizon Setting (Prompt Req 3) */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-xs font-bold text-[color:var(--portal-text)]">
                  How far ahead should guests be able to book?
                </label>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                  Controls how many weeks into the future dates are generated and displayed on the guest booking form.
                </p>
              </div>
              <div className="w-48 shrink-0">
                <PortalSelect
                  value={String(settings.weeks_ahead)}
                  onChange={(val) => setSettings((current) => ({ ...current, weeks_ahead: Number(val) }))}
                  options={WEEKS_AHEAD_SELECT_OPTIONS}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Public Availability Preview (Prompt Req 6) */}
          <div className="rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/[0.05] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#caa24c]">
                  Public availability preview
                </span>
                <p className="mt-1 text-sm font-bold text-[color:var(--portal-text)]">
                  {previewDateRange}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                  {availableSlotsInWindow.length} tour times will be open and bookable for guests.
                </p>
              </div>
              <Sparkles size={24} className="text-[#caa24c]/60" />
            </div>
          </div>

          {/* Save Action */}
          <div className="flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-[color:var(--portal-muted)]">
              Saving automatically generates all tour dates for the next {settings.weeks_ahead} weeks. Booked tours are always preserved.
            </p>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void saveWeeklySchedule()}
              disabled={Boolean(saving)}
              className="font-bold"
            >
              {saving === 'weekly' ? <Loader2 size={14} className="animate-spin" /> : null} Save weekly schedule
            </PortalButton>
          </div>
        </div>
      )}

      {/* 2. FLEXIBLE SCHEDULE (Prompt Req 2, 4 & 6) */}
      {mode === 'flexible' && (
        <div className="space-y-6 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <div className="border-b border-[color:var(--portal-border)] pb-3">
            <h3 className="text-sm font-bold text-[color:var(--portal-text)]">Flexible availability</h3>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
              Manually choose exactly which dates and times tours are available. Recurring availability will not be automatically generated.
            </p>
          </div>

          {/* Date & Multi-Time Selection Section */}
          <div className="space-y-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                1. Choose Date
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-72">
                  <PortalDatePicker
                    value={newFlexibleDate}
                    onChange={handleSelectFlexibleDate}
                    minDate={todayStr}
                    placeholder="Choose date..."
                    className="w-full"
                  />
                </div>
                {newFlexibleDate && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/40 bg-[#caa24c]/15 px-3 py-1.5 text-xs font-bold text-[color:var(--portal-text)]">
                    <CalendarDays size={13} className="text-[#caa24c]" />
                    {formatTourSlotDate(newFlexibleDate)}
                  </span>
                )}
              </div>
            </div>

            {/* Time Grid (Prompt Req 1, 2, 3 & 4) */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[color:var(--portal-border)] pt-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-text)]">
                    2. Select Tour Times {newFlexibleDate ? `for ${formatTourSlotDate(newFlexibleDate)}` : ''}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[color:var(--portal-muted)]">
                    8:00 AM – 7:30 PM (30-minute intervals). Click times to toggle them.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllGridTimes}
                    className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--portal-text)] hover:border-[#caa24c]/40 hover:text-[#caa24c] transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllGridTimes}
                    disabled={selectedGridTimes.length === 0}
                    className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] disabled:opacity-40 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* 24-Slot Multi-Select Grid (8:00 AM to 7:30 PM) */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LUXOR_TOUR_TIME_OPTIONS.map((opt) => {
                  const normalized = normalizeTourTime(opt.value)
                  const isSelected = selectedGridTimes.includes(normalized)

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleGridTime(normalized)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-[#caa24c] bg-[#caa24c]/20 text-[#f1d27a] shadow-sm ring-1 ring-[#caa24c]/50 font-bold'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-card)]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isSelected ? (
                          <Check size={13} className="text-[#caa24c]" />
                        ) : (
                          <Clock3 size={13} className="text-[color:var(--portal-muted)]" />
                        )}
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Add Selected Times Action Bar (Prompt Req 3) */}
              <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-[color:var(--portal-muted)]">
                  <strong className="text-[color:var(--portal-text)]">{selectedGridTimes.length}</strong> of {LUXOR_TOUR_TIME_OPTIONS.length} times selected
                </span>

                <PortalButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!newFlexibleDate || selectedGridTimes.length === 0}
                  onClick={addSelectedTimesToDate}
                  className="font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add Selected Times {selectedGridTimes.length > 0 ? `(${selectedGridTimes.length})` : ''}
                </PortalButton>
              </div>
            </div>
          </div>

          {/* Configured Flexible Dates List (Prompt Req 5) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                Configured Tour Dates ({flexibleDates.length})
              </h4>
            </div>

            {flexibleDates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-8 text-center">
                <Calendar size={28} className="mx-auto text-[color:var(--portal-muted)] opacity-50" />
                <p className="mt-2 text-xs font-semibold text-[color:var(--portal-text)]">No flexible dates configured yet</p>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                  Choose a date and select your desired tour times above, then click &ldquo;Add Selected Times&rdquo;.
                </p>
              </div>
            ) : (
              flexibleDates.map((item) => {
                const isActiveInEditor = newFlexibleDate === item.date

                return (
                  <div
                    key={item.date}
                    className={`rounded-xl border p-4 transition-all ${
                      isActiveInEditor
                        ? 'border-[#caa24c]/60 bg-[#caa24c]/[0.06] ring-1 ring-[#caa24c]/30'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="block text-sm font-bold text-[color:var(--portal-text)]">
                            {formatTourSlotDate(item.date)}
                          </span>
                          {isActiveInEditor && (
                            <span className="rounded bg-[#caa24c]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#f1d27a]">
                              Editing in grid
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-[color:var(--portal-muted)]">
                          {item.times.length} tour time{item.times.length === 1 ? '' : 's'} configured
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Time Chips */}
                        {item.times.map((timeStr) => (
                          <span
                            key={timeStr}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/40 bg-[#caa24c]/15 px-2.5 py-1 text-xs font-semibold text-[color:var(--portal-text)]"
                          >
                            <Clock3 size={12} className="text-[#caa24c]" />
                            {formatTourSlotTime(timeStr)}
                            <button
                              type="button"
                              onClick={() => removeTimeFromFlexibleDate(item.date, timeStr)}
                              aria-label={`Remove ${formatTourSlotTime(timeStr)} on ${formatTourSlotDate(item.date)}`}
                              className="ml-0.5 rounded p-0.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/30 hover:text-[color:var(--portal-text)]"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}

                        {/* Edit Times Button */}
                        <button
                          type="button"
                          onClick={() => editFlexibleDate(item.date)}
                          className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-xs font-semibold text-[color:var(--portal-text)] hover:border-[#caa24c]/40 hover:text-[#caa24c] transition-colors"
                        >
                          Edit times
                        </button>

                        {/* Remove Date Button */}
                        <button
                          type="button"
                          onClick={() => removeFlexibleDate(item.date)}
                          aria-label={`Remove date ${formatTourSlotDate(item.date)}`}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Calendar Mini-Grid (Prompt Req 2) */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-[color:var(--portal-text)]">Calendar Overview</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  className="rounded-lg p-1.5 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-semibold text-[color:var(--portal-text)]">
                  {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  className="rounded-lg p-1.5 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d} className="pb-1 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                  {d}
                </span>
              ))}
              {calendarDays.map((date, idx) => {
                if (!date) return <span key={`empty-${idx}`} />
                const val = isoDate(date)
                const published = publishedByDate.get(val)
                const isFlexibleConfigured = flexibleDates.some((f) => f.date === val)
                const isSelectedInEditor = newFlexibleDate === val

                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSelectFlexibleDate(val)}
                    className={`relative flex min-h-10 flex-col items-center justify-center rounded-lg border text-xs transition-all ${
                      isSelectedInEditor
                        ? 'border-[#caa24c] bg-[#caa24c]/25 font-bold text-[color:var(--portal-text)] ring-2 ring-[#caa24c]'
                        : isFlexibleConfigured
                          ? 'border-[#caa24c] bg-[#caa24c]/15 font-bold text-[color:var(--portal-text)] hover:bg-[#caa24c]/20'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    <span>{date.getDate()}</span>
                    {published?.open ? (
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    ) : published?.booked ? (
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#caa24c]" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Weeks Ahead Horizon Setting (Prompt Req 3) */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-xs font-bold text-[color:var(--portal-text)]">
                  How far ahead should guests be able to book?
                </label>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                  Controls how far into the future flexible tour dates are displayed on the public booking form.
                </p>
              </div>
              <div className="w-48 shrink-0">
                <PortalSelect
                  value={String(settings.weeks_ahead)}
                  onChange={(val) => setSettings((current) => ({ ...current, weeks_ahead: Number(val) }))}
                  options={WEEKS_AHEAD_SELECT_OPTIONS}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* 4. FLEXIBLE SCHEDULE REMINDER (Prompt Req 4) */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({ ...current, reminder_enabled: !current.reminder_enabled }))
                  }
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#caa24c] bg-[#caa24c]/15 text-[#f1d27a]"
                >
                  {settings.reminder_enabled ? <Check size={13} /> : null}
                </button>
                <div>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--portal-text)]">
                    <Bell size={14} className="text-[#caa24c]" /> Remind me to update my tour schedule
                  </span>
                  <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                    Your tour schedule needs updating · Add your upcoming tour availability so guests can continue booking tours.
                  </p>
                </div>
              </div>

              {settings.reminder_enabled && (
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                      Every
                    </label>
                    <PortalSelect
                      value={String(settings.reminder_day)}
                      onChange={(val) => setSettings((current) => ({ ...current, reminder_day: Number(val) }))}
                      options={REMINDER_DAY_OPTIONS}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                      Time
                    </label>
                    <PortalSelect
                      value={settings.reminder_time.slice(0, 5)}
                      onChange={(val) => setSettings((current) => ({ ...current, reminder_time: val }))}
                      options={REMINDER_TIME_OPTIONS}
                      className="mt-1 w-full"
                    />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[color:var(--portal-faint)]">
                Note: This reminder is active only while Flexible Schedule is enabled.
              </p>
            </div>
          </div>

          {/* Save Action */}
          <div className="flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-[color:var(--portal-muted)]">
              Saves your custom dates and times. Existing client bookings remain completely reserved.
            </p>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void saveFlexibleSchedule()}
              disabled={Boolean(saving)}
              className="font-bold"
            >
              {saving === 'flexible' ? <Loader2 size={14} className="animate-spin" /> : null} Save flexible schedule
            </PortalButton>
          </div>
        </div>
      )}

      {/* GUEST BOOKING FORM PREVIEW MODAL (Prompt Req 7) */}
      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Eye size={18} className="text-[#caa24c]" />
                  <h3 className="text-base font-bold text-[color:var(--portal-text)]">
                    Guest Booking Form Preview
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Live preview of what prospective clients see on the public tour booking page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {/* Date Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                  1. Select an Available Tour Date ({previewAvailableDates.length} dates available)
                </label>
                {previewAvailableDates.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-[color:var(--portal-border)] p-4 text-xs text-[color:var(--portal-muted)]">
                    No tour slots currently available within the {weeksAhead}-week window.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewAvailableDates.map((dateStr) => {
                      const isSelected = previewSelectedDate === dateStr
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => {
                            setPreviewSelectedDate(dateStr)
                            setPreviewSelectedTime('')
                          }}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'border-[#caa24c] bg-[#caa24c] text-[#241b0d] shadow'
                              : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/40'
                          }`}
                        >
                          {formatTourSlotDate(dateStr)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Time Selector for Selected Date */}
              {previewSelectedDate && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">
                    2. Select a Tour Time for {formatTourSlotDate(previewSelectedDate)}
                  </label>
                  {previewSlotsForSelectedDate.length === 0 ? (
                    <p className="mt-2 text-xs text-[color:var(--portal-muted)]">
                      No available times for this date.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {previewSlotsForSelectedDate.map((slot) => {
                        const isSelected = previewSelectedTime === slot.id
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setPreviewSelectedTime(slot.id)}
                            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition-all ${
                              isSelected
                                ? 'border-[#caa24c] bg-[#caa24c] text-[#241b0d] shadow'
                                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/40'
                            }`}
                          >
                            <Clock3 size={14} />
                            {formatTourSlotTime(slot.start_time)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Safeguard & Synchronized Notice */}
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-[11px] text-[color:var(--portal-muted)]">
                <p>
                  ✓ <strong>Direct Connection:</strong> When a client selects a time and confirms their tour, that slot is instantly reserved and disappears from this list so nobody else can double-book it.
                </p>
                <p className="mt-1">
                  ✓ <strong>Notice Rule:</strong> Tour times less than 24 hours away are automatically hidden to ensure adequate preparation time.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-[color:var(--portal-border)] pt-4">
              <PortalButton type="button" onClick={() => setPreviewOpen(false)}>
                Close Preview
              </PortalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


