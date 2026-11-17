import type { LuxorInquiry, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'
import { isLuxorDateInUpcomingSchedule, luxorTodayKey } from '@/lib/luxorTourMetrics'

export function canReopenLuxorTourCompletion(lead: Pick<LuxorInquiry, 'tour_attendance_status' | 'preferred_tour_date' | 'status'>, todayKey = luxorTodayKey()) {
  if (lead.tour_attendance_status !== 'attended') return false
  if (lead.status === 'closed_lost') return false
  if (!lead.preferred_tour_date) return false
  return isLuxorDateInUpcomingSchedule(lead.preferred_tour_date, todayKey)
}

export function createLuxorTourReopenPayload(input: {
  inquiryId: string
  expectedAttendance: LuxorTourAttendanceStatus | null
  visitId?: string | null
  visitVersion?: number
  leadEventId?: string
}) {
  return {
    inquiryId: input.inquiryId,
    ...(input.leadEventId ? { leadEventId: input.leadEventId } : {}),
    action: 'reopen-tour' as const,
    expectedAttendance: input.expectedAttendance,
    visitId: input.visitId ?? null,
    expectedVisitVersion: input.visitVersion ?? 0,
  }
}

export function createLuxorTourAttendancePayload(input: {
  inquiryId: string
  attendance: LuxorTourAttendanceStatus
  expectedAttendance: LuxorTourAttendanceStatus | null
  leadEventId?: string
  visitId?: string | null
  visitVersion?: number
  calendarSequence?: number
}) {
  return {
    inquiryId: input.inquiryId,
    ...(input.leadEventId ? { leadEventId: input.leadEventId } : {}),
    action: 'attendance' as const,
    attendance: input.attendance,
    expectedAttendance: input.expectedAttendance,
    visitId: input.visitId ?? null,
    expectedVisitVersion: input.visitVersion ?? 0,
    expectedCalendarSequence: input.calendarSequence ?? null,
  }
}

export function resolveLuxorTourOutcomePrecondition(
  currentAttendance: LuxorTourAttendanceStatus | null,
  requestedAttendance: LuxorTourAttendanceStatus,
  expectedAttendance: LuxorTourAttendanceStatus | null | undefined,
): 'apply' | 'already_applied' | 'stale' {
  if (currentAttendance === requestedAttendance) return 'already_applied'
  return currentAttendance === expectedAttendance ? 'apply' : 'stale'
}
