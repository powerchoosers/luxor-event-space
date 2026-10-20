import { NextResponse } from 'next/server'
import { listLuxorBookingsWithPayments } from '@/lib/luxorBookingsServer'
import { listLuxorConfirmedTours } from '@/lib/luxorInquiriesServer'
import { listAllTasks } from '@/lib/luxorTasksServer'
import { listUpcomingLuxorTourSlots } from '@/lib/luxorTourSlotsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listInvoices, listLuxorProposalActivitiesForFamilies } from '@/lib/luxorInvoicesServer'
import { buildLuxorAvailabilityCalendar, isLuxorTestAvailabilityBooking } from '@/lib/luxorAvailability'
import { countLuxorPendingProposalsByDate, listLuxorPendingProposals, type LuxorProposalActivitySummary } from '@/lib/luxorPendingProposals'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const [tours, slots, bookings, tasks, invoiceResult] = await Promise.all([
      listLuxorConfirmedTours(),
      listUpcomingLuxorTourSlots(1000),
      listLuxorBookingsWithPayments(1000),
      listAllTasks().catch(() => []),
      listInvoices(1000).then((invoices) => ({ invoices, error: null as string | null })).catch((error: unknown) => ({
        invoices: [],
        error: 'Pending proposal records could not be verified.',
      })),
    ])

    const familyIds = [...new Set(invoiceResult.invoices.map((invoice) => invoice.proposal_family_id).filter((value): value is string => Boolean(value)))]
    const activityResult = await listLuxorProposalActivitiesForFamilies(familyIds)
      .then((activities) => ({ activities, error: null as string | null }))
      .catch(() => ({ activities: [] as LuxorProposalActivitySummary[], error: 'Pending proposal activity history could not be verified.' }))
    const pendingProposalsError = invoiceResult.error || activityResult.error
    const ownerBookings = bookings.filter((booking) => !isLuxorTestAvailabilityBooking(booking))
    const pendingProposals = pendingProposalsError
      ? []
      : listLuxorPendingProposals(invoiceResult.invoices, ownerBookings, Date.now(), activityResult.activities)

    return NextResponse.json({
      tours,
      slots,
      bookings: ownerBookings,
      tasks,
      availability: buildLuxorAvailabilityCalendar(ownerBookings),
      pendingProposals,
      pendingProposalCounts: pendingProposalsError ? {} : countLuxorPendingProposalsByDate(pendingProposals),
      pendingProposalsError,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
