'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar as CalendarIcon, Check, Plus, Settings2, ExternalLink, Mail, RefreshCw, Send, Trash2, UserCheck, UserX } from 'lucide-react'
import { PortalCalendar, PortalCalendarDayStatus, PortalCalendarItem, PortalCalendarView } from '@/components/portal/PortalCalendar'
import { LuxorAvailabilityCalendar } from '@/components/portal/LuxorAvailabilityCalendar'
import { TourAvailabilityManager } from '@/components/portal/TourAvailabilityManager'
import { AddCalendarTaskModal } from '@/components/portal/AddCalendarTaskModal'
import { PortalAnimatedTabs, PortalButton, PortalModal, PortalPageFrame, PortalPageHeader, PortalSkeleton, PortalSkeletonTransition, PortalStatusBadge, PortalTabTransition, PortalStaggerGroup, PortalStaggerCard, type PortalStatusTone } from '@/components/portal/PortalUI'
import type { LuxorBooking, LuxorInquiry, LuxorTask, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'
import type { LuxorTourSlot } from '@/lib/luxorTourSlots'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import type { LuxorAvailabilityCalendar as LuxorAvailabilityMap } from '@/lib/luxorAvailability'
import type { PendingProposalSummary } from '@/lib/luxorPendingProposals'
import type { LuxorPlannerCalendarMeeting } from '@/lib/luxorPlannerCalendar'
import { createLuxorTourAttendancePayload } from '@/lib/luxorTourOutcome'
import { getLuxorScheduleTours, getLuxorTourSection, isLuxorDateInUpcomingSchedule, LUXOR_TOUR_TIMEZONE, luxorDateKey, luxorTodayKey, type LuxorTourSection } from '@/lib/luxorTourMetrics'
import { useToast } from '@/components/portal/ToastProvider'

type CalendarPayload = {
  tours: LuxorInquiry[]
  slots: LuxorTourSlot[]
  bookings: (LuxorBooking & { paid_total?: number; balance_due?: number })[]
  plannerMeetings: LuxorPlannerCalendarMeeting[]
  plannerMeetingsError?: string | null
  tasks: CalendarTask[]
  availability: LuxorAvailabilityMap
  pendingProposals: PendingProposalSummary[]
  pendingProposalCounts: Record<string, number>
  pendingProposalsError?: string | null
}

type CalendarTask = LuxorTask & {
  inquiry_context?: { id: string; full_name: string; event_type: string | null; target_date: string | null } | null
  inquiry_context_status?: 'linked' | 'unlinked' | 'unavailable'
}

const TOUR_STATUS_PRESENTATION: Record<LuxorTourSection, { label: string; tone: PortalStatusTone }> = {
  today: { label: 'Today', tone: 'blue' },
  upcoming: { label: 'Upcoming', tone: 'gold' },
  completed: { label: 'Completed', tone: 'green' },
  no_shows: { label: 'No Show', tone: 'red' },
  needs_outcome: { label: 'Needs Outcome', tone: 'gold' },
  needs_schedule: { label: 'Needs Schedule', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

function getTourStatusPresentation(tour: LuxorInquiry) {
  return TOUR_STATUS_PRESENTATION[getLuxorTourSection(tour, luxorTodayKey()) ?? 'needs_schedule']
}

function getCalendarTourTone(section: LuxorTourSection | null) {
  if (!section) return 'zinc'
  const toneBySection: Record<LuxorTourSection, PortalCalendarItem['tone']> = {
    today: 'blue', upcoming: 'gold', completed: 'green', no_shows: 'rose',
    needs_outcome: 'warning', needs_schedule: 'zinc', cancelled: 'zinc',
  }
  return toneBySection[section]
}

function getCalendarBookingTone(status: string, eventDate: string | null, todayKey: string): PortalCalendarItem['tone'] {
  if (status === 'cancelled' || status === 'draft') return 'zinc'
  if (status === 'completed') return 'green'
  const dateKey = eventDate ? luxorDateKey(eventDate) : ''
  if (dateKey === todayKey) return 'blue'
  if (dateKey > todayKey) return 'gold'
  return status === 'confirmed' ? 'green' : 'gold'
}

function calendarDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function timeLabel(value?: string | null) {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  const hour = Number(match[1])
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${match[2]} ${suffix}`
}

function meetingTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: LUXOR_TOUR_TIMEZONE }).format(date)
}

export default function CalendarPage() {
  const [activeCalendar, setActiveCalendar] = useState<'tours' | 'events'>('tours')
  const [view, setView] = useState<PortalCalendarView>('schedule')
  const [data, setData] = useState<CalendarPayload>({ tours: [], slots: [], bookings: [], plannerMeetings: [], tasks: [], availability: {}, pendingProposals: [], pendingProposalCounts: {} })
  const [selectedEventDate, setSelectedEventDate] = useState(() => luxorTodayKey())
  const [scheduleToday, setScheduleToday] = useState(() => luxorTodayKey())
  const [loading, setLoading] = useState(true)
  const initialLoadComplete = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const { notify } = useToast()

  const loadData = useCallback(async (): Promise<boolean> => {
    try {
      if (!initialLoadComplete.current) setLoading(true)
      setError(null)
      const response = await fetch('/api/calendar-data')
      if (response.status === 401) {
        window.location.replace('/portal/login?error=session-expired')
        return false
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load calendar.')
      setData(payload)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar.')
      return false
    } finally {
      setLoading(false)
      initialLoadComplete.current = true
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const refreshToday = () => setScheduleToday(luxorTodayKey())
    const timer = window.setInterval(refreshToday, 60_000)
    window.addEventListener('focus', refreshToday)
    document.addEventListener('visibilitychange', refreshToday)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshToday)
      document.removeEventListener('visibilitychange', refreshToday)
    }
  }, [])

  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return

    let refreshTimer: number | null = null
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void loadData()
        notify({ title: 'Calendar updated.', variant: 'success' })
      }, 250)
    }

    const channel = supabase
      .channel('luxor-calendar-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_inquiries' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_tour_slots' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_bookings' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_invoices' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_proposal_activity' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luxor_tasks' }, scheduleRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`Calendar realtime channel entered ${status}.`)
      })

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [loadData, notify])

  const updateAttendance = async (tour: LuxorInquiry, attendance: LuxorTourAttendanceStatus) => {
    try {
      setBusyId(tour.id)
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createLuxorTourAttendancePayload({ inquiryId: tour.id, attendance, expectedAttendance: tour.tour_attendance_status || null, visitId: tour.current_tour_visit_id, visitVersion: tour.current_tour_visit_version })),
      })
      const payload = await response.json() as { error?: string; warnings?: string[] }
      if (!response.ok) throw new Error(payload.error || 'Failed to update attendance.')
      const refreshed = await loadData()
      const warnings = [...(payload.warnings ?? [])]
      if (!refreshed) warnings.push('The outcome was saved, but the calendar could not be refreshed.')
      notify({ title: 'Tour outcome saved', description: warnings.length ? warnings.join(' ') : 'The tour outcome was saved without sending a message.', variant: warnings.length ? 'warning' : 'success' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update attendance.')
    } finally {
      setBusyId(null)
    }
  }

  const dismissTask = useCallback(async (taskId: string, complete = false) => {
    const status = complete ? 'completed' : 'cancelled'
    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status, ...(complete ? { completed_at: new Date().toISOString() } : {}) }),
    })
    const payload = await response.json() as { status?: string; error?: string }
    if (!response.ok) throw new Error(payload.error || 'Task could not be dismissed.')
    if (payload.status !== status) throw new Error('The task update could not be confirmed. Refresh and try again.')

  }, [])

  const queueTourEmail = async (tour: LuxorInquiry, jobType: string) => {
    try {
      setBusyId(`${tour.id}-${jobType}`)
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: tour.id, action: 'send-email', jobType }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to queue email.')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to queue email.')
    } finally {
      setBusyId(null)
    }
  }

  const sendContract = async (booking: LuxorBooking) => {
    try {
      setBusyId(`contract-${booking.id}`)
      const response = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to send contract.')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send contract.')
    } finally {
      setBusyId(null)
    }
  }

  const updateContractRequest = async (booking: LuxorBooking, action: 'cancel' | 'resend') => {
    if (action === 'cancel' && !window.confirm('Cancel this contract? The client’s current signing link will stop working immediately.')) return
    try {
      setBusyId(`${action}-contract-${booking.id}`)
      const response = await fetch('/api/signatures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, action }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to update contract.')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update contract.')
    } finally {
      setBusyId(null)
    }
  }

  const tourItems = useMemo<PortalCalendarItem[]>(() => {
    const todayKey = scheduleToday
    const tourCards = getLuxorScheduleTours(data.tours, todayKey, view !== 'schedule')
      .map((tour) => {
        const section = getLuxorTourSection(tour, todayKey)
        return ({
        id: `tour-${tour.id}`,
        date: tour.preferred_tour_date!,
        title: tour.full_name,
        subtitle: `${tour.preferred_tour_time || 'Flexible time'} • ${tour.event_type || 'Event'}${tour.guest_count ? ` • ${tour.guest_count} guests` : ''}`,
        tone: getCalendarTourTone(section),
        warningLabel: section === 'needs_outcome' ? 'Needs Outcome' : undefined,
        href: `/portal/leads/${tour.id}?tab=overview&stage=${tour.tour_attendance_status === 'attended' ? 'proposal' : 'tour'}`,
        openLabel: 'Open tour',
        content: (
          <TourControls
            tour={tour}
            busyId={busyId}
            onAttendance={updateAttendance}
            onEmail={queueTourEmail}
          />
        ),
      } satisfies PortalCalendarItem)
      })

    // Published availability is represented by the day status, not as a placeholder
    // calendar item. Only booked tours with a saved date belong in the calendar.
    return tourCards
  }, [busyId, data.slots, data.tours, scheduleToday, view])

  const tourDayStatuses = useMemo<Record<string, PortalCalendarDayStatus>>(() => {
    const statuses: Record<string, PortalCalendarDayStatus> = {}
    for (const slot of data.slots) {
      const isOpen = slot.status === 'available' && slot.booked_count < slot.capacity
      if (isOpen) statuses[slot.slot_date] = 'open'
      else if (!statuses[slot.slot_date]) statuses[slot.slot_date] = 'closed'
    }
    return statuses
  }, [data.slots])

  const taskItems = useMemo<PortalCalendarItem[]>(() => {
    return data.tasks
      .filter((task) => task.status === 'pending' && task.due_date)
      .map((task) => ({
        id: `task-${task.id}`,
        date: task.due_date!,
        title: task.title,
        subtitle: buildTaskSubtitle(task),
        tone: task.priority === 'urgent' ? 'rose' : task.priority === 'high' ? 'gold' : 'blue',
        href: buildTaskHref(task),
        openLabel: buildTaskOpenLabel(task),
        taskContext: {
          leadName: task.inquiry_context?.full_name?.trim() || null,
          eventType: task.inquiry_context?.event_type?.trim() || null,
          eventDate: task.inquiry_context?.target_date || null,
          leadHref: task.inquiry_context?.id ? `/portal/leads/${task.inquiry_context.id}?tab=overview` : undefined,
          linked: Boolean(task.inquiry_context),
          unavailable: task.inquiry_context_status === 'unavailable',
        },
        content: <TaskSummary task={task} />,
        dismissLabel: task.task_type ? 'Complete task' : 'Dismiss task',
        onDismiss: () => dismissTask(task.id, Boolean(task.task_type)),
        onDismissed: () => {
          setData((current) => ({ ...current, tasks: current.tasks.filter((currentTask) => currentTask.id !== task.id) }))
          notify({ title: task.task_type ? 'Task completed' : 'Task dismissed', description: 'It remains in task history.', variant: 'success' })
        },
      } satisfies PortalCalendarItem))
  }, [data.tasks, dismissTask, notify])

  const upcomingTaskItems = useMemo(() => view === 'schedule'
    ? taskItems.filter((item) => isLuxorDateInUpcomingSchedule(item.date, scheduleToday))
    : taskItems, [scheduleToday, taskItems, view])
  const overdueTaskItems = useMemo(() => view === 'schedule'
    ? taskItems.filter((item) => !isLuxorDateInUpcomingSchedule(item.date, scheduleToday))
    : [], [scheduleToday, taskItems, view])

  const eventItems = useMemo<PortalCalendarItem[]>(() => {
    const todayKey = scheduleToday
    const bookings = data.bookings
      .filter((booking) => booking.event_date
        && (view !== 'schedule' || (booking.status === 'confirmed' && isLuxorDateInUpcomingSchedule(booking.event_date, todayKey))))
      .map((booking) => ({
        id: `booking-${booking.id}`,
        date: booking.event_date!,
        title: booking.client_name,
        subtitle: `${booking.event_type || 'Event'}${booking.guest_count ? ` • ${booking.guest_count} guests` : ''}`,
        tone: getCalendarBookingTone(booking.status, booking.event_date, todayKey),
        href: booking.inquiry_id ? `/portal/leads/${booking.inquiry_id}?tab=documents&section=lead-booking` : undefined,
        openLabel: 'Open booking',
        content: (
          <EventControls
            booking={booking}
            busyId={busyId}
            onSendContract={sendContract}
            onContractAction={updateContractRequest}
          />
        ),
      } satisfies PortalCalendarItem))
    const meetings = data.plannerMeetings
      .filter((meeting) => view !== 'schedule' || isLuxorDateInUpcomingSchedule(meeting.starts_at, todayKey))
      .map((meeting) => ({
        id: `planner-meeting-${meeting.id}`,
        date: luxorDateKey(meeting.starts_at),
        title: meeting.title,
        subtitle: `Planning meeting · ${meetingTimeLabel(meeting.starts_at)} · ${meeting.duration_minutes} min`,
        tone: 'blue' as const,
        href: `/portal/planner/event/${meeting.booking_id}?tab=meetings#meeting-${meeting.id}`,
        openLabel: 'Open planning meeting',
      } satisfies PortalCalendarItem))
      .filter((meeting) => Boolean(meeting.date))
    return [...bookings, ...meetings]
  }, [busyId, data.bookings, data.plannerMeetings, scheduleToday, view])

  const todayStats = useMemo(() => {
    const todayKey = luxorTodayKey()
    const tours = data.tours.filter((tour) => tour.preferred_tour_date === todayKey && tour.tour_attendance_status !== 'cancelled').length
    const tasks = data.tasks.filter((task) => task.status === 'pending' && task.due_date === todayKey).length
    const openTimes = data.slots.filter((slot) => slot.status === 'available' && slot.booked_count < slot.capacity && slot.slot_date >= todayKey).length
    return { tours, tasks, openTimes }
  }, [data.slots, data.tasks, data.tours])

  const selectedDateBookings = useMemo(() => data.bookings.filter((booking) => booking.event_date && luxorDateKey(booking.event_date) === selectedEventDate), [data.bookings, selectedEventDate])
  const confirmedDateBookings = selectedDateBookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const holdDateBookings = selectedDateBookings.filter((booking) => booking.status === 'tentative')
  const pendingDateProposals = useMemo(() => data.pendingProposals.filter((proposal) => proposal.date === selectedEventDate), [data.pendingProposals, selectedEventDate])

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<CalendarIcon size={18} />}
        title="Tours & Booked Events"
        titleClassName="text-lg sm:text-2xl"
        mobileActionsInline
        actions={
          <PortalButton type="button" variant="primary" size="sm" onClick={() => setAddTaskOpen(true)}><Plus size={15} aria-hidden="true" /> Add Task</PortalButton>
        }
      />

      <PortalAnimatedTabs
        ariaLabel="Calendar sections"
        tabs={[{ id: 'tours', label: 'Tours + Tasks' }, { id: 'events', label: 'Booked Events' }] as const}
        activeTab={activeCalendar}
        onTabChange={setActiveCalendar}
        className="min-w-0"
        buttonClassName="max-sm:flex-1 max-sm:justify-center max-sm:!px-2"
        trailing={activeCalendar === 'tours' ? <button type="button" onClick={() => setScheduleOpen(true)} aria-haspopup="dialog" aria-label="Tour schedule" title="Tour schedule" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><Settings2 size={16} aria-hidden="true" /></button> : undefined}
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
      ) : null}

      <PortalTabTransition activeKey={activeCalendar} className="flex-1 min-h-0 flex flex-col space-y-4">
        {activeCalendar === 'tours' ? (
          <div className="flex-1 min-h-0 flex flex-col space-y-4">
            <div>
              <div className="grid grid-cols-3 divide-x divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]" aria-label="Calendar at a glance">
                <GlanceStat label="Tours today" value={todayStats.tours} loading={loading} />
                <GlanceStat label="Tasks due today" value={todayStats.tasks} loading={loading} />
                <GlanceStat label="Available tour times" value={todayStats.openTimes} loading={loading} />
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <PortalCalendar
                title="Tours & tasks"
                items={[...tourItems, ...upcomingTaskItems]}
                supplementalItems={overdueTaskItems}
                view={view}
                onViewChange={setView}
                dayStatuses={tourDayStatuses}
                loading={loading}
                animateLoadingTransition
              />
            </div>
          </div>
        ) : (
          <PortalStaggerGroup staggerDelay={0.06} className="flex-1 min-h-0 flex flex-col space-y-4">
            <PortalStaggerCard className="flex-1 min-h-0 flex flex-col">
              {view === 'month' ? (
                <section className="portal-card-surface portal-surface min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] p-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Booked events</p><h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--portal-text)]">Event availability</h2></div>
            <PortalAnimatedTabs ariaLabel="Booked events calendar view" tabs={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' }, { id: 'schedule', label: 'Schedule' }] as const} activeTab={view} onTabChange={setView} className="!w-auto max-w-full overflow-x-auto" buttonClassName="!px-3" />
          </div>

          {data.pendingProposalsError ? <p role="status" className="mx-4 mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-300/25 dark:bg-amber-500/10 dark:text-amber-200">Pending proposal counts could not be loaded. Availability is current.</p> : null}
          {data.plannerMeetingsError ? <p role="status" className="mx-4 mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-300/25 dark:bg-amber-500/10 dark:text-amber-200">{data.plannerMeetingsError} Existing booking calendar data is still available.</p> : null}

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:divide-x lg:divide-[color:var(--portal-border)]">
            <LuxorAvailabilityCalendar availability={data.availability} availabilityReady={!loading && !error} selectedDate={selectedEventDate} onSelectDate={setSelectedEventDate} pendingCounts={!error ? data.pendingProposalCounts : {}} embedded compact />

            <section aria-labelledby="selected-event-date-heading" className="min-w-0 border-t border-[color:var(--portal-border)] p-4 sm:p-5 lg:border-t-0">
              <h2 id="selected-event-date-heading" className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">{calendarDateLabel(selectedEventDate)}</h2>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Bookings and holds affect availability. Proposals are shown separately.</p>

              <div className="mt-5 space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f]">Confirmed bookings</h3>
                {confirmedDateBookings.length ? confirmedDateBookings.map((booking) => (
                  <article key={booking.id} className="min-w-0 border-b border-[color:var(--portal-border)] pb-4 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {booking.inquiry_id ? <Link href={`/portal/leads/${booking.inquiry_id}`} className="block truncate text-sm font-semibold text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{booking.client_name || booking.event_type || 'Confirmed event'}</Link> : <h4 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{booking.client_name || booking.event_type || 'Confirmed event'}</h4>}
                        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{booking.event_type || 'Event'}{booking.guest_count ? ` · ${booking.guest_count} guests` : ''}</p>
                        {booking.start_time || booking.end_time ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{timeLabel(booking.start_time) || 'Time TBD'}{booking.end_time ? ` – ${timeLabel(booking.end_time)}` : ''}</p> : null}
                      </div>
                      {booking.inquiry_id ? <Link href={`/portal/leads/${booking.inquiry_id}?tab=documents&section=lead-booking`} className="shrink-0 text-xs font-semibold text-[#8c6529] hover:text-[#a8792f] dark:text-[#f1d27a]">Open booking <ExternalLink size={12} className="ml-1 inline" /></Link> : null}
                    </div>
                    <div className="mt-3 border-t border-[color:var(--portal-border)] pt-3">
                      <EventControls booking={booking} busyId={busyId} onSendContract={sendContract} onContractAction={updateContractRequest} />
                    </div>
                  </article>
                )) : <p className="text-xs text-[color:var(--portal-muted)]">No confirmed bookings for this date.</p>}
              </div>

              {holdDateBookings.length ? <div className="mt-5 space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Active holds</h3>
                {holdDateBookings.map((booking) => <p key={booking.id} className="text-xs text-[color:var(--portal-text)]"><span className="font-semibold">{booking.event_type || 'Event hold'}</span>{booking.start_time && booking.end_time ? ` · ${timeLabel(booking.start_time)} – ${timeLabel(booking.end_time)}` : ''} <PortalStatusBadge status="tentative" /></p>)}
              </div> : null}

              <div className="mt-5 space-y-3 border-t border-[color:var(--portal-border)] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f]">Pending proposals</h3>
                  {pendingDateProposals.length ? <span className="text-xs font-semibold text-[color:var(--portal-muted)]">{pendingDateProposals.length} pending</span> : null}
                </div>
                {data.pendingProposalsError ? <p role="status" className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-4 text-xs text-amber-900 dark:border-amber-300/25 dark:bg-amber-500/10 dark:text-amber-200">Pending proposal details could not be loaded.</p> : pendingDateProposals.length ? pendingDateProposals.map((proposal) => (
                  <article key={proposal.id} className="border-b border-[color:var(--portal-border)] pb-3 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-[color:var(--portal-text)]">{proposal.title}</h4>
                        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Event date: {calendarDateLabel(proposal.date)} · {proposal.rentalPeriod} · {proposal.status} · sent {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(proposal.sentAt))}</p>
                      </div>
                      {proposal.href ? <Link href={proposal.href} className="shrink-0 text-xs font-semibold text-[#8c6529] hover:text-[#a8792f] dark:text-[#f1d27a]">Open proposal <ExternalLink size={12} className="ml-1 inline" /></Link> : null}
                    </div>
                  </article>
                )) : <p className="text-xs text-[color:var(--portal-muted)]">No pending proposals for this date.</p>}
              </div>
            </section>
          </div>
        </section>
      ) : (
        <PortalCalendar title="Booked events" items={eventItems} view={view} onViewChange={setView} initialDate={selectedEventDate} onAnchorChange={setSelectedEventDate} />
              )}
            </PortalStaggerCard>
          </PortalStaggerGroup>
        )}
      </PortalTabTransition>
      <AddCalendarTaskModal isOpen={addTaskOpen} onClose={() => setAddTaskOpen(false)} onCreated={async () => { notify({ title: 'Task added', variant: 'success' }); await loadData() }} />
      <PortalModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Tour schedule"
        description="Set the days and times guests can book. Saving updates the public booking form."
        maxWidth="max-w-4xl"
        className="h-[88vh] sm:h-[85vh]"
      >
        <TourAvailabilityManager hideHeader onUpdated={async () => { await loadData() }} />
      </PortalModal>
    </PortalPageFrame>
  )
}

function GlanceStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <PortalSkeletonTransition
        loading={loading}
        overlap
        className="h-6 w-8 shrink-0"
        skeleton={<PortalSkeleton className="h-full w-full rounded" />}
      >
        <p className="whitespace-nowrap text-lg font-semibold tabular-nums leading-6 text-[color:var(--portal-text)]">{value}</p>
      </PortalSkeletonTransition>
      <p className="min-w-0 text-[10px] font-semibold leading-tight text-[color:var(--portal-muted)] sm:text-xs">{label}</p>
    </div>
  )
}

function TourControls({
  tour,
  busyId,
  onAttendance,
  onEmail,
}: {
  tour: LuxorInquiry
  busyId: string | null
  onAttendance: (tour: LuxorInquiry, attendance: LuxorTourAttendanceStatus) => void
  onEmail: (tour: LuxorInquiry, jobType: string) => void
}) {
  const presentation = getTourStatusPresentation(tour)
  return (
    <div className="space-y-3">
      {tour.message ? <p className="line-clamp-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">{tour.message}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <ActionButton disabled={busyId === tour.id} onClick={() => onAttendance(tour, 'attended')} icon={<UserCheck size={11} />} label={tour.tour_attendance_status === 'no_show' ? 'Correct to attended' : 'Attended'} />
        {tour.tour_attendance_status !== 'no_show' && <ActionButton disabled={busyId === tour.id} onClick={() => onAttendance(tour, 'no_show')} icon={<UserX size={11} />} label={tour.tour_attendance_status === 'attended' ? 'Correct to no-show' : 'No-show'} />}
        <ActionButton disabled={busyId === `${tour.id}-tour_confirmation`} onClick={() => onEmail(tour, 'tour_confirmation')} icon={<Send size={11} />} label="Confirm email" />
        <ActionButton disabled={busyId === `${tour.id}-tour_no_show_reschedule`} onClick={() => onEmail(tour, 'tour_no_show_reschedule')} icon={<Mail size={11} />} label="Reschedule" />
      </div>
      <div className="flex items-center justify-between">
        <PortalStatusBadge status={presentation.label} tone={presentation.tone} warning={presentation.label === 'Needs Outcome'} />
        <Link href={`/portal/leads/${tour.id}?tab=overview&stage=${tour.tour_attendance_status === 'attended' ? 'proposal' : 'tour'}`} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
          Open <ExternalLink size={10} className="inline" />
        </Link>
      </div>
    </div>
  )
}

function EventControls({
  booking,
  busyId,
  onSendContract,
  onContractAction,
}: {
  booking: LuxorBooking & { paid_total?: number; balance_due?: number }
  busyId: string | null
  onSendContract: (booking: LuxorBooking) => void
  onContractAction: (booking: LuxorBooking, action: 'cancel' | 'resend') => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-[10px] text-[color:var(--portal-muted)]">
        <span>Contract: <b className="text-[color:var(--portal-text)]">{(booking.contract_status || 'not_sent').replaceAll('_', ' ')}</b></span>
        <span>Balance: <b className="text-[color:var(--portal-text)]">${Number(booking.balance_due || 0).toLocaleString()}</b></span>
        <span>Paid: <b className="text-[color:var(--portal-text)]">${Number(booking.paid_total || 0).toLocaleString()}</b></span>
        <span>Deposit: <b className="text-[color:var(--portal-text)]">{booking.security_deposit_status || 'not collected'}</b></span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PortalStatusBadge status={booking.status} />
        <PortalStatusBadge status={booking.contract_status || 'not_sent'} />
        {!booking.contract_status || ['not_sent', 'void'].includes(booking.contract_status) ? (
          <ActionButton disabled={busyId === `contract-${booking.id}`} onClick={() => onSendContract(booking)} icon={<Check size={11} />} label="Send contract" />
        ) : null}
        {booking.contract_status === 'sent' || booking.contract_status === 'viewed' ? (
          <>
            <ActionButton disabled={busyId !== null} onClick={() => onContractAction(booking, 'resend')} icon={<RefreshCw size={11} className={busyId === `resend-contract-${booking.id}` ? 'animate-spin' : ''} />} label="Resend" />
            <ActionButton disabled={busyId !== null} onClick={() => onContractAction(booking, 'cancel')} icon={<Trash2 size={11} />} label="Cancel" />
          </>
        ) : null}
      </div>
      {booking.inquiry_id ? (
        <Link href={`/portal/leads/${booking.inquiry_id}?tab=documents&section=lead-booking`} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
          Client record <ExternalLink size={10} className="inline" />
        </Link>
      ) : null}
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] disabled:opacity-45"
    >
      {icon}
      {label}
    </button>
  )
}

function TaskSummary({ task }: { task: LuxorTask }) {
  const description = cleanTaskDescription(task.description)
  return (
    <div className="space-y-3">
      {description ? <p className="min-w-0 max-w-full whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--portal-muted)]">{description}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <PortalStatusBadge status={task.status} />
        <PortalStatusBadge status={task.priority} />
      </div>
    </div>
  )
}

function cleanTaskDescription(description: string | null) {
  return (description || '').replace(/^(?:\[(?:follow-up:(?:email|phone)|post-tour|automatic)\]\s*)+/i, '').trim()
}

function buildTaskSubtitle(task: LuxorTask) {
  if (task.task_type) {
    const typeLabels = { todo: 'To-do', call: 'Call', email: 'Email', meeting: 'Meeting', other: 'Other' }
    const time = task.due_at && !Number.isNaN(new Date(task.due_at).getTime())
      ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: LUXOR_TOUR_TIMEZONE }).format(new Date(task.due_at))
      : null
    return [typeLabels[task.task_type], time ? `${time} Central` : null, task.description].filter(Boolean).join(' · ')
  }
  if (/review bounced email address/i.test(task.title)) {
    const bouncedAddress = task.description?.match(/^Bounced recipient:\s*(.+)$/im)?.[1]?.trim()
    return [`${task.priority} priority`, bouncedAddress ? `Bounced: ${bouncedAddress}` : 'Bounced email address'].join(' · ')
  }

  const description = cleanTaskDescription(task.description)
  return `${task.priority} priority${description ? ` • ${description}` : ''}`
}

function buildTaskHref(task: LuxorTask) {
  if (!task.inquiry_id) return undefined
  const params = new URLSearchParams({
    tab: 'tasks',
    section: 'lead-tasks',
    highlightTask: task.id,
  })

  const routing = task.task_type ? { tab: 'tasks' as const, section: 'lead-tasks', stage: undefined, planningTab: undefined } : getTaskRouting(task)
  params.set('tab', routing.tab)
  if (routing.section) params.set('section', routing.section)
  if (routing.stage) params.set('stage', routing.stage)
  if (routing.planningTab) params.set('planningTab', routing.planningTab)

  return `/portal/leads/${task.inquiry_id}?${params.toString()}`
}

function buildTaskOpenLabel(task: LuxorTask) {
  if (task.task_type) return 'Open task'
  const routing = getTaskRouting(task)
  if (routing.tab === 'documents') return 'Open booking'
  if (routing.tab === 'overview' && routing.stage === 'tour') return 'Open tour'
  if (routing.tab === 'overview' && routing.stage === 'planning') return 'Open planning'
  return 'Open task'
}

function getTaskRouting(task: LuxorTask): {
  tab: 'overview' | 'tasks' | 'documents'
  section?: string
  stage?: string
  planningTab?: string
} {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()

  if (/\btour\b|\bwalkthrough\b|\bvisit\b/.test(text)) {
    return { tab: 'overview', stage: 'tour' }
  }

  if (/\btimeline\b|\brun of show\b/.test(text)) {
    return { tab: 'overview', stage: 'planning', planningTab: 'timeline' }
  }

  if (/\bvendor\b/.test(text)) {
    return { tab: 'overview', stage: 'planning', planningTab: 'vendors' }
  }

  if (/\bcatering\b|\bbar\b|\bfood\b|\bbeverage\b/.test(text)) {
    return { tab: 'overview', stage: 'planning', planningTab: 'fb' }
  }

  if (/\bdecor\b|\bdesign\b|\bfloral\b/.test(text)) {
    return { tab: 'overview', stage: 'planning', planningTab: 'decor' }
  }

  if (/\bcontract\b|\binvoice\b|\bpayment\b|\bdeposit\b|\bproposal\b|\bbooking\b/.test(text)) {
    return { tab: 'documents', section: 'lead-booking' }
  }

  return { tab: 'tasks', section: 'lead-tasks' }
}

