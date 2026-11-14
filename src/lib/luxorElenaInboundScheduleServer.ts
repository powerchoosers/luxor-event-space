import 'server-only'

import { buildLuxorAvailabilityCalendar, luxorAvailabilityStatusLabel, type LuxorAvailabilityCalendar } from './luxorAvailability'
import { annotateLuxorReviewAvailability } from './luxorAvailabilityReviewServer'
import { listLuxorBookingsWithPayments } from './luxorBookingsServer'
import { RENTAL_WINDOWS, LUXOR_EVENT_TIME_ZONE } from './luxorProposalTerms'
import { getLuxorTourScheduleSettings, listAvailableLuxorTourSlots } from './luxorTourSlotsServer'

function summarizeEventAvailability(calendar: LuxorAvailabilityCalendar, limit = 45) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: LUXOR_EVENT_TIME_ZONE }).format(new Date())
  const dates = Object.keys(calendar).filter((date) => date >= today).sort().slice(0, limit)
  return dates.map((date) => ({
    date,
    status: luxorAvailabilityStatusLabel(calendar[date]),
    am_booked: calendar[date]?.amBooked === true,
    pm_booked: calendar[date]?.pmBooked === true,
  }))
}

/** Verified tour and event scheduling facts for live Elena (no invented availability). */
export async function getElenaInboundScheduleContext() {
  const [tourSettings, tourSlots, bookings] = await Promise.all([
    getLuxorTourScheduleSettings(),
    listAvailableLuxorTourSlots(),
    listLuxorBookingsWithPayments(400, true).then((rows) => annotateLuxorReviewAvailability(rows)).catch(() => []),
  ])
  const calendar = buildLuxorAvailabilityCalendar(bookings)
  return {
    timezone: LUXOR_EVENT_TIME_ZONE,
    rental_windows: RENTAL_WINDOWS,
    tour_booking: {
      mode: tourSettings.mode,
      weeks_ahead: tourSettings.weeks_ahead,
      published_open_slots: tourSlots.slice(0, 24).map((slot) => ({
        id: slot.id,
        date: slot.date,
        time: slot.time,
        label: slot.label,
        seats_remaining: slot.availableSpots,
      })),
      note: 'Tour slots are venue walkthrough times, not event-date holds.',
    },
    event_schedule: {
      summary: summarizeEventAvailability(calendar),
      note: 'Event-date availability is morning, evening, full-day, or custom rental blocks. Only describe dates returned here.',
    },
  }
}