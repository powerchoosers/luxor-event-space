type StringRecord = Record<string, unknown> | null | undefined

function cleanTime(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasOwn(record: StringRecord, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key))
}

export function resolveLuxorEventPlanningTimes(metadata: StringRecord, proposalContext?: StringRecord | null) {
  const venueAccessTime = hasOwn(metadata, 'venue_access_time')
    ? cleanTime(metadata?.venue_access_time)
    : cleanTime(proposalContext?.rental_start_time) || cleanTime(proposalContext?.start_time)
  const eventTime = hasOwn(metadata, 'event_time')
    ? cleanTime(metadata?.event_time)
    : cleanTime(proposalContext?.guest_arrival_time) || cleanTime(proposalContext?.guestArrivalTime)

  return { venueAccessTime, eventTime }
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

export function buildLuxorEventPlanningTimePatch(proposed: { venueAccessTime: string; eventTime: string }) {
  return {
    venue_access_time: cleanTime(proposed.venueAccessTime) || null,
    event_time: cleanTime(proposed.eventTime) || null,
  }
}
