import type { LuxorInquiry } from './luxorInquiryTypes'

export const LUXOR_TOUR_TIMEZONE = 'America/Chicago'

export type LuxorTourSection = 'today' | 'upcoming' | 'completed' | 'no_shows' | 'needs_outcome' | 'needs_schedule' | 'cancelled'
export type LuxorTourDateRangePreset = '7d' | '30d' | '90d' | 'this_month' | 'previous_month' | 'custom'

export type LuxorTourDateRange = {
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
}

export function getLuxorInquiryPageRequest(offset: number, count: number) {
  return {
    path: 'luxor_inquiries?select=*&order=created_at.desc,id.desc',
    headers: { Range: `${offset}-${offset + count - 1}` },
  }
}

export async function loadLuxorPages<T>(fetchPage: (offset: number, count: number) => Promise<T[]>, pageSize = 1000, limit = Number.POSITIVE_INFINITY) {
  const items: T[] = []
  while (items.length < limit) {
    const count = Math.min(pageSize, limit - items.length)
    const page = await fetchPage(items.length, count)
    items.push(...page)
    if (page.length === 0) return items
  }
  return items
}

const FINAL_OUTCOMES = new Set(['attended', 'no_show', 'cancelled'])

export function luxorDateKey(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LUXOR_TOUR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function luxorTodayKey(now = new Date()) {
  return luxorDateKey(now)
}

export function formatLuxorTourDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T12:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: dateOnly ? 'UTC' : LUXOR_TOUR_TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function addLuxorDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function isCalendarDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function getLuxorTourDateRange(
  preset: LuxorTourDateRangePreset,
  customStart?: string,
  customEnd?: string,
  now = new Date(),
): LuxorTourDateRange {
  const today = luxorDateKey(now)
  let startDate: string
  let endDate: string
  let previousStartDate: string
  let previousEndDate: string

  if (preset === 'this_month') {
    startDate = `${today.slice(0, 7)}-01`
    endDate = today
    previousEndDate = addLuxorDateKeyDays(startDate, -1)
    previousStartDate = `${previousEndDate.slice(0, 7)}-01`
  } else if (preset === 'previous_month') {
    endDate = `${today.slice(0, 7)}-01`
    endDate = addLuxorDateKeyDays(endDate, -1)
    startDate = `${endDate.slice(0, 7)}-01`
    previousEndDate = addLuxorDateKeyDays(startDate, -1)
    previousStartDate = `${previousEndDate.slice(0, 7)}-01`
  } else if (preset === 'custom' && isCalendarDateKey(customStart) && isCalendarDateKey(customEnd) && customStart <= customEnd) {
    startDate = customStart
    endDate = customEnd
    const days = Math.round((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000)
    previousEndDate = addLuxorDateKeyDays(startDate, -1)
    previousStartDate = addLuxorDateKeyDays(previousEndDate, -days)
  } else {
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30
    endDate = today
    startDate = addLuxorDateKeyDays(today, -days)
    previousEndDate = addLuxorDateKeyDays(startDate, -1)
    previousStartDate = addLuxorDateKeyDays(previousEndDate, -days)
  }

  // Calendar arithmetic does not depend on server timezone or DST day length.
  return { startDate, endDate, previousStartDate, previousEndDate }
}

export function getCompletedTourLeads<T extends LuxorInquiry>(inquiries: T[]) {
  const unique = new Map<string, T>()
  inquiries.filter((inquiry) => inquiry.tour_attendance_status === 'attended').forEach((inquiry) => unique.set(inquiry.id, inquiry))
  return [...unique.values()].sort((a, b) => (b.preferred_tour_date || '').localeCompare(a.preferred_tour_date || ''))
}

export function getLuxorPostTourFollowUpStatus(tasks: Array<{ status: string; description?: string | null }>) {
  const postTourTasks = tasks.filter((task) => /\[post-tour\]/i.test(task.description ?? ''))
  if (postTourTasks.some((task) => task.status === 'pending')) return 'Follow-Up Scheduled'
  if (postTourTasks.some((task) => task.status === 'completed')) return 'Follow-Up Completed'
  return 'Needs Follow-Up'
}

export function getLuxorTourSection(tour: LuxorInquiry, todayKey: string): LuxorTourSection | null {
  const status = tour.tour_attendance_status || ''
  const hasTourEvidence = Boolean(tour.preferred_tour_date)
    || ['tour_requested', 'tour_confirmed'].includes(tour.status)
    || FINAL_OUTCOMES.has(status)
    || status === 'rescheduled'
  if (!hasTourEvidence) return null
  if (status === 'attended') return 'completed'
  if (status === 'no_show') return 'no_shows'
  if (status === 'cancelled') return 'cancelled'

  const dateKey = tour.preferred_tour_date ? luxorDateKey(tour.preferred_tour_date) : ''
  if (!dateKey) return 'needs_schedule'
  if (dateKey < todayKey) return 'needs_outcome'
  if (dateKey === todayKey) return 'today'
  return 'upcoming'
}

function normalizedTourTime(value: string | null | undefined) {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59) return null
  if (match[3]) {
    if (hours < 1 || hours > 12) return null
    hours %= 12
    if (match[3].toUpperCase() === 'PM') hours += 12
  } else if (hours > 23) return null
  return hours * 60 + minutes
}

export function compareLuxorScheduledTours(a: LuxorInquiry, b: LuxorInquiry, direction: 'asc' | 'desc') {
  const aDate = a.preferred_tour_date ? luxorDateKey(a.preferred_tour_date) : ''
  const bDate = b.preferred_tour_date ? luxorDateKey(b.preferred_tour_date) : ''
  const dateCompare = aDate.localeCompare(bDate)
  if (dateCompare) return direction === 'asc' ? dateCompare : -dateCompare
  const aTime = normalizedTourTime(a.preferred_tour_time)
  const bTime = normalizedTourTime(b.preferred_tour_time)
  if (aTime === null && bTime !== null) return 1
  if (aTime !== null && bTime === null) return -1
  const timeCompare = (aTime ?? 0) - (bTime ?? 0)
  if (timeCompare) return direction === 'asc' ? timeCompare : -timeCompare
  return a.id.localeCompare(b.id)
}

export function getLuxorTourAnalytics(inquiries: LuxorInquiry[], start: Date | string, end: Date | string) {
  const startKey = luxorDateKey(start)
  const endKey = luxorDateKey(end)
  const cohort = new Map<string, LuxorInquiry>()
  inquiries.forEach((inquiry) => {
    if (!inquiry.preferred_tour_date || inquiry.tour_attendance_status === 'cancelled') return
    const scheduledDate = luxorDateKey(inquiry.preferred_tour_date)
    if (!scheduledDate || scheduledDate < startKey || scheduledDate > endKey) return
    cohort.set(inquiry.id, inquiry)
  })
  const tours = [...cohort.values()]
  const totalScheduled = tours.length
  const completed = tours.filter((tour) => tour.tour_attendance_status === 'attended').length
  const noShows = tours.filter((tour) => tour.tour_attendance_status === 'no_show').length
  return {
    totalScheduled,
    completed,
    noShows,
    completionRate: totalScheduled ? Math.round((completed / totalScheduled) * 1000) / 10 : 0,
    noShowRate: totalScheduled ? Math.round((noShows / totalScheduled) * 1000) / 10 : 0,
  }
}
