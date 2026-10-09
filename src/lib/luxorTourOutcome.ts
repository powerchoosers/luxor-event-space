import type { LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'

export function createLuxorTourAttendancePayload(input: {
  inquiryId: string
  attendance: LuxorTourAttendanceStatus
  expectedAttendance: LuxorTourAttendanceStatus | null
  leadEventId?: string
}) {
  return {
    inquiryId: input.inquiryId,
    ...(input.leadEventId ? { leadEventId: input.leadEventId } : {}),
    action: 'attendance' as const,
    attendance: input.attendance,
    expectedAttendance: input.expectedAttendance,
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
