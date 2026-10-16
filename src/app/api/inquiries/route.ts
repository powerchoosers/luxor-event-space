import { after, NextRequest, NextResponse } from 'next/server'
import { createLuxorInquiry, findRecentDuplicateLuxorInquiry, listAllLuxorInquiries, listLuxorInquiries, getLuxorInquiry, stageForStatus, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { isGuestCountOverCapacity, LUXOR_GUEST_CAPACITY_MESSAGE, LuxorEmailJob, LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { addMarketingMember } from '@/lib/luxorMarketingServer'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'
import { countRecentInquiryAttempts, getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'
import { assertEmailHasNoUnresolvedPlaceholders, createPublicToken, getTourResponseLinks, listLuxorEmailJobsForInquiry, processLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { saveLuxorTourSchedule } from '@/lib/luxorTourScheduleServer'
import { buildLuxorTourPlan, zonedTourDateTimeToUtc } from '@/lib/luxorTourPlanningServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { releaseLuxorTourSlot } from '@/lib/luxorTourSlotsServer'
import { cancelQueuedTourTextJobs } from '@/lib/luxorTextCampaignsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { isConfiguredTestSubmission, startLuxorTestRun } from '@/lib/luxorTestLeadServer'

const VALID_INQUIRY_STATUSES: LuxorInquiryStatus[] = [
  'new',
  'contacted',
  'tour_requested',
  'tour_confirmed',
  'proposal_sent',
  'booked',
  'closed_lost',
]

async function scheduleTourFromPublicRequest(inquiry: LuxorInquiry) {
  if (!inquiry.email || !inquiry.preferred_tour_date || !inquiry.preferred_tour_time) {
    throw new Error('An email address, tour date, and specific tour time are required to send an invite.')
  }
  const token = inquiry.tour_response_token || createPublicToken()
  const links = getTourResponseLinks(token)
  const contactPhone = await getActiveLuxorPhoneNumber().catch((error) => {
    console.warn('Tour confirmation could not load the active Luxor phone number:', error)
    return null
  })
  const plan = await buildLuxorTourPlan({ inquiry, date: inquiry.preferred_tour_date,
    time: inquiry.preferred_tour_time, responseToken: token, responseUrl: links.rescheduleUrl,
    contactPhone, meetingType: 'Private Venue Tour', durationMinutes: 30 })
  const { templates } = plan
  for (const template of Object.values(templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)

  const saved = await saveLuxorTourSchedule({
    inquiry,
    expectedSequence: -1,
    state: plan.state,
    tour: plan.tour,
    templates,
    requestedBy: 'Public tour request',
  })

  const immediateJobs = (await listLuxorEmailJobsForInquiry(inquiry.id)).filter((job) =>
    job.status === 'queued' && (job.job_type === 'calendar_invitation' || job.tour_notice === 'confirmation'),
  )
  await processLuxorEmailJobs(immediateJobs).catch((error) => {
    console.error('Tour was scheduled, but immediate calendar delivery will retry through the queue:', error)
  })
  return saved
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const inquiry = await getLuxorInquiry(id)
      if (!inquiry) {
        return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
      }
      return NextResponse.json(inquiry)
    }

    const limitParam = searchParams.get('limit')
    const requestedLimit = limitParam ? parseInt(limitParam, 10) : null
    const inquiries = requestedLimit === null || !Number.isFinite(requestedLimit)
      ? await listAllLuxorInquiries()
      : await listLuxorInquiries(Math.max(0, Math.min(requestedLimit, 10000)))
    return NextResponse.json(inquiries)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch inquiries.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as LuxorInquiryInput
    const ipHash = hashPublicRequestIp(getPublicRequestIp(request.headers))

    if (payload.website) {
      return NextResponse.json({ inquiry: null }, { status: 201 })
    }

    if (isGuestCountOverCapacity(payload.guestCount)) {
      return NextResponse.json({ error: LUXOR_GUEST_CAPACITY_MESSAGE }, { status: 400 })
    }

    if (payload.formStartedAt && Date.now() - payload.formStartedAt < 800) {
      return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 })
    }

    const selectedTourSlotId = typeof payload.metadata?.selectedTourSlotId === 'string'
      ? payload.metadata.selectedTourSlotId
      : null
    const autoScheduleTour = Boolean(selectedTourSlotId)
    if (payload.metadata?.autoScheduleTour === true && !selectedTourSlotId) {
      return NextResponse.json({ error: 'Choose an available time before booking your visit.' }, { status: 400 })
    }
    if (autoScheduleTour) {
      const email = payload.email?.trim()
      const date = payload.preferredTourDate?.trim()
      const time = payload.preferredTourTime?.trim()
      if (!selectedTourSlotId || !email || !date || !time) {
        return NextResponse.json({ error: 'Choose an available time and provide an email address to book your visit.' }, { status: 400 })
      }
      try {
        if (zonedTourDateTimeToUtc(date, time).getTime() <= Date.now()) {
          return NextResponse.json({ error: 'Choose a future tour time.' }, { status: 400 })
        }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Choose a valid tour time.' }, { status: 400 })
      }
    }

    // Exact configured test identifiers are diverted before public analytics,
    // duplicate lookup, slot reservation, CRM creation, marketing, SMS, push,
    // or email work. The RPC independently rechecks enablement and collisions.
    const testClassification = await isConfiguredTestSubmission(payload)
    if (testClassification.matches) {
      const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
      const email = typeof payload.email === 'string' ? payload.email.trim() : ''
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
      if (!fullName || fullName.length > 120 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        || (phone && phone.replace(/\D/g, '').length < 10) || (!email && !phone)) {
        return NextResponse.json({ error: 'Enter a name and a valid complete email or phone number.' }, { status: 400 })
      }
      const idempotencyKey = request.headers.get('idempotency-key')?.trim() || ''
      if (idempotencyKey.length < 8) {
        return NextResponse.json({ error: 'Test submission is missing its idempotency key.' }, { status: 400 })
      }
      const result = await startLuxorTestRun(payload, {
        idempotencyKey,
        userAgent: request.headers.get('user-agent') ?? undefined,
      })
      return NextResponse.json({ ...result, test: true, simulated: true }, { status: 201 })
    }

    try {
      const recentAttempts = await countRecentInquiryAttempts(ipHash)
      if (recentAttempts >= 6) {
        return NextResponse.json({ error: 'Too many requests were submitted. Please wait ten minutes or call Luxor.' }, { status: 429 })
      }

      await recordLuxorPublicEvent({
        eventName: 'inquiry_attempt',
        sessionId: payload.sessionId,
        pagePath: payload.pagePath,
        source: payload.source,
        ipHash,
        metadata: { flow: payload.flow, eventType: payload.eventType },
      })
    } catch (protectionError) {
      console.warn('Public inquiry protection event could not be recorded:', protectionError)
    }

    if (!selectedTourSlotId) {
      const duplicate = await findRecentDuplicateLuxorInquiry(payload)
      if (duplicate) {
        return NextResponse.json({ inquiry: duplicate, duplicate: true }, { status: 200 })
      }
    }

    let inquiry = await createLuxorInquiry(payload, request.headers.get('user-agent') ?? undefined)
    let tourScheduled = false
    if (autoScheduleTour && inquiry) {
      try {
        const savedTour = await scheduleTourFromPublicRequest(inquiry)
        inquiry = savedTour.inquiry
        tourScheduled = true
      } catch (scheduleError) {
        const cleanup = await Promise.allSettled([
          releaseLuxorTourSlot(selectedTourSlotId!),
          cancelQueuedTourTextJobs(inquiry.id),
          updateLuxorInquiry(inquiry.id, {
            status: 'new',
            pipeline_stage: 'inquiry',
            tour_attendance_status: null,
            preferred_tour_date: null,
            preferred_tour_time: null,
            tour_confirmed_at: null,
            metadata: { ...inquiry.metadata, autoScheduleTour: false, tourBookingType: 'booking_failed', selectedTourSlotId: null },
          }),
          supabaseRest(`luxor_lead_events?inquiry_id=eq.${encodeURIComponent(inquiry.id)}&status=eq.tour_confirmed&pipeline_stage=eq.tour`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'new', pipeline_stage: 'inquiry', updated_at: new Date().toISOString() }),
          }),
        ])
        const cleanupErrors = cleanup.filter((result) => result.status === 'rejected')
        if (cleanupErrors.length) console.error('Tour booking failed and some reservation cleanup steps need repair:', cleanupErrors)
        throw scheduleError
      }
    }

    if (inquiry?.email && inquiry.marketing_opt_in) {
      try {
        await addMarketingMember(inquiry.email, inquiry.full_name, inquiry.source)
      } catch (mktError) {
        console.error('Inquiry created but failed to auto-add to marketing list:', mktError)
      }
    }

    if (inquiry) {
      if (inquiry.email && (inquiry.flow === 'brochure_lead' || inquiry.source === 'homepage_brochure')) {
        try {
          const { buildBrochureDeliveryEmailHtml, createLuxorEmailJob, processLuxorEmailJobs } = await import('@/lib/luxorEmailJobsServer')
          const bodyHtml = buildBrochureDeliveryEmailHtml(inquiry)
          const job = await createLuxorEmailJob({
            inquiryId: inquiry.id,
            jobType: 'booking_package',
            recipientEmail: inquiry.email,
            subject: 'Your Luxor at Las Palmas Venue Brochure',
            body: bodyHtml,
            scheduledFor: new Date().toISOString(),
            metadata: {
              automated: true,
              flow_stage: 'brochure_delivery',
              lead_source: inquiry.source,
            },
          })
          if (job) {
            after(async () => {
              await processLuxorEmailJobs([job]).catch((err) => {
                console.error('Failed delivering brochure email job immediately:', err)
              })
            })
            // Optional sequence enrollment has an independent server-side gate.
            // The existing brochure delivery remains the sole Email #1.
            const { enrollLuxorBrochureLead } = await import('@/lib/luxorFollowUpsServer')
            await enrollLuxorBrochureLead(inquiry, job.id).catch((err) => {
              console.error('Brochure follow-up enrollment was not created:', err)
            })
          }
        } catch (brochureErr) {
          console.error('Failed queueing brochure email delivery:', brochureErr)
        }
      }

      // Record generic inquiry submission
      recordLuxorPublicEvent({
        eventName: 'inquiry_submitted',
        sessionId: payload.sessionId,
        pagePath: payload.pagePath,
        source: payload.source,
        inquiryId: inquiry.id,
        ipHash,
        metadata: {
          flow: inquiry.flow,
          eventType: inquiry.event_type,
          packageInterest: inquiry.package_interest,
          tourReserved: Boolean(inquiry.preferred_tour_date),
          marketingOptIn: inquiry.marketing_opt_in,
        },
      }).catch((eventError) => {
        console.error('Inquiry created but conversion event failed:', eventError)
      })

      // Record specialized primary conversions
      if (inquiry.flow === 'brochure_lead' || inquiry.source === 'homepage_brochure') {
        recordLuxorPublicEvent({
          eventName: 'brochure_submitted',
          sessionId: payload.sessionId,
          pagePath: payload.pagePath,
          source: payload.source,
          inquiryId: inquiry.id,
          ipHash,
          metadata: {
            eventType: inquiry.event_type,
            targetDate: inquiry.target_date,
            email: inquiry.email,
            phone: inquiry.phone,
            marketingOptIn: inquiry.marketing_opt_in,
          },
        }).catch(() => {})
      } else if (inquiry.flow === 'visit_booking' || inquiry.flow === 'tour_booking' || Boolean(inquiry.preferred_tour_date)) {
        recordLuxorPublicEvent({
          eventName: 'visit_booked',
          sessionId: payload.sessionId,
          pagePath: payload.pagePath,
          source: payload.source,
          inquiryId: inquiry.id,
          ipHash,
          metadata: {
            eventType: inquiry.event_type,
            preferredTourDate: inquiry.preferred_tour_date,
            preferredTourTime: inquiry.preferred_tour_time,
            email: inquiry.email,
            phone: inquiry.phone,
          },
        }).catch(() => {})
      } else if (inquiry.flow === 'contact_form') {
        recordLuxorPublicEvent({
          eventName: 'contact_submitted',
          sessionId: payload.sessionId,
          pagePath: payload.pagePath,
          source: payload.source,
          inquiryId: inquiry.id,
          ipHash,
          metadata: {
            eventType: inquiry.event_type,
            email: inquiry.email,
            phone: inquiry.phone,
          },
        }).catch(() => {})
      }

      const pushTitle = inquiry.flow === 'brochure_lead'
        ? 'Brochure lead captured'
        : tourScheduled
          ? 'Visit scheduled'
          : inquiry.flow === 'contact_form'
            ? 'New contact message'
            : 'New booking inquiry'

      const pushBody = inquiry.flow === 'brochure_lead'
        ? `${inquiry.full_name} requested the venue brochure for a ${inquiry.event_type || 'celebration'}.`
        : tourScheduled
          ? `${inquiry.full_name} received a calendar invite for their requested visit.`
          : `${inquiry.full_name} submitted an inquiry for review.`

      await sendLuxorWebPush('booking', {
        title: pushTitle,
        body: pushBody,
        url: `/portal/leads/${inquiry.id}`,
        tag: `luxor-inquiry-${inquiry.id}`,
      }).catch((pushError) => {
        console.error('Inquiry created, but Web Push delivery failed:', pushError)
      })
    }

    return NextResponse.json({ inquiry, tourScheduled }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit inquiry.'
    const status = message.includes('Missing SUPABASE') ? 500 : 400

    console.error('Luxor inquiry submission failed:', message)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id, status, author, expectedEmail: _expectedEmail, emailChangeRequestId: _emailChangeRequestId, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required.' }, { status: 400 })
    }

    const existing = await getLuxorInquiry(id)
    if (!existing) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }
    if (existing.is_test) return NextResponse.json({ error: 'The permanent test lead can only be changed through its run lifecycle controls.' }, { status: 409 })

    if (typeof updates.email === 'string') {
      const email = updates.email.trim().toLowerCase()
      const expectedEmail = typeof body.expectedEmail === 'string' ? body.expectedEmail.trim().toLowerCase() : ''
      const requestId = typeof body.emailChangeRequestId === 'string' ? body.emailChangeRequestId : ''
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
      }
      if (!requestId) return NextResponse.json({ error: 'Email change request is missing. Please try again.' }, { status: 400 })
      const result = await supabaseRest<{ inquiry: LuxorInquiry; resendJob: LuxorEmailJob | null; replayed: boolean }>(
        'rpc/luxor_update_inquiry_email_for_portal',
        { method: 'POST', body: JSON.stringify({
          p_inquiry_id: id,
          p_expected_email: expectedEmail,
          p_new_email: email,
          p_request_id: requestId,
        }) },
      )
      return NextResponse.json({ inquiry: result.inquiry, resendCandidate: result.resendJob, replayed: result.replayed })
    }

    if (updates.pipeline_stage === 'closed_lost') {
      return NextResponse.json({
        error: 'Use the Deal Lost action so open proposals, contracts, payment links, and reminders are safely withdrawn together.',
        action: `/api/leads/${encodeURIComponent(id)}/deal-lost`,
      }, { status: 409 })
    }

    if (status !== undefined) {
      if (!VALID_INQUIRY_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid inquiry status.' }, { status: 400 })
      }
      if (status === 'closed_lost') {
        return NextResponse.json({
          error: 'Use the Deal Lost action so open proposals, contracts, payment links, and reminders are safely withdrawn together.',
          action: `/api/leads/${encodeURIComponent(id)}/deal-lost`,
        }, { status: 409 })
      }
      updates.status = status
      updates.pipeline_stage = updates.pipeline_stage || stageForStatus(status)
    }

    const updated = await updateLuxorInquiry(id, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }

    if (status && status !== existing.status) {
      try {
        await createNote(
          id,
          `Status changed from ${formatStatus(existing.status)} to ${formatStatus(status)}.`,
          'status_change',
          typeof author === 'string' && author.trim() ? author : 'Portal Owner',
        )
      } catch (noteError) {
        console.error('Inquiry status updated, but status note creation failed:', noteError)
      }
    }

    if (
      updated.phone &&
      (
        updates.preferred_tour_date !== undefined ||
        updates.preferred_tour_time !== undefined ||
        (status === 'tour_confirmed' && existing.status !== 'tour_confirmed')
      )
    ) {
      try {
        await queueInquiryTextJobs(updated)
      } catch (automationError) {
        console.error('Inquiry updated, but its text reminders could not be queued:', automationError)
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update inquiry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
