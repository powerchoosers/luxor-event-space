'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from '@/lib/icons/phosphor-compat'
import {
  PortalButton,
  PortalCheckbox,
  PortalDatePicker,
  PortalGhostIconButton,
  PortalModal,
  PortalSelect,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
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
  description = 'Choose when guests can book a private venue tour.',
  onUpdated,
  hideHeader = false,
}: {
  title?: string
  description?: string
  publishLabel?: string
  onUpdated?: () => void | Promise<void>
  defaultExpanded?: boolean
  hideHeader?: boolean
} = {}) {
  const { notify } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'weekly' | 'flexible' | 'settings' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [slots, setSlots] = useState<LuxorTourSlot[]>([])
  const [schedule, setSchedule] = useState<LuxorTourAvailability[]>(FALLBACK_SCHEDULE)
  const [settings, setSettings] = useState<LuxorTourScheduleSettings>(DEFAULT_TOUR_SCHEDULE_SETTINGS)

  const [flexibleDates, setFlexibleDates] = useState<Array<{ date: string; times: string[] }>>([])
  const [newFlexibleDate, setNewFlexibleDate] = useState('')
  const [selectedGridTimes, setSelectedGridTimes] = useState<string[]>([])
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const [weeklyTimeSelect, setWeeklyTimeSelect] = useState<Record<number, string>>({})

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
            times:
              Array.isArray(day.times) && day.times.length > 0
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

      const dateMap = new Map<string, string[]>()
      const today = isoDate(new Date())
      for (const slot of loadedSlots) {
        if (slot.slot_date >= today && (slot.status === 'available' || slot.status === 'booked')) {
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
      notify({
        title: error instanceof Error ? error.message : 'Could not load tour availability.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const mode = settings.mode

  function handleModeChange(newMode: LuxorTourScheduleMode) {
    setSettings((current) => ({ ...current, mode: newMode }))
  }

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

  const upcomingSlotsInWindow = useMemo(
    () => slots.filter((slot) => slot.slot_date >= todayStr && slot.slot_date <= cutoffDate),
    [slots, todayStr, cutoffDate],
  )

  const previewDateRange = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startDate = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const end = new Date(`${cutoffDate}T12:00:00Z`)
    const endDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${startDate} – ${endDate}`
  }, [cutoffDate])

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
      current
        .map((item) => {
          if (item.date !== dateStr) return item
          return { ...item, times: item.times.filter((t) => t !== timeStr) }
        })
        .filter((item) => item.times.length > 0),
    )
    if (newFlexibleDate === dateStr) {
      setSelectedGridTimes((current) => current.filter((t) => t !== timeStr))
    }
  }

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
      if (slot.status === 'available' && slot.booked_count < slot.capacity) item.open += 1
      if (slot.status === 'booked' || slot.booked_count > 0) item.booked += 1
      map.set(slot.slot_date, item)
    }
    return map
  }, [slots])

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

  const previewAvailableDates = useMemo(() => {
    const dates = new Set(availableSlotsInWindow.map((s) => s.slot_date))
    return Array.from(dates).sort()
  }, [availableSlotsInWindow])

  const previewSlotsForSelectedDate = useMemo(() => {
    if (!previewSelectedDate) return []
    return availableSlotsInWindow.filter((s) => s.slot_date === previewSelectedDate)
  }, [availableSlotsInWindow, previewSelectedDate])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className={hideHeader ? 'hidden' : undefined}>
          <h3 className="text-base font-bold text-[color:var(--portal-text)]">{title}</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{description}</p>
        </div>

        <PortalButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => {
            setPreviewSelectedDate(previewAvailableDates[0] || '')
            setPreviewSelectedTime('')
            setPreviewOpen(true)
          }}
          className="self-start"
        >
          <Eye size={14} aria-hidden="true" />
          Preview guest booking form
        </PortalButton>
      </div>

      {/* Public Status Summary */}
      <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[color:var(--portal-muted)]">Public schedule</span>
              <PortalSkeletonTransition
                loading={loading}
                overlap
                className="inline-flex items-center"
                skeleton={<PortalSkeleton className="h-5 w-32 rounded-md" />}
              >
                <PortalStatusBadge
                  borderless
                  tone={availableSlotsInWindow.length > 0 ? 'green' : 'neutral'}
                  status={availableSlotsInWindow.length > 0 ? 'Accepting bookings' : 'No upcoming open slots'}
                />
              </PortalSkeletonTransition>
            </div>
            <PortalSkeletonTransition
              loading={loading}
              overlap
              skeleton={<PortalSkeleton className="h-4 w-56 rounded" />}
            >
              <p className="text-xs font-medium tabular-nums text-[color:var(--portal-text)]">
                {mode === 'weekly' ? 'Weekly schedule' : 'Flexible schedule'} · {weeksAhead} week{weeksAhead === 1 ? '' : 's'} ahead ·{' '}
                <strong className="text-[#a8792f] dark:text-[#caa24c]">{availableSlotsInWindow.length}</strong> available times
              </p>
            </PortalSkeletonTransition>
          </div>

          <div className="flex items-center gap-2.5 self-start rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-2 sm:self-auto">
            <CalendarDays size={16} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-medium text-[color:var(--portal-muted)]">Booking window</p>
              <PortalSkeletonTransition
                loading={loading}
                overlap
                skeleton={<PortalSkeleton className="mt-0.5 h-4 w-24 rounded" />}
              >
                <p className="text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">{previewDateRange}</p>
              </PortalSkeletonTransition>
            </div>
          </div>
        </div>
      </section>

      <details className="border-y border-[color:var(--portal-border)] py-3">
        <summary className="cursor-pointer text-sm font-semibold text-[color:var(--portal-text)]">
          Upcoming tour capacity{loading ? '' : ` (${upcomingSlotsInWindow.length})`}
        </summary>
        <p className="mt-1.5 text-xs text-[color:var(--portal-muted)]">
          Confirmed bookings per time. Full slots automatically close for guests.
        </p>
        <PortalSkeletonTransition
          loading={loading}
          skeleton={
            <div className="mt-3 space-y-2">
              <PortalSkeleton className="h-5 w-full rounded" />
              <PortalSkeleton className="h-5 w-5/6 rounded" />
            </div>
          }
        >
          {upcomingSlotsInWindow.length ? (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {upcomingSlotsInWindow.map((slot) => (
                <li
                  key={slot.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs text-[color:var(--portal-text)]"
                >
                  <span className="font-medium tabular-nums">
                    {formatTourSlotDate(slot.slot_date)} · {formatTourSlotTime(slot.start_time)}
                  </span>
                  <span className="shrink-0 tabular-nums text-[color:var(--portal-muted)]">
                    {slot.booked_count}/{slot.capacity} booked ·{' '}
                    {slot.status === 'booked' || slot.booked_count >= slot.capacity
                      ? 'Full'
                      : slot.status === 'available'
                        ? 'Open'
                        : 'Unavailable'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-[color:var(--portal-muted)]">No upcoming tour times in this window.</p>
          )}
        </PortalSkeletonTransition>
      </details>

      {/* Scheduling Method */}
      <div className="space-y-2">
        <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Scheduling method</span>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleModeChange('weekly')}
            className={`flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
              mode === 'weekly'
                ? 'border-[#caa24c]/60 bg-[#caa24c]/15 text-[#9a6d26] dark:text-[#f1d27a]'
                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Weekly schedule
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleModeChange('flexible')}
            className={`flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
              mode === 'flexible'
                ? 'border-[#caa24c]/60 bg-[#caa24c]/15 text-[#9a6d26] dark:text-[#f1d27a]'
                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Flexible schedule
          </button>
        </div>
      </div>

      {/* 1. Weekly Recurring Schedule */}
      {mode === 'weekly' && (
        <div className="space-y-5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="border-b border-[color:var(--portal-border)] pb-3">
            <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Weekly recurring availability</h4>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              Repeat these days and times automatically each week.
            </p>
          </div>

          <div className="space-y-3">
            {schedule.map((day) => {
              const dayTimes = day.times || []
              const availableTimeOptions = LUXOR_TOUR_TIME_OPTIONS.filter(
                (opt) => !dayTimes.includes(normalizeTourTime(opt.value)),
              )

              return (
                <div
                  key={day.weekday}
                  className={`rounded-xl border p-4 transition-colors ${
                    !loading && day.is_open
                      ? 'border-[#caa24c]/35 bg-[#caa24c]/[0.04]'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {loading ? (
                      <div className="flex items-center gap-2.5">
                        <PortalSkeleton className="h-4 w-4 rounded" />
                        <span className="text-xs font-semibold text-[color:var(--portal-text)]">
                          {LUXOR_WEEKDAY_LABELS[day.weekday]}
                        </span>
                      </div>
                    ) : (
                      <PortalCheckbox
                        checked={day.is_open}
                        onChange={() => toggleWeeklyDay(day.weekday)}
                        label={LUXOR_WEEKDAY_LABELS[day.weekday]}
                        sublabel={
                          day.is_open
                            ? `${dayTimes.length} tour time${dayTimes.length === 1 ? '' : 's'} offered`
                            : 'Closed'
                        }
                      />
                    )}

                    <PortalSkeletonTransition
                      loading={loading}
                      overlap
                      skeleton={<PortalSkeleton className="h-8 w-44 rounded-lg" />}
                    >
                      {day.is_open ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {dayTimes.map((timeStr) => (
                            <span
                              key={timeStr}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/12 px-2.5 py-1 text-xs font-semibold tabular-nums text-[color:var(--portal-text)]"
                            >
                              <Clock3 size={12} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                              {formatTourSlotTime(timeStr)}
                              <button
                                type="button"
                                onClick={() => removeTimeFromDay(day.weekday, timeStr)}
                                aria-label={`Remove ${formatTourSlotTime(timeStr)} from ${LUXOR_WEEKDAY_LABELS[day.weekday]}`}
                                className="ml-0.5 rounded p-0.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/25 hover:text-[color:var(--portal-text)]"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}

                          <div className="w-36">
                            <PortalSelect
                              value={weeklyTimeSelect[day.weekday] || ''}
                              onChange={(val) => addTimeToDay(day.weekday, val)}
                              options={availableTimeOptions}
                              placeholder="+ Add time"
                              className="w-full"
                              buttonClassName="!min-h-8.5 !py-1 text-xs !bg-[color:var(--portal-card)]"
                            />
                          </div>
                        </div>
                      ) : null}
                    </PortalSkeletonTransition>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-[color:var(--portal-text)]">How far ahead can guests book?</p>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                  Controls how many future weeks appear on the public booking form.
                </p>
              </div>
              <div className="w-full shrink-0 sm:w-48">
                <PortalSkeletonTransition
                  loading={loading}
                  overlap
                  skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                >
                  <PortalSelect
                    value={String(settings.weeks_ahead)}
                    onChange={(val) => setSettings((current) => ({ ...current, weeks_ahead: Number(val) }))}
                    options={WEEKS_AHEAD_SELECT_OPTIONS}
                    className="w-full"
                    buttonClassName="min-h-10"
                  />
                </PortalSkeletonTransition>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/[0.05] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#a8792f] dark:text-[#caa24c]">Public availability preview</p>
                <PortalSkeletonTransition
                  loading={loading}
                  overlap
                  skeleton={
                    <div className="mt-1 space-y-1">
                      <PortalSkeleton className="h-4 w-28 rounded" />
                      <PortalSkeleton className="h-3.5 w-44 rounded" />
                    </div>
                  }
                >
                  <div>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-[color:var(--portal-text)]">{previewDateRange}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-[color:var(--portal-muted)]">
                      {availableSlotsInWindow.length} tour times open for guests.
                    </p>
                  </div>
                </PortalSkeletonTransition>
              </div>
              <Sparkles size={22} className="shrink-0 text-[#a8792f]/70 dark:text-[#caa24c]/70" aria-hidden="true" />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[color:var(--portal-muted)]">
              Generates dates for the next {settings.weeks_ahead} weeks while keeping existing bookings intact.
            </p>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void saveWeeklySchedule()}
              disabled={Boolean(saving) || loading}
              className="w-full shrink-0 sm:w-auto"
            >
              {saving === 'weekly' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              Save weekly schedule
            </PortalButton>
          </div>
        </div>
      )}

      {/* 2. Flexible Schedule */}
      {mode === 'flexible' && (
        <div className="space-y-5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="border-b border-[color:var(--portal-border)] pb-3">
            <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Flexible availability</h4>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              Pick exact dates and tour times instead of a repeating weekly schedule.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
            <div>
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">1. Choose date</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-72">
                  <PortalDatePicker
                    value={newFlexibleDate}
                    onChange={handleSelectFlexibleDate}
                    minDate={todayStr}
                    placeholder="Choose date…"
                    className="w-full"
                    triggerClassName="min-h-10"
                  />
                </div>
                {newFlexibleDate ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#caa24c]/35 bg-[#caa24c]/12 px-3 py-1.5 text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">
                    <CalendarDays size={13} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                    {formatTourSlotDate(newFlexibleDate)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 border-t border-[color:var(--portal-border)] pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 className="text-xs font-bold text-[color:var(--portal-text)]">
                    2. Select tour times {newFlexibleDate ? `for ${formatTourSlotDate(newFlexibleDate)}` : ''}
                  </h5>
                  <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                    8:00 AM – 7:30 PM in 30-minute intervals.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <PortalButton size="sm" variant="secondary" onClick={selectAllGridTimes}>
                    Select all
                  </PortalButton>
                  <PortalButton
                    size="sm"
                    variant="ghost"
                    onClick={clearAllGridTimes}
                    disabled={selectedGridTimes.length === 0}
                  >
                    Clear all
                  </PortalButton>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LUXOR_TOUR_TIME_OPTIONS.map((opt) => {
                  const normalized = normalizeTourTime(opt.value)
                  const isSelected = selectedGridTimes.includes(normalized)

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleGridTime(normalized)}
                      className={`flex min-h-10 items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold tabular-nums transition-colors ${
                        isSelected
                          ? 'border-[#caa24c] bg-[#caa24c]/18 text-[#9a6d26] dark:text-[#f1d27a]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] hover:border-[#caa24c]/40'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isSelected ? (
                          <Check size={13} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                        ) : (
                          <Clock3 size={13} className="text-[color:var(--portal-muted)]" aria-hidden="true" />
                        )}
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
                  <strong className="text-[color:var(--portal-text)]">{selectedGridTimes.length}</strong> of{' '}
                  {LUXOR_TOUR_TIME_OPTIONS.length} times selected
                </span>

                <PortalButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!newFlexibleDate || selectedGridTimes.length === 0}
                  onClick={addSelectedTimesToDate}
                >
                  <Plus size={14} aria-hidden="true" />
                  Apply times{selectedGridTimes.length > 0 ? ` (${selectedGridTimes.length})` : ''}
                </PortalButton>
              </div>
            </div>
          </div>

          {/* Configured Dates */}
          <div className="space-y-3">
            <h5 className="text-xs font-semibold tabular-nums text-[color:var(--portal-muted)]">
              Configured tour dates ({flexibleDates.length})
            </h5>

            <PortalSkeletonTransition
              loading={loading}
              skeleton={
                <div className="space-y-2.5">
                  {[0, 1].map((idx) => (
                    <div key={idx} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
                      <PortalSkeleton className="h-4 w-40 rounded" />
                      <PortalSkeleton className="mt-2 h-6 w-56 rounded" />
                    </div>
                  ))}
                </div>
              }
            >
              {flexibleDates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-8 text-center">
                  <Calendar size={26} className="mx-auto text-[color:var(--portal-muted)] opacity-50" aria-hidden="true" />
                  <p className="mt-2 text-xs font-semibold text-[color:var(--portal-text)]">No flexible dates configured yet</p>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    Pick a date and time slots above to add them here.
                  </p>
                </div>
              ) : (
                flexibleDates.map((item) => {
                  const isActiveInEditor = newFlexibleDate === item.date

                  return (
                    <div
                      key={item.date}
                      className={`rounded-xl border p-4 transition-colors ${
                        isActiveInEditor
                          ? 'border-[#caa24c]/55 bg-[#caa24c]/[0.06]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold tabular-nums text-[color:var(--portal-text)]">
                              {formatTourSlotDate(item.date)}
                            </span>
                            {isActiveInEditor ? (
                              <PortalStatusBadge borderless tone="gold" status="Editing" />
                            ) : null}
                          </div>
                          <span className="block text-xs tabular-nums text-[color:var(--portal-muted)]">
                            {item.times.length} tour time{item.times.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {item.times.map((timeStr) => (
                            <span
                              key={timeStr}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/12 px-2.5 py-1 text-xs font-semibold tabular-nums text-[color:var(--portal-text)]"
                            >
                              <Clock3 size={12} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                              {formatTourSlotTime(timeStr)}
                              <button
                                type="button"
                                onClick={() => removeTimeFromFlexibleDate(item.date, timeStr)}
                                aria-label={`Remove ${formatTourSlotTime(timeStr)} on ${formatTourSlotDate(item.date)}`}
                                className="ml-0.5 rounded p-0.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/25 hover:text-[color:var(--portal-text)]"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}

                          <PortalButton size="sm" variant="secondary" onClick={() => editFlexibleDate(item.date)}>
                            Edit times
                          </PortalButton>

                          <PortalGhostIconButton
                            size="sm"
                            onClick={() => removeFlexibleDate(item.date)}
                            aria-label={`Remove date ${formatTourSlotDate(item.date)}`}
                            className="hover:!bg-red-500/10 hover:!text-red-500"
                          >
                            <Trash2 size={14} />
                          </PortalGhostIconButton>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </PortalSkeletonTransition>
          </div>

          {/* Calendar Overview */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-[color:var(--portal-text)]">Calendar overview</span>
              <div className="flex items-center gap-1">
                <PortalGhostIconButton
                  size="sm"
                  aria-label="Previous month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <ChevronLeft size={15} />
                </PortalGhostIconButton>
                <span className="px-1 text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">
                  {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <PortalGhostIconButton
                  size="sm"
                  aria-label="Next month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <ChevronRight size={15} />
                </PortalGhostIconButton>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d} className="pb-1 text-[11px] font-semibold text-[color:var(--portal-muted)]">
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
                    className={`relative flex min-h-10 flex-col items-center justify-center rounded-lg border text-xs tabular-nums transition-colors ${
                      isSelectedInEditor
                        ? 'border-[#caa24c] bg-[#caa24c]/25 font-bold text-[color:var(--portal-text)] ring-2 ring-[#caa24c]/40'
                        : isFlexibleConfigured
                          ? 'border-[#caa24c]/60 bg-[#caa24c]/12 font-bold text-[color:var(--portal-text)] hover:bg-[#caa24c]/20'
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

          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-[color:var(--portal-text)]">How far ahead can guests book?</p>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                  Controls how far ahead flexible dates appear on the booking form.
                </p>
              </div>
              <div className="w-full shrink-0 sm:w-48">
                <PortalSelect
                  value={String(settings.weeks_ahead)}
                  onChange={(val) => setSettings((current) => ({ ...current, weeks_ahead: Number(val) }))}
                  options={WEEKS_AHEAD_SELECT_OPTIONS}
                  className="w-full"
                  buttonClassName="min-h-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4">
            <PortalCheckbox
              checked={settings.reminder_enabled}
              onChange={(checked) => setSettings((current) => ({ ...current, reminder_enabled: checked }))}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Bell size={13} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                  Remind me to update my flexible tour schedule
                </span>
              }
              sublabel="Active only while Flexible schedule is enabled."
            />

            {settings.reminder_enabled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[color:var(--portal-muted)]">Day</span>
                  <PortalSelect
                    value={String(settings.reminder_day)}
                    onChange={(val) => setSettings((current) => ({ ...current, reminder_day: Number(val) }))}
                    options={REMINDER_DAY_OPTIONS}
                    className="w-full"
                    buttonClassName="min-h-10"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[color:var(--portal-muted)]">Time</span>
                  <PortalSelect
                    value={settings.reminder_time.slice(0, 5)}
                    onChange={(val) => setSettings((current) => ({ ...current, reminder_time: val }))}
                    options={REMINDER_TIME_OPTIONS}
                    className="w-full"
                    buttonClassName="min-h-10"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[color:var(--portal-muted)]">
              Saves your custom dates and times while keeping existing bookings reserved.
            </p>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void saveFlexibleSchedule()}
              disabled={Boolean(saving) || loading}
              className="w-full shrink-0 sm:w-auto"
            >
              {saving === 'flexible' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              Save flexible schedule
            </PortalButton>
          </div>
        </div>
      )}

      {/* Guest Booking Form Preview Modal */}
      <PortalModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Guest booking form preview"
        description="Live view of tour times shown on the public booking page."
        headerIcon={<Eye size={18} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />}
        maxWidth="max-w-2xl"
        footer={
          <div className="flex justify-end">
            <PortalButton type="button" onClick={() => setPreviewOpen(false)}>
              Close preview
            </PortalButton>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold tabular-nums text-[color:var(--portal-muted)]">
              1. Available tour dates ({previewAvailableDates.length})
            </p>
            {previewAvailableDates.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-[color:var(--portal-border)] p-4 text-xs text-[color:var(--portal-muted)]">
                No tour slots currently available within the {weeksAhead}-week window.
              </p>
            ) : (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {previewAvailableDates.map((dateStr) => {
                  const isSelected = previewSelectedDate === dateStr
                  return (
                    <PortalButton
                      key={dateStr}
                      size="sm"
                      variant={isSelected ? 'primary' : 'secondary'}
                      onClick={() => {
                        setPreviewSelectedDate(dateStr)
                        setPreviewSelectedTime('')
                      }}
                      className="tabular-nums"
                    >
                      {formatTourSlotDate(dateStr)}
                    </PortalButton>
                  )
                })}
              </div>
            )}
          </div>

          {previewSelectedDate ? (
            <div>
              <p className="text-xs font-semibold text-[color:var(--portal-muted)]">
                2. Tour times for {formatTourSlotDate(previewSelectedDate)}
              </p>
              {previewSlotsForSelectedDate.length === 0 ? (
                <p className="mt-2 text-xs text-[color:var(--portal-muted)]">No available times for this date.</p>
              ) : (
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {previewSlotsForSelectedDate.map((slot) => {
                    const isSelected = previewSelectedTime === slot.id
                    return (
                      <PortalButton
                        key={slot.id}
                        size="sm"
                        variant={isSelected ? 'primary' : 'secondary'}
                        onClick={() => setPreviewSelectedTime(slot.id)}
                        className="tabular-nums"
                      >
                        <Clock3 size={14} aria-hidden="true" />
                        {formatTourSlotTime(slot.start_time)}
                      </PortalButton>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-xs text-[color:var(--portal-muted)]">
            <p>Each slot holds up to two separate tours before closing automatically.</p>
            <p>Times less than 24 hours away are hidden to allow preparation time.</p>
          </div>
        </div>
      </PortalModal>
    </div>
  )
}
