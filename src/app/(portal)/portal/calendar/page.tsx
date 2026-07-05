'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar as CalendarIcon, Check, ExternalLink, Mail, RefreshCw, Send, UserCheck, UserX } from 'lucide-react'
import { PortalCalendar, PortalCalendarItem, PortalCalendarView } from '@/components/portal/PortalCalendar'
import { PortalPageFrame, PortalPageHeader, PortalStatusBadge } from '@/components/portal/PortalUI'
import type { LuxorBooking, LuxorInquiry } from '@/lib/luxorInquiryTypes'
import type { LuxorTourSlot } from '@/lib/luxorTourSlots'

type CalendarPayload = {
  tours: LuxorInquiry[]
  slots: LuxorTourSlot[]
  bookings: (LuxorBooking & { paid_total?: number; balance_due?: number })[]
}

export default function CalendarPage() {
  const [activeCalendar, setActiveCalendar] = useState<'tours' | 'events'>('tours')
  const [view, setView] = useState<PortalCalendarView>('month')
  const [data, setData] = useState<CalendarPayload>({ tours: [], slots: [], bookings: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/calendar-data')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load calendar.')
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const updateAttendance = async (tour: LuxorInquiry, attendance: string) => {
    try {
      setBusyId(tour.id)
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: tour.id, action: 'attendance', attendance }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to update attendance.')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update attendance.')
    } finally {
      setBusyId(null)
    }
  }

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

  const tourItems = useMemo<PortalCalendarItem[]>(() => {
    const tourCards = data.tours
      .filter((tour) => tour.preferred_tour_date)
      .map((tour) => ({
        id: `tour-${tour.id}`,
        date: tour.preferred_tour_date!,
        title: tour.full_name,
        subtitle: `${tour.preferred_tour_time || 'Flexible time'} • ${tour.event_type || 'Event'}${tour.guest_count ? ` • ${tour.guest_count} guests` : ''}`,
        tone: tour.tour_attendance_status === 'no_show' ? 'rose' : tour.tour_attendance_status === 'attended' ? 'green' : 'gold',
        content: (
          <TourControls
            tour={tour}
            busyId={busyId}
            onAttendance={updateAttendance}
            onEmail={queueTourEmail}
          />
        ),
      } satisfies PortalCalendarItem))

    const slotCards = data.slots.map((slot) => ({
      id: `slot-${slot.id}`,
      date: slot.slot_date,
      title: slot.title || 'Published tour slot',
      subtitle: `${formatTime(slot.start_time)}${slot.end_time ? ` - ${formatTime(slot.end_time)}` : ''} • ${Math.max(0, slot.capacity - slot.booked_count)} open`,
      tone: 'blue',
    } satisfies PortalCalendarItem))

    return [...tourCards, ...slotCards]
  }, [busyId, data.slots, data.tours])

  const eventItems = useMemo<PortalCalendarItem[]>(() => {
    return data.bookings
      .filter((booking) => booking.event_date)
      .map((booking) => ({
        id: `booking-${booking.id}`,
        date: booking.event_date!,
        title: booking.client_name,
        subtitle: `${booking.event_type || 'Event'}${booking.guest_count ? ` • ${booking.guest_count} guests` : ''}`,
        tone: booking.status === 'confirmed' ? 'green' : booking.status === 'cancelled' ? 'rose' : 'gold',
        content: (
          <EventControls
            booking={booking}
            busyId={busyId}
            onSendContract={sendContract}
          />
        ),
      } satisfies PortalCalendarItem))
  }, [busyId, data.bookings])

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<CalendarIcon size={18} />}
        title="Tours & Booked Events"
        description="Separate calendars for tour operations and confirmed event days."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1 text-[10px] font-black uppercase tracking-widest">
              <button
                type="button"
                onClick={() => setActiveCalendar('tours')}
                className={`rounded-lg px-3 py-2 ${activeCalendar === 'tours' ? 'bg-[#caa24c]/15 text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}
              >
                Tour Calendar
              </button>
              <button
                type="button"
                onClick={() => setActiveCalendar('events')}
                className={`rounded-lg px-3 py-2 ${activeCalendar === 'events' ? 'bg-[#caa24c]/15 text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}
              >
                Booked Events
              </button>
            </div>
            <button type="button" onClick={loadData} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-10 text-center text-sm text-[color:var(--portal-muted)]">
          Loading calendar...
        </div>
      ) : activeCalendar === 'tours' ? (
        <PortalCalendar title={`${data.tours.length} tour requests / ${data.slots.length} published slots`} items={tourItems} view={view} onViewChange={setView} />
      ) : (
        <PortalCalendar title={`${data.bookings.length} booked event records`} items={eventItems} view={view} onViewChange={setView} />
      )}
    </PortalPageFrame>
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
  onAttendance: (tour: LuxorInquiry, attendance: string) => void
  onEmail: (tour: LuxorInquiry, jobType: string) => void
}) {
  return (
    <div className="space-y-3">
      {tour.message ? <p className="line-clamp-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">{tour.message}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <ActionButton disabled={busyId === tour.id} onClick={() => onAttendance(tour, 'attended')} icon={<UserCheck size={11} />} label="Attended" />
        <ActionButton disabled={busyId === tour.id} onClick={() => onAttendance(tour, 'no_show')} icon={<UserX size={11} />} label="No-show" />
        <ActionButton disabled={busyId === `${tour.id}-tour_confirmation`} onClick={() => onEmail(tour, 'tour_confirmation')} icon={<Send size={11} />} label="Confirm email" />
        <ActionButton disabled={busyId === `${tour.id}-tour_no_show_reschedule`} onClick={() => onEmail(tour, 'tour_no_show_reschedule')} icon={<Mail size={11} />} label="Reschedule" />
      </div>
      <div className="flex items-center justify-between">
        <PortalStatusBadge status={tour.tour_attendance_status || 'pending'} />
        <Link href={`/portal/leads/${tour.id}`} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
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
}: {
  booking: LuxorBooking & { paid_total?: number; balance_due?: number }
  busyId: string | null
  onSendContract: (booking: LuxorBooking) => void
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
        <ActionButton disabled={busyId === `contract-${booking.id}` || booking.contract_status === 'signed'} onClick={() => onSendContract(booking)} icon={<Check size={11} />} label="Send contract" />
      </div>
      {booking.inquiry_id ? (
        <Link href={`/portal/leads/${booking.inquiry_id}`} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
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

function formatTime(value: string) {
  const [hours = '0', minutes = '0'] = value.split(':')
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}
