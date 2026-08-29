import 'server-only'

import { compactText, LuxorInquiry, LuxorInquiryInput, LuxorPipelineStage, LuxorInquiryStatus, parseGuestCount } from './luxorInquiryTypes'
import { buildTourEmail, createLuxorEmailJob, createPublicToken } from './luxorEmailJobsServer'
import { supabaseRest } from './supabaseRestServer'
import { recordLuxorSmsConsent } from './luxorTextAutomationsServer'
import {
  applyTourSlotToInquiry,
  assertTourSlotCanBeBooked,
  getLuxorTourSlot,
  releaseLuxorTourSlot,
  reserveLuxorTourSlot,
} from './luxorTourSlotsServer'

const OPTIONAL_INQUIRY_COLUMNS = [
  'attendee_count',
  'campaign_key',
  'rsvp_status',
  'marketing_opt_in',
  'budget',
  'page_path',
  'referrer',
] as const

export function normalizeInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const fullName = compactText(input.fullName)
  const email = compactText(input.email).toLowerCase()
  const phone = compactText(input.phone)
  const message = typeof input.message === 'string' ? input.message.trim() : ''

  if (!fullName) {
    throw new Error('Please add your full name.')
  }

  if (fullName.length > 120) {
    throw new Error('Please shorten the name to 120 characters or fewer.')
  }

  if (!email && !phone) {
    throw new Error('Please add either an email or phone number so Luxor can follow up.')
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please check the email address and try again.')
  }

  if (phone && phone.replace(/\D/g, '').length < 10) {
    throw new Error('Please enter a complete phone number.')
  }

  if (message.length > 3000) {
    throw new Error('Please shorten the event notes to 3,000 characters or fewer.')
  }

  const smsScopes = [
    ...(phone && input.smsOptIn ? ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice'] : []),
    ...(phone && input.smsMarketingOptIn ? ['marketing'] : []),
  ]

  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    ...(input.sessionId ? { publicSessionId: compactText(input.sessionId).slice(0, 120) } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(smsScopes.length
      ? {
          smsConsent: {
            status: 'opted_in',
            source: 'website_inquiry_form',
            disclosureVersion: '2026-07-27',
            scopes: smsScopes,
            capturedAt: new Date().toISOString(),
          },
        }
      : {}),
  }

  return {
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    event_type: compactText(input.eventType) || null,
    target_date: compactText(input.targetDate) || null,
    guest_count: parseGuestCount(input.guestCount),
    budget: compactText(input.budget) || null,
    preferred_tour_date: compactText(input.preferredTourDate) || null,
    preferred_tour_time: compactText(input.preferredTourTime) || compactText(input.metadata?.preferredTourWindow) || null,
    package_interest: compactText(input.packageInterest) || null,
    message: message || null,
    source: compactText(input.source) || 'website',
    flow: compactText(input.flow) || 'tour_request',
    campaign_key: compactText(input.campaignKey) || null,
    rsvp_status: normalizeRsvpStatus(input.rsvpStatus),
    marketing_opt_in: Boolean(input.marketingOptIn),
    attendee_count: parseGuestCount(input.attendeeCount),
    page_path: compactText(input.pagePath) || null,
    referrer: compactText(input.referrer) || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    metadata,
  }
}

export async function findRecentDuplicateLuxorInquiry(input: LuxorInquiryInput, minutes = 10) {
  const email = compactText(input.email).toLowerCase()
  const phone = compactText(input.phone)
  if (!email && !phone) return null

  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const filters = [
    email ? `email.eq.${encodeURIComponent(email)}` : '',
    phone ? `phone.eq.${encodeURIComponent(phone)}` : '',
  ].filter(Boolean)

  const [existing] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&created_at=gte.${encodeURIComponent(since)}&or=(${filters.join(',')})&order=created_at.desc&limit=1`,
  )

  return existing ?? null
}

function normalizeRsvpStatus(value: unknown) {
  return value === 'attending' || value === 'not_attending' || value === 'maybe' ? value : null
}

export async function createLuxorInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const row = normalizeInquiry(input, userAgent)
  const selectedTourSlotId =
    typeof row.metadata?.selectedTourSlotId === 'string' ? row.metadata.selectedTourSlotId : null

  const selectedTourSlot = selectedTourSlotId ? await getLuxorTourSlot(selectedTourSlotId) : null

  let reservedTourSlot: Awaited<ReturnType<typeof reserveLuxorTourSlot>> | null = null

  if (selectedTourSlotId) {
    assertTourSlotCanBeBooked(selectedTourSlot)
    reservedTourSlot = await reserveLuxorTourSlot(selectedTourSlot!)
    applyTourSlotToInquiry(row, reservedTourSlot)
  }

  const status = row.preferred_tour_date || row.preferred_tour_time ? 'tour_requested' : 'new'
  const pipelineStage: LuxorPipelineStage = status === 'tour_requested' ? 'tour' : 'inquiry'
  const insertPayload = {
    ...row,
    internal_notification_requested: true,
    status,
    pipeline_stage: pipelineStage,
    tour_attendance_status: status === 'tour_requested' ? 'pending' : null,
  }
  let created: LuxorInquiry | undefined
  try {
    ;[created] = await insertLuxorInquiryRow(insertPayload)
  } catch (error) {
    if (reservedTourSlot) {
      await releaseLuxorTourSlot(reservedTourSlot.id).catch((releaseError) => {
        console.error('Inquiry insert failed and its tour slot could not be released:', releaseError)
      })
    }
    throw error
  }

  const smsConsent = row.metadata?.smsConsent as { scopes?: string[] } | undefined
  if (created?.phone && smsConsent) {
    try {
      await recordLuxorSmsConsent(created.phone, 'START', 'website_inquiry_form', {
        scopes: smsConsent.scopes,
        proof: {
          inquiry_id: created.id,
          page_path: created.page_path,
          disclosure_version: '2026-07-27',
        },
      })
      if (smsConsent.scopes?.includes('customer_care')) {
        const { queueInquiryTextJobs } = await import('./luxorTextCampaignsServer')
        await queueInquiryTextJobs(created)
      }
    } catch (consentError) {
      console.error('Inquiry created but its SMS consent or confirmation jobs could not be recorded:', consentError)
    }
  }

  const autoScheduleTour = created?.metadata?.autoScheduleTour === true
  if (created?.email && created.preferred_tour_date && !autoScheduleTour) {
    try {
      const token = created.tour_response_token || createPublicToken()
      await updateLuxorInquiry(created.id, { tour_response_token: token })

      const { buildTourRequestReceivedEmailHtml, listQueuedLuxorEmailJobsByIds, processLuxorEmailJobs } = await import('./luxorEmailJobsServer')
      const requestEmailHtml = buildTourRequestReceivedEmailHtml(created, token)
      const job = await createLuxorEmailJob({
        inquiryId: created.id,
        jobType: 'tour_confirmation',
        recipientEmail: created.email,
        subject: 'Your Luxor tour request is received',
        body: requestEmailHtml,
      })

      // Process tour request received email immediately for instant feedback
      try {
        const jobs = await listQueuedLuxorEmailJobsByIds([job.id])
        await processLuxorEmailJobs(jobs)
      } catch (procErr) {
        console.error('Failed to immediately process tour request email:', procErr)
      }
    } catch (emailError) {
      console.error('Luxor tour request email queue failed:', emailError)
    }
  } else if (created?.email) {
    try {
      const { buildStandardInquiryEmailHtml, listQueuedLuxorEmailJobsByIds, processLuxorEmailJobs } = await import('./luxorEmailJobsServer')
      const emailHtml = buildStandardInquiryEmailHtml(created)

      const job = await createLuxorEmailJob({
        inquiryId: created.id,
        jobType: 'marketing_campaign',
        recipientEmail: created.email,
        subject: 'We have received your Luxor inquiry',
        body: emailHtml,
        // This is a receipt for a newly submitted inquiry, not a promotional
        // campaign. A marketing opt-out must not hide that requested receipt;
        // hard-bounce/complaint blocks still remain enforced by the worker.
        metadata: { ignore_suppressions: true, source: 'inquiry_acknowledgment' },
      })

      // Send standard confirmation immediately
      try {
        const jobs = await listQueuedLuxorEmailJobsByIds([job.id])
        await processLuxorEmailJobs(jobs)
      } catch (procErr) {
        console.error('Failed to immediately process standard confirmation email:', procErr)
      }
    } catch (emailError) {
      console.error('Luxor standard inquiry confirmation email queue failed:', emailError)
    }
  }

  return created
}

async function insertLuxorInquiryRow(payload: Record<string, unknown>) {
  try {
    return await supabaseRest<LuxorInquiry[]>('luxor_inquiries?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const missingColumn = getMissingColumnFromSchemaCacheError(message)

    if (!missingColumn || !OPTIONAL_INQUIRY_COLUMNS.includes(missingColumn as (typeof OPTIONAL_INQUIRY_COLUMNS)[number])) {
      throw error
    }

    const retryPayload = { ...payload }
    delete retryPayload[missingColumn]

    console.warn(`luxor_inquiries is missing optional column "${missingColumn}". Retrying insert without it.`)

    return supabaseRest<LuxorInquiry[]>('luxor_inquiries?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(retryPayload),
    })
  }
}

function getMissingColumnFromSchemaCacheError(message: string) {
  const match = message.match(/Could not find the '([^']+)' column of 'luxor_inquiries' in the schema cache/i)
  return match?.[1] ?? null
}

export async function listLuxorInquiries(limit = 1000) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function getLuxorInquiry(id: string) {
  const [inquiry] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )

  return inquiry ?? null
}

export async function getLuxorInquiryByTourToken(token: string) {
  const [inquiry] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&tour_response_token=eq.${encodeURIComponent(token)}&limit=1`,
  )

  return inquiry ?? null
}

export async function listLuxorTourRequests(limit = 1000) {
  return supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&preferred_tour_date=not.is.null&order=preferred_tour_date.asc,preferred_tour_time.asc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function updateLuxorInquiry(id: string, updates: Partial<Record<string, unknown>>) {
  const [updated] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString(),
      }),
    }
  )
  return updated ?? null
}

export function stageForStatus(status: LuxorInquiryStatus): LuxorPipelineStage {
  if (status === 'tour_requested' || status === 'tour_confirmed') return 'tour'
  if (status === 'proposal_sent') return 'proposal'
  if (status === 'booked') return 'contract'
  if (status === 'closed_lost') return 'closed_lost'
  return 'inquiry'
}

function getTourReminderTime(tourDate: string) {
  const date = new Date(`${tourDate}T10:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() - 1)
  return date.toISOString()
}
