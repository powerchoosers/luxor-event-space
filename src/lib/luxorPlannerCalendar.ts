/** A deliberately small, read-only view of a Planner meeting for the portal calendar. */
export type LuxorPlannerMeetingCalendarSource = {
  id: string
  booking_id: string | null
  title: string
  starts_at: string
  duration_minutes: number
  status: string
}

export type LuxorPlannerCalendarMeeting = {
  id: string
  booking_id: string
  title: string
  starts_at: string
  duration_minutes: number
}

export function canIncludePlannerCalendarMeetings(status: string | null | undefined, hasPlannerPermission: boolean) {
  return status === 'active' && hasPlannerPermission
}

/**
 * Include only scheduled meetings tied to a booking already present in the
 * calendar payload. Do not forward Planner notes, agendas, client decisions,
 * or meeting URLs into the calendar response.
 */
export function toLuxorPlannerCalendarMeetings(
  source: LuxorPlannerMeetingCalendarSource[],
  calendarBookingIds: ReadonlySet<string>,
): LuxorPlannerCalendarMeeting[] {
  const unique = new Map<string, LuxorPlannerCalendarMeeting>()
  for (const meeting of source) {
    const bookingId = meeting.booking_id
    if (meeting.status !== 'scheduled' || !bookingId || !calendarBookingIds.has(bookingId)) continue
    if (!meeting.id || !meeting.title.trim() || !Number.isFinite(Date.parse(meeting.starts_at))) continue
    if (!Number.isInteger(meeting.duration_minutes) || meeting.duration_minutes < 5 || meeting.duration_minutes > 1440) continue
    if (!unique.has(meeting.id)) {
      unique.set(meeting.id, {
        id: meeting.id,
        booking_id: bookingId,
        title: meeting.title,
        starts_at: meeting.starts_at,
        duration_minutes: meeting.duration_minutes,
      })
    }
  }
  return [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))
}
