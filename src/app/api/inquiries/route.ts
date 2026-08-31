import { NextRequest, NextResponse } from 'next/server'
import { createLuxorInquiry, findRecentDuplicateLuxorInquiry, listLuxorInquiries, getLuxorInquiry, stageForStatus, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { isGuestCountOverCapacity, LUXOR_GUEST_CAPACITY_MESSAGE, LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { addMarketingMember } from '@/lib/luxorMarketingServer'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'
import { countRecentInquiryAttempts, getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'
import { buildAiTourConfirmationEmail, buildTourReminderEmail, type TourEmailContext } from '@/lib/luxorTourEmailServer'
import { assertEmailHasNoUnresolvedPlaceholders, createPublicToken, getTourResponseLinks, listLuxorEmailJobsForInquiry, processLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { saveLuxorTourSchedule } from '@/lib/luxorTourScheduleServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

const TOUR_TIMEZONE = 'America/Chicago'
const TOUR_LOCATION = 'Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237'

const VALID_INQUIRY_STATUSES: LuxorInquiryStatus[] = [
  'new',
  'contacted',
  'tour_requested',
  'tour_confirmed',
  'proposal_sent',
  'booked',
  'closed_lost',
]

function parseTourTime(value: string) {
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!twelveHour) return null
  let hours = Number(twelveHour[1]) % 12
  if (twelveHour[3].toUpperCase() === 'PM') hours += 12
  const minutes = Number(twelveHour[2])
  return minutes <= 59 ? { hours, minutes } : null
}

function zonedTourDateTimeToUtc(dateValue: string, timeValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error('Choose a valid tour date.')
  const time = parseTourTime(timeValue)
  if (!time) throw new Error('Choose a specific tour time.')
  const [year, month, day] = dateValue.split('-').map(Number)
  const wantedUtc = Date.UTC(year, month - 1, day, time.hours, time.minutes)
  let result = new Date(wantedUtc)

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TOUR_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(result)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute))
    result = new Date(result.getTime() + (wantedUtc - representedUtc))
  }
  return result
}

function formatScheduledTourDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TOUR_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function formatScheduledTourTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TOUR_TIMEZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)
}

async function scheduleTourFromPublicRequest(inquiry: LuxorInquiry) {
  if (!inquiry.email || !inquiry.preferred_tour_date || !inquiry.preferred_tour_time) {
    throw new Error('An email address, tour date, and specific tour time are required to send an invite.')
  }
  const startUtc = zonedTourDateTimeToUtc(inquiry.preferred_tour_date, inquiry.preferred_tour_time)
  if (startUtc.getTime() <= Date.now()) throw new Error('Choose a future tour time.')

  const endUtc = new Date(startUtc.getTime() + 30 * 60_000)
  const token = inquiry.tour_response_token || createPublicToken()
  const links = getTourResponseLinks(token)
  const contactPhone = await getActiveLuxorPhoneNumber().catch((error) => {
    console.warn('Tour confirmation could not load the active Luxor phone number:', error)
    return null
  })
  const emailContext: TourEmailContext = {
    inquiry,
    meetingType: 'Private Venue Tour',
    clientFacingNotes: '',
    tourDateLabel: formatScheduledTourDate(startUtc),
    tourTimeLabel: formatScheduledTourTime(startUtc),
    durationMinutes: 30,
    responseUrl: links.rescheduleUrl,
    contactPhone,
  }
  const confirmation = await buildAiTourConfirmationEmail(emailContext)
  const templates = {
    confirmation,
    reminder_24: buildTourReminderEmail(emailContext, 'tomorrow'),
    reminder_2: buildTourReminderEmail(emailContext, 'soon'),
  }
  for (const template of Object.values(templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)

  const saved = await saveLuxorTourSchedule({
    inquiry,
    expectedSequence: -1,
    state: {
      title: `Private Venue Tour · ${inquiry.full_name}`,
      description: [
        `Private appointment for ${inquiry.full_name}.`,
        `Event: ${inquiry.event_type || 'Private event'}`,
        inquiry.guest_count ? `Expected guests: ${inquiry.guest_count}` : '',
        `Reschedule: ${links.rescheduleUrl}`,
      ].filter(Boolean).join('\n'),
      location: TOUR_LOCATION,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      attendeeEmails: [inquiry.email],
    },
    tour: { meetingType: 'Private Venue Tour', clientFacingNotes: '', responseToken: token, assignees: [] },
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
    const limit = limitParam ? parseInt(limitParam, 10) : 1000
    const inquiries = await listLuxorInquiries(limit)
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

    const autoScheduleTour = payload.metadata?.autoScheduleTour === true
    if (autoScheduleTour) {
      const email = payload.email?.trim()
      const date = payload.preferredTourDate?.trim()
      const time = payload.preferredTourTime?.trim()
      if (!email || !date || !time) {
        return NextResponse.json({ error: 'An email address, tour date, and specific tour time are required to schedule your visit.' }, { status: 400 })
      }
      try {
        if (zonedTourDateTimeToUtc(date, time).getTime() <= Date.now()) {
          return NextResponse.json({ error: 'Choose a future tour time.' }, { status: 400 })
        }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Choose a valid tour time.' }, { status: 400 })
      }
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

    const selectedTourSlotId = typeof payload.metadata?.selectedTourSlotId === 'string'
      ? payload.metadata.selectedTourSlotId
      : null
    if (!selectedTourSlotId) {
      const duplicate = await findRecentDuplicateLuxorInquiry(payload)
      if (duplicate) {
        return NextResponse.json({ inquiry: duplicate, duplicate: true }, { status: 200 })
      }
    }

    let inquiry = await createLuxorInquiry(payload, request.headers.get('user-agent') ?? undefined)
    let tourScheduled = false
    if (autoScheduleTour && inquiry) {
      const savedTour = await scheduleTourFromPublicRequest(inquiry)
      inquiry = savedTour.inquiry
      tourScheduled = true
    }

    if (inquiry?.email && inquiry.marketing_opt_in) {
      try {
        await addMarketingMember(inquiry.email, inquiry.full_name, inquiry.source)
      } catch (mktError) {
        console.error('Inquiry created but failed to auto-add to marketing list:', mktError)
      }
    }

    if (inquiry) {
      // Internal email alerts were atomically queued by the inquiry insert.
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

      await sendLuxorWebPush('booking', {
        title: tourScheduled ? 'Tour scheduled' : 'New booking inquiry',
        body: tourScheduled
          ? `${inquiry.full_name} received a calendar invite for their requested tour.`
          : 'A new inquiry is ready to review in the owner portal.',
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
    const { id, status, author, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required.' }, { status: 400 })
    }

    const existing = await getLuxorInquiry(id)
    if (!existing) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
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
