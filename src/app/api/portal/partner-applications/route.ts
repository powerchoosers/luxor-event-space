import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  listLuxorPartnerApplications,
  partnerApplicationsSchemaUnavailable,
} from '@/lib/luxorPartnerApplicationsServer'
import {
  LUXOR_PARTNER_APPLICATION_STATUSES,
  LUXOR_PARTNER_APPLICATION_TYPE_LABELS,
  type LuxorPartnerApplicationType,
} from '@/lib/luxorPartnerApplicationTypes'

export async function GET(request: NextRequest) {
  if (!await getOperationsSession()) {
    return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get('type')?.trim() || 'all'
  const search = searchParams.get('search')?.trim() || ''

  try {
    const type = typeParam === 'all' ? 'all' : (typeParam as LuxorPartnerApplicationType)
  const rows = await listLuxorPartnerApplications({ type, search, limit: 1000 })

    const counts = {
      total: rows.length,
      awaitingReview: rows.filter((row) => row.status === 'new' || row.status === 'under_review').length,
      approved: rows.filter((row) => row.status === 'approved').length,
      declined: rows.filter((row) => row.status === 'declined').length,
    }

    return NextResponse.json({
      applications: rows.map((row) => ({
        ...row,
        typeLabel: LUXOR_PARTNER_APPLICATION_TYPE_LABELS[row.application_type],
      })),
      counts,
      statuses: LUXOR_PARTNER_APPLICATION_STATUSES,
      unavailable: false,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (partnerApplicationsSchemaUnavailable(error)) {
      return NextResponse.json({
        applications: [],
        counts: { total: 0, awaitingReview: 0, approved: 0, declined: 0 },
        statuses: LUXOR_PARTNER_APPLICATION_STATUSES,
        unavailable: true,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Applications are unavailable.' }, { status: 503 })
  }
}