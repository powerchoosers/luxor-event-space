import type { LuxorInquiry } from './luxorInquiryTypes'

export const LUXOR_TOUR_TIMEZONE = 'America/Chicago'

export type LuxorTourSection = 'today' | 'upcoming' | 'completed' | 'no_shows' | 'needs_outcome' | 'cancelled'

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
  if (!dateKey) return 'needs_outcome'
  if (dateKey < todayKey) return 'needs_outcome'
  if (dateKey === todayKey) return 'today'
  return 'upcoming'
}

function normalizedTourTime(value: string | null | undefined) {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null
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

export function getLuxorTourAnalytics(inquiries: LuxorInquiry[], start: Date, end: Date) {
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
