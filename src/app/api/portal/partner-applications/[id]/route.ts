import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  getLuxorPartnerApplication,
  listLuxorPartnerApplicationFiles,
  partnerApplicationsSchemaUnavailable,
  updateLuxorPartnerApplication,
} from '@/lib/luxorPartnerApplicationsServer'
import {
  LUXOR_PARTNER_APPLICATION_STATUSES,
  LUXOR_PARTNER_PAYMENT_STATUSES,
  type LuxorPartnerApplicationStatus,
  type LuxorPartnerPaymentStatus,
} from '@/lib/luxorPartnerApplicationTypes'
import { createLuxorPartnerApplicationSignedPhotoUrl } from '@/lib/luxorPartnerApplicationPhotosServer'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getOperationsSession()) {
    return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  }

  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid application.' }, { status: 400 })

  try {
    const application = await getLuxorPartnerApplication(id)
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    const files = await listLuxorPartnerApplicationFiles(id)
    const photos = []
    for (const file of files) {
      try {
        const url = await createLuxorPartnerApplicationSignedPhotoUrl(file.storage_path, file.file_name)
        photos.push({ ...file, signedUrl: url })
      } catch {
        photos.push({ ...file, signedUrl: null })
      }
    }
    return NextResponse.json({ application, photos }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (partnerApplicationsSchemaUnavailable(error)) {
      return NextResponse.json({ error: 'Applications are not available yet.', unavailable: true }, { status: 503 })
    }
    return NextResponse.json({ error: 'Application is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getOperationsSession()) {
    return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  }

  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid application.' }, { status: 400 })

  const body = await request.json().catch(() => null) as {
    status?: unknown
    payment_status?: unknown
    internal_notes?: unknown
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid update.' }, { status: 400 })

  const updates: {
    status?: LuxorPartnerApplicationStatus
    payment_status?: LuxorPartnerPaymentStatus | null
    internal_notes?: string | null
  } = {}

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !LUXOR_PARTNER_APPLICATION_STATUSES.includes(body.status as LuxorPartnerApplicationStatus)) {
      return NextResponse.json({ error: 'Choose a valid status.' }, { status: 400 })
    }
    updates.status = body.status as LuxorPartnerApplicationStatus
  }

  if (body.payment_status !== undefined) {
    if (body.payment_status === null || body.payment_status === '') {
      updates.payment_status = null
    } else if (typeof body.payment_status === 'string' && LUXOR_PARTNER_PAYMENT_STATUSES.includes(body.payment_status as LuxorPartnerPaymentStatus)) {
      updates.payment_status = body.payment_status as LuxorPartnerPaymentStatus
    } else {
      return NextResponse.json({ error: 'Choose a valid payment status.' }, { status: 400 })
    }
  }

  if (body.internal_notes !== undefined) {
    if (body.internal_notes === null) {
      updates.internal_notes = null
    } else if (typeof body.internal_notes === 'string') {
      updates.internal_notes = body.internal_notes.trim().slice(0, 8000) || null
    } else {
      return NextResponse.json({ error: 'Internal notes must be text.' }, { status: 400 })
    }
  }

  try {
    const application = await updateLuxorPartnerApplication(id, updates)
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    return NextResponse.json({ application })
  } catch (error) {
    if (partnerApplicationsSchemaUnavailable(error)) {
      return NextResponse.json({ error: 'Applications are not available yet.', unavailable: true }, { status: 503 })
    }
    return NextResponse.json({ error: 'Unable to update the application.' }, { status: 503 })
  }
}