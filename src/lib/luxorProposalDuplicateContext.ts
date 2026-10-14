const RENTAL_TIME_FIELDS = ['rental_start_time', 'rental_end_time', 'start_time', 'end_time'] as const

function copyStringFields(context: Record<string, unknown>, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = context[field]
    return typeof value === 'string' && value.trim() ? [[field, value]] : []
  }))
}

/** Preserve the proposal's saved venue access window when making a copy. */
export function getDuplicatedProposalRentalTimeFields(context: Record<string, unknown>): Record<string, string> {
  return copyStringFields(context, RENTAL_TIME_FIELDS)
}

/** Keep the separately saved guest-hours window in the copied builder context. */
export function getDuplicatedProposalTimingContext(context: Record<string, unknown>): Record<string, string> {
  return {
    ...getDuplicatedProposalRentalTimeFields(context),
    ...copyStringFields(context, ['guest_arrival_time', 'event_end_time']),
    ...(!context.guest_arrival_time && typeof context.guestArrivalTime === 'string' && context.guestArrivalTime.trim()
      ? { guest_arrival_time: context.guestArrivalTime }
      : {}),
    ...(!context.event_end_time && typeof context.eventEndTime === 'string' && context.eventEndTime.trim()
      ? { event_end_time: context.eventEndTime }
      : {}),
  }
}

/** Clone pricing inputs for a new draft, removing only proposal-bound promotion IDs. */
export function getDuplicatedProposalSelection(savedSelection: Record<string, unknown>): Record<string, unknown> {
  const selection = { ...savedSelection }
  delete selection.promotionId
  delete selection.promotion_id
  return selection
}
