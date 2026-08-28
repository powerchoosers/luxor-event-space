import 'server-only'

import type { LuxorInquiry } from './luxorInquiryTypes'
import { cancelQueuedTourEmailJobs } from './luxorEmailJobsServer'
import { cancelQueuedTourTextJobs } from './luxorTextCampaignsServer'
import { getLuxorTourSlot, releaseLuxorTourSlot } from './luxorTourSlotsServer'
import { cancelLuxorZohoCalendarEvent } from './zohoMailServer'
import { cancelLuxorCalendarEvent, getLuxorCalendarEvent } from './luxorCalendarServer'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CalendarCancellationStatus = 'not_linked' | 'cancelled' | 'cancellation_queued' | 'already_removed' | 'needs_reconnect' | 'failed'

export type LuxorTourCancellation = {
  ok: boolean
  cancelledAt: string
  calendar: {
    status: CalendarCancellationStatus
    warning?: string
  }
  slotReleased: boolean
  metadataPatch: Record<string, unknown>
  errors: string[]
}

type CancelLuxorTourInput = {
  inquiry: LuxorInquiry
  reason?: string | null
  requestedBy: string
}

function compactReason(value: string | null | undefined) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500) || null
}

function stringMetadataValue(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The cancellation task did not complete.'
}

function needsZohoReconnect(message: string) {
  return /INVALID_OAUTHSCOPE|oauthscope|calendar.*scope/i.test(message)
}

function hasReleasedSlotBefore(metadata: Record<string, unknown> | null | undefined) {
  const cancellation = metadata?.tourCancellation
  return Boolean(
    cancellation
      && typeof cancellation === 'object'
      && !Array.isArray(cancellation)
      && (cancellation as Record<string, unknown>).slotReleased === true,
  )
}

function todayInLuxor() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function canReleaseTourSlot(inquiry: LuxorInquiry) {
  if (hasReleasedSlotBefore(inquiry.metadata)) return false
  if (['attended', 'no_show', 'cancelled'].includes(inquiry.tour_attendance_status || '')) return false
  const date = inquiry.preferred_tour_date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  // Dates are stored as Luxor's calendar date. A same-day cancellation can
  // still safely free an unused appointment; past dates are historical only.
  return date >= todayInLuxor()
}

/**
 * Stops the scheduled parts of a tour without deleting its history. This is
 * intentionally separate from a lead's deal status so it can be used for a
 * simple reschedule, a client cancellation, or a larger deal-lost close-out.
 *
 * The caller persists the returned `metadataPatch` together with the status
 * change it owns. Queued delivery jobs and public tour capacity are safe to
 * repeat, which makes a retry harmless if a later database write fails.
 */
export async function cancelLuxorTourForInquiry({ inquiry, reason, requestedBy }: CancelLuxorTourInput): Promise<LuxorTourCancellation> {
  const cancelledAt = new Date().toISOString()
  const cancellationReason = compactReason(reason)
  const selectedTourSlotId = stringMetadataValue(inquiry.metadata, 'selectedTourSlotId')
  const calendarEventUid = stringMetadataValue(inquiry.metadata, 'zohoCalendarEventUid')
  const shouldReleaseSlot = UUID_PATTERN.test(selectedTourSlotId) && canReleaseTourSlot(inquiry)

  const queuedCancellationResults = await Promise.allSettled([
    cancelQueuedTourEmailJobs(inquiry.id),
    cancelQueuedTourTextJobs(inquiry.id),
    shouldReleaseSlot
      ? getLuxorTourSlot(selectedTourSlotId).then((slot) => {
          // A lead may have been rescheduled since the public slot was held.
          // In that case leave the original slot untouched rather than freeing
          // a time that may no longer represent this tour.
          if (!slot || slot.slot_date !== inquiry.preferred_tour_date) return null
          return releaseLuxorTourSlot(selectedTourSlotId)
        })
      : Promise.resolve(null),
  ])

  const errors = queuedCancellationResults
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => errorMessage(result.reason))

  const slotResult = queuedCancellationResults[2]
  const slotReleased = slotResult.status === 'fulfilled' && Boolean(slotResult.value)

  let calendar: LuxorTourCancellation['calendar'] = { status: 'not_linked' }
  const localCalendar = await getLuxorCalendarEvent(inquiry.id)
  let calendarMetadata: Record<string, unknown> = {}
  if (localCalendar) {
    try {
      const cancelled = await cancelLuxorCalendarEvent(inquiry.id, requestedBy)
      if (!cancelled) throw new Error('Saved calendar event not found.')
      calendar = { status: 'cancellation_queued' }
      calendarMetadata = { calendarProvider: 'resend', calendarEventId: cancelled.id, calendarEventUid: cancelled.uid, calendarSequence: cancelled.sequence }
    } catch (error) {
      const warning = errorMessage(error)
      errors.push(warning)
      calendar = { status: 'failed', warning }
    }
  } else if (calendarEventUid) {
    try {
      const result = await cancelLuxorZohoCalendarEvent(calendarEventUid)
      calendar = { status: result.status }
    } catch (error) {
      const warning = errorMessage(error)
      calendar = needsZohoReconnect(warning)
        ? { status: 'needs_reconnect', warning }
        : { status: 'failed', warning }
    }
  }

  const priorCancellation = inquiry.metadata?.tourCancellation
  const metadataPatch = {
    ...calendarMetadata,
    tourCancellation: {
      ...(priorCancellation && typeof priorCancellation === 'object' && !Array.isArray(priorCancellation)
        ? priorCancellation
        : {}),
      status: 'cancelled',
      cancelledAt,
      cancelledBy: requestedBy.trim() || 'Portal Owner',
      ...(cancellationReason ? { reason: cancellationReason } : {}),
      queuedEmailJobsCancelled: queuedCancellationResults[0].status === 'fulfilled',
      queuedTextJobsCancelled: queuedCancellationResults[1].status === 'fulfilled',
      slotReleased,
      calendarStatus: calendar.status,
      ...(calendar.warning ? { calendarWarning: calendar.warning } : {}),
    },
  }

  return {
    ok: errors.length === 0,
    cancelledAt,
    calendar,
    slotReleased,
    metadataPatch,
    errors,
  }
}
