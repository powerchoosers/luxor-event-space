export const CALENDAR_MESSAGE_KEYS = ['cancellation', 'update'] as const
export type CalendarMessageKey = typeof CALENDAR_MESSAGE_KEYS[number]

export type CalendarCancellationCopy = { subjectPrefix: string; footer: string }
export type CalendarUpdateCopy = { footer: string }

export const CALENDAR_CANCELLATION_DEFAULT: CalendarCancellationCopy = {
  subjectPrefix: 'Cancelled: ',
  footer: 'This appointment has been cancelled. Your calendar may update automatically or ask you to remove it. Questions? Reply to booking@luxoratlaspalmas.com.',
}

export const CALENDAR_UPDATE_DEFAULT: CalendarUpdateCopy = {
  footer: 'Use the calendar controls in this message to accept, decline, or add the appointment. Questions? Reply to booking@luxoratlaspalmas.com.',
}

function cleanLine(value: unknown, max: number, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Enter ${field} within its length limit.`)
  const clean = value.trim()
  if (/[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
  return clean
}

function cleanBlock(value: unknown, max: number, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Enter ${field} within its length limit.`)
  return value.trim()
}

export function validateCalendarCancellationCopy(value: unknown): CalendarCancellationCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  return {
    subjectPrefix: cleanLine(input.subjectPrefix, 40, 'subjectPrefix'),
    footer: cleanBlock(input.footer, 800, 'footer'),
  }
}

export function validateCalendarUpdateCopy(value: unknown): CalendarUpdateCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  return { footer: cleanBlock(input.footer, 800, 'footer') }
}

export type CalendarMessageCopyMap = {
  cancellation: CalendarCancellationCopy | null
  update: CalendarUpdateCopy | null
}

export const CALENDAR_MESSAGE_DEFAULTS: Record<CalendarMessageKey, CalendarCancellationCopy | CalendarUpdateCopy> = {
  cancellation: CALENDAR_CANCELLATION_DEFAULT,
  update: CALENDAR_UPDATE_DEFAULT,
}
