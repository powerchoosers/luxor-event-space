import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { buildLuxorTourPlan } from '@/lib/luxorTourPlanningServer'
import { assertEmailHasNoUnresolvedPlaceholders, createPublicToken, getTourResponseLinks } from '@/lib/luxorEmailJobsServer'
import { getLuxorTourSlot, assertTourSlotCanBeBooked, reserveLuxorTourSlot } from '@/lib/luxorTourSlotsServer'
import { formatTourSlotTime } from '@/lib/luxorTourSlots'
import { getLuxorInquiry, normalizeInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { saveLuxorTourSchedule } from '@/lib/luxorTourScheduleServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { listQueuedLuxorEmailJobsByIds, processLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorInquiry, LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

function compactEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function readPackagesInquiryContinuationId(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.continuePackagesInquiryId
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

export async function attachTourToPackagesInquiry(
  packagesInquiryId: string,
  input: LuxorInquiryInput,
  options: { idempotencyKey?: string; userAgent?: string; replayed?: boolean },
) {
  const existing = await getLuxorInquiry(packagesInquiryId)
  if (!existing || existing.flow !== 'packages_event_inquiry' || existing.source !== 'website_packages') {
    throw new Error('We could not find your package inquiry. Return to Packages and submit again.')
  }

  const submittedEmail = compactEmail(input.email)
  const existingEmail = compactEmail(existing.email)
  if (!submittedEmail || !existingEmail || submittedEmail !== existingEmail) {
    throw new Error('Use the same email address from your package inquiry.')
  }

  if (existing.preferred_tour_date && existing.tour_attendance_status !== 'cancelled') {
    if (options) options.replayed = true
    return existing
  }

  const selectedTourSlotId = typeof input.metadata?.selectedTourSlotId === 'string' ? input.metadata.selectedTourSlotId : null
  const normalized = normalizeInquiry({ ...input, source: existing.source, flow: existing.flow }, options.userAgent)

  if (selectedTourSlotId) {
    const idempotencyKey = options.idempotencyKey || randomUUID()
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const previous = await supabaseRest<LuxorInquiry | null>('rpc/luxor_find_public_tour_request', {
      method: 'POST',
      body: JSON.stringify({ p_request_id: idempotencyKey, p_fingerprint: fingerprint }),
    })
    if (previous) {
      if (options) options.replayed = true
      return previous
    }

    const slot = await getLuxorTourSlot(selectedTourSlotId)
    assertTourSlotCanBeBooked(slot)
    await reserveLuxorTourSlot(slot!)

    const token = existing.tour_response_token || createPublicToken()
    if (!existing.tour_response_token) {
      await updateLuxorInquiry(existing.id, { tour_response_token: token })
    }

    const tourDate = slot!.slot_date
    const tourTime = formatTourSlotTime(slot!.start_time)
    await updateLuxorInquiry(existing.id, {
      preferred_tour_date: tourDate,
      preferred_tour_time: tourTime,
      status: 'tour_confirmed',
      pipeline_stage: 'tour',
      tour_attendance_status: 'pending',
      metadata: {
        ...(existing.metadata || {}),
        ...(normalized.metadata || {}),
        selectedTourSlotId,
        autoScheduleTour: true,
        tourBookingType: 'confirmed_slot',
        packagesInquiryTour: true,
        continuePackagesInquiryId: packagesInquiryId,
      },
    })

    const inquiry = await getLuxorInquiry(existing.id)
    if (!inquiry) throw new Error('Your lead could not be loaded for tour scheduling.')

    const links = getTourResponseLinks(token)
    const contactPhone = await getActiveLuxorPhoneNumber().catch(() => null)
    const plan = await buildLuxorTourPlan({
      inquiry,
      date: tourDate,
      time: tourTime,
      responseToken: token,
      responseUrl: links.rescheduleUrl,
      contactPhone,
      meetingType: 'Private Venue Tour',
      durationMinutes: 30,
    })
    for (const template of Object.values(plan.templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)

    const saved = await saveLuxorTourSchedule({
      inquiry,
      expectedSequence: -1,
      state: plan.state,
      tour: plan.tour,
      templates: plan.templates,
      requestedBy: 'Public tour request',
      visitIntent: 'new_visit',
      visitId: randomUUID(),
      requestId: randomUUID(),
      expectedVisitId: null,
      expectedVisitVersion: 0,
    })

    try {
      await supabaseRest('luxor_public_tour_requests', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ request_id: idempotencyKey, fingerprint, inquiry_id: saved.inquiry.id }),
      })
    } catch (error) {
      console.warn('Packages tour idempotency record could not be stored:', error)
    }

    if (!saved.replayed) {
      try {
        const immediateJobs = (await listQueuedLuxorEmailJobsByIds([
          ...saved.confirmationJobs.map((job) => job.id),
          ...saved.reminderJobs.map((job) => job.id),
        ])).filter((job) => job.status === 'queued')
        if (immediateJobs.length) await processLuxorEmailJobs(immediateJobs)
      } catch (error) {
        console.error('Tour saved; calendar delivery will retry through the queue:', error)
      }
    }

    if (options) options.replayed = saved.replayed
    return saved.inquiry
  }

  const customTourTime = typeof input.metadata?.customTourTime === 'string' ? input.metadata.customTourTime : null
  const preferredTourTime = normalized.preferred_tour_time
    || (customTourTime ? formatTourSlotTime(`${customTourTime}:00`) : null)

  await updateLuxorInquiry(existing.id, {
    preferred_tour_date: normalized.preferred_tour_date,
    preferred_tour_time: preferredTourTime,
    status: normalized.preferred_tour_date ? 'tour_requested' : existing.status,
    pipeline_stage: normalized.preferred_tour_date ? 'tour' : existing.pipeline_stage,
    tour_attendance_status: normalized.preferred_tour_date ? 'pending' : existing.tour_attendance_status,
    metadata: {
      ...(existing.metadata || {}),
      ...(normalized.metadata || {}),
      packagesInquiryTour: true,
      continuePackagesInquiryId: packagesInquiryId,
      tourBookingType: input.metadata?.tourBookingType || 'pending_custom_request',
    },
  })

  const updated = await getLuxorInquiry(existing.id)
  if (!updated) throw new Error('Your lead could not be updated.')

  if (updated.email && updated.preferred_tour_date) {
    const token = updated.tour_response_token || createPublicToken()
    if (!updated.tour_response_token) await updateLuxorInquiry(updated.id, { tour_response_token: token })
    try {
      const { buildTourRequestReceivedEmailHtml, listQueuedLuxorEmailJobsByIds, processLuxorEmailJobs, createLuxorEmailJob } = await import('./luxorEmailJobsServer')
      const requestEmailHtml = buildTourRequestReceivedEmailHtml(updated, token, null)
      const job = await createLuxorEmailJob({
        inquiryId: updated.id,
        jobType: 'tour_confirmation',
        recipientEmail: updated.email,
        subject: 'Your Luxor tour request is received',
        body: requestEmailHtml,
        metadata: { source: 'tour_request_received', packagesInquiryTour: true },
      })
      const jobs = await listQueuedLuxorEmailJobsByIds([job.id])
      await processLuxorEmailJobs(jobs)
    } catch (error) {
      console.error('Packages inquiry tour request email could not be sent:', error)
    }
  }

  return updated
}
