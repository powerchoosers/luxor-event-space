import type { LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'

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
