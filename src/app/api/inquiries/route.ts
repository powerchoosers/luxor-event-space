import { NextRequest, NextResponse } from 'next/server'
import { createLuxorInquiry, findRecentDuplicateLuxorInquiry, listLuxorInquiries, getLuxorInquiry, stageForStatus, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { LuxorInquiryInput, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { addMarketingMember } from '@/lib/luxorMarketingServer'
import { sendInquiryNotificationEmail } from '@/lib/luxorNotificationEmails'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'
import { countRecentInquiryAttempts, getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'

const VALID_INQUIRY_STATUSES: LuxorInquiryStatus[] = [
  'new',
  'contacted',
  'tour_requested',
  'tour_confirmed',
  'proposal_sent',
  'booked',
  'closed_lost',
]

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

    if (payload.formStartedAt && Date.now() - payload.formStartedAt < 800) {
      return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 })
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

    const duplicate = await findRecentDuplicateLuxorInquiry(payload)
    if (duplicate) {
      return NextResponse.json({ inquiry: duplicate, duplicate: true }, { status: 200 })
    }

    const inquiry = await createLuxorInquiry(payload, request.headers.get('user-agent') ?? undefined)

    if (inquiry?.email && inquiry.marketing_opt_in) {
      try {
        await addMarketingMember(inquiry.email, inquiry.full_name, inquiry.source)
      } catch (mktError) {
        console.error('Inquiry created but failed to auto-add to marketing list:', mktError)
      }
    }

    if (inquiry) {
      sendInquiryNotificationEmail(inquiry).catch((emailErr) => {
        console.error('Inquiry created but failed to send internal notification email:', emailErr)
      })

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
    }

    return NextResponse.json({ inquiry }, { status: 201 })
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

    if (status !== undefined) {
      if (!VALID_INQUIRY_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid inquiry status.' }, { status: 400 })
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
