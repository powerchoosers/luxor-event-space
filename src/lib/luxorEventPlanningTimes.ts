type StringRecord = Record<string, unknown> | null | undefined

function cleanTime(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasOwn(record: StringRecord, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key))
}

export function resolveLuxorEventPlanningTimes(
  metadata: StringRecord,
  proposalContext?: StringRecord | null,
  bookingContext?: StringRecord | null,
) {
  const venueAccessTime = hasOwn(metadata, 'venue_access_time')
    ? cleanTime(metadata?.venue_access_time)
    : cleanTime(bookingContext?.start_time)
      || cleanTime(bookingContext?.rental_start_time)
      || cleanTime(proposalContext?.rental_start_time)
      || cleanTime(proposalContext?.start_time)
  const eventTime = hasOwn(metadata, 'event_time')
    ? cleanTime(metadata?.event_time)
    : cleanTime(bookingContext?.guest_arrival_time)
      || cleanTime(bookingContext?.guestArrivalTime)
      || cleanTime(proposalContext?.guest_arrival_time)
      || cleanTime(proposalContext?.guestArrivalTime)

  return { venueAccessTime, eventTime }
}

export function createLuxorEventPlanningTimeBaseline(eventId: string | null | undefined, metadata: StringRecord) {
  return eventId ? { eventId, ...resolveLuxorEventPlanningTimes(metadata) } : null
}

export function hasActiveLuxorEventBooking(eventId: string, bookings: Array<{ lead_event_id?: string | null; status: string }>) {
  return bookings.some((booking) => booking.lead_event_id === eventId && booking.status !== 'cancelled')
}

export type LuxorEventDetailsFieldUpdate = { field: string; value: string }

export async function persistLuxorEventDetailsDraft({
  draftEventId,
  selectedEventId,
  editSessionId,
  getSelectedEventId,
  getEditSessionId,
  fieldUpdates,
  timingUpdates,
  persistField,
  persistTimes,
}: {
  draftEventId: string | null
  selectedEventId: string | null
  editSessionId: number
  getSelectedEventId: () => string | null
  getEditSessionId: () => number
  fieldUpdates: LuxorEventDetailsFieldUpdate[]
  timingUpdates: { venueAccessTime?: string; eventTime?: string }
  persistField: (field: string, value: string) => Promise<boolean>
  persistTimes: (updates: { venueAccessTime?: string; eventTime?: string }, eventId: string) => Promise<boolean>
}) {
  const isCurrent = () => Boolean(
    draftEventId
    && draftEventId === selectedEventId
    && draftEventId === getSelectedEventId()
    && editSessionId === getEditSessionId(),
  )

  if (!isCurrent()) return 'stale' as const

  for (const update of fieldUpdates) {
    if (!isCurrent()) return 'stale' as const
    if (!await persistField(update.field, update.value)) return 'failed' as const
    if (!isCurrent()) return 'stale' as const
  }

  if (Object.keys(timingUpdates).length) {
    if (!draftEventId || !isCurrent()) return 'stale' as const
    if (!await persistTimes(timingUpdates, draftEventId)) return 'failed' as const
    if (!isCurrent()) return 'stale' as const
  }

  return 'saved' as const
}

export function hasLuxorEventPlanningTimeConflict({
  current,
  baseline,
  proposed,
}: {
  current: { venueAccessTime: string; eventTime: string }
  baseline: { venueAccessTime: string; eventTime: string }
  proposed: { venueAccessTime: string; eventTime: string }
}) {
  return (current.venueAccessTime !== baseline.venueAccessTime && current.venueAccessTime !== proposed.venueAccessTime)
    || (current.eventTime !== baseline.eventTime && current.eventTime !== proposed.eventTime)
}

export function buildLuxorEventPlanningTimePatch(proposed: Partial<{ venueAccessTime: string; eventTime: string }>) {
  const patch: StringRecord = {}
  if (hasOwn(proposed, 'venueAccessTime')) patch.venue_access_time = cleanTime(proposed.venueAccessTime) || null
  if (hasOwn(proposed, 'eventTime')) patch.event_time = cleanTime(proposed.eventTime) || null
  return patch
}
