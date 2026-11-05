import { NextResponse } from 'next/server'
import { annotateTestBookings, getVerifiedTestInquiryIds, listLuxorBookingsWithPayments } from '@/lib/luxorBookingsServer'
import { listLuxorConfirmedTours, listTaskInquiryContexts } from '@/lib/luxorInquiriesServer'
import { listAllTasks } from '@/lib/luxorTasksServer'
import { listUpcomingLuxorTourSlots } from '@/lib/luxorTourSlotsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listInvoices, listLuxorProposalActivitiesForFamilies } from '@/lib/luxorInvoicesServer'
import { buildLuxorAvailabilityCalendar, isLuxorTestAvailabilityBooking } from '@/lib/luxorAvailability'
import { countLuxorPendingProposalsByDate, listLuxorPendingProposals, type LuxorProposalActivitySummary } from '@/lib/luxorPendingProposals'
import { annotateLuxorReviewAvailability } from '@/lib/luxorAvailabilityReviewServer'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { canIncludePlannerCalendarMeetings, toLuxorPlannerCalendarMeetings, type LuxorPlannerMeetingCalendarSource } from '@/lib/luxorPlannerCalendar'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Please log in again to continue.' }, { status: 401 })
    }

    // Planner meetings are a read-only projection. Keep the calendar API's
    // existing permission boundary: only members with Planner access receive
    // this minimal view, and no calendar rows or reminder jobs are created.
    const plannerMeetingsResultPromise = getLuxorPortalMember(session.email).then(async (member) => {
      if (!canIncludePlannerCalendarMeetings(member?.status, memberCan(member, 'planner'))) {
        return { meetings: [] as LuxorPlannerMeetingCalendarSource[], error: null as string | null }
      }
      try {
        const meetings = await supabaseRestStrict<LuxorPlannerMeetingCalendarSource[]>(
          'luxor_planner_meetings?select=id,booking_id,title,starts_at,duration_minutes,status&status=eq.scheduled&order=starts_at.asc&limit=1000',
        )
        return { meetings, error: null as string | null }
      } catch {
        // Preserve the existing calendar if the optional Planner projection is
        // temporarily unavailable; expose a small status warning to staff.
        return { meetings: [] as LuxorPlannerMeetingCalendarSource[], error: 'Planner meetings could not be loaded.' }
      }
    }).catch(() => ({ meetings: [] as LuxorPlannerMeetingCalendarSource[], error: 'Planner meetings could not be loaded.' }))

    const [tours, slots, bookings, tasks, invoiceResult, plannerMeetingsResult] = await Promise.all([
      listLuxorConfirmedTours(),
      listUpcomingLuxorTourSlots(1000),
      listLuxorBookingsWithPayments(1000, true),
      listAllTasks().catch(() => []),
      listInvoices(1000).then((invoices) => ({ invoices, error: null as string | null })).catch(() => ({
        invoices: [],
        error: 'Pending proposal records could not be verified.',
      })),
      plannerMeetingsResultPromise,
    ])

    let taskInquiryContexts: Awaited<ReturnType<typeof listTaskInquiryContexts>> = []
    let taskInquiryContextsUnavailable = false
    try {
      taskInquiryContexts = await listTaskInquiryContexts(tasks.map((task) => task.inquiry_id).filter((id): id is string => Boolean(id)))
    } catch {
      taskInquiryContextsUnavailable = true
    }
    const taskInquiryContextById = new Map(taskInquiryContexts.map((inquiry) => [inquiry.id, inquiry]))
    const tasksWithInquiryContext = tasks.map((task) => ({
      ...task,
      inquiry_context: task.inquiry_id ? taskInquiryContextById.get(task.inquiry_id) ?? null : null,
      inquiry_context_status: !task.inquiry_id ? 'unlinked' : taskInquiryContextsUnavailable ? 'unavailable' : taskInquiryContextById.has(task.inquiry_id) ? 'linked' : 'unlinked',
    }))

    const familyIds = [...new Set(invoiceResult.invoices.map((invoice) => invoice.proposal_family_id).filter((value): value is string => Boolean(value)))]
    const activityResult = await listLuxorProposalActivitiesForFamilies(familyIds)
      .then((activities) => ({ activities, error: null as string | null }))
      .catch(() => ({ activities: [] as LuxorProposalActivitySummary[], error: 'Pending proposal activity history could not be verified.' }))
    const pendingProposalsError = invoiceResult.error || activityResult.error
    const inquiryIds = bookings.map((booking) => booking.inquiry_id).filter((id): id is string => Boolean(id))
    const testTourIds = await getVerifiedTestInquiryIds([...inquiryIds, ...tours.map((tour) => tour.id)])
    const annotatedBookings = await annotateTestBookings(bookings, testTourIds)
    const ownerBookings = annotatedBookings.filter((booking) => !isLuxorTestAvailabilityBooking(booking))
    const plannerCalendarMeetings = toLuxorPlannerCalendarMeetings(
      plannerMeetingsResult.meetings,
      new Set(ownerBookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed').map((booking) => booking.id)),
    )
    const pendingProposals = pendingProposalsError
      ? []
      : listLuxorPendingProposals(invoiceResult.invoices, ownerBookings, Date.now(), activityResult.activities)

    return NextResponse.json({
      tours: tours.filter((tour) => !testTourIds.has(tour.id)),
      plannerMeetings: plannerCalendarMeetings,
      plannerMeetingsError: plannerMeetingsResult.error,
      slots,
      bookings: ownerBookings,
      tasks: tasksWithInquiryContext,
      availability: buildLuxorAvailabilityCalendar(await annotateLuxorReviewAvailability(ownerBookings)),
      pendingProposals,
      pendingProposalCounts: pendingProposalsError ? {} : countLuxorPendingProposalsByDate(pendingProposals),
      pendingProposalsError,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
