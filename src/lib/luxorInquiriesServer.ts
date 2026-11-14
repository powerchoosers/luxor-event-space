import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { getLuxorTourSlot, assertTourSlotCanBeBooked } from './luxorTourSlotsServer'
import { formatTourSlotTime } from './luxorTourSlots'
import { normalizedState } from './luxorCalendarServer'
import { buildLuxorTourPlan } from './luxorTourPlanningServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { assertEmailHasNoUnresolvedPlaceholders, getTourResponseLinks } from './luxorEmailJobsServer'

import { compactText, getLuxorConsentFormProfile, LuxorInquiry, LuxorInquiryInput, LuxorPipelineStage, LuxorInquiryStatus, isLuxorEventTypeRequiredFlow, normalizeLuxorEventType, parseGuestCount, LUXOR_INQUIRY_EMAIL_DISCLOSURE, LUXOR_INQUIRY_EMAIL_DISCLOSURE_VERSION } from './luxorInquiryTypes'
import { buildTourEmail, createLuxorEmailJob, createPublicToken } from './luxorEmailJobsServer'
import { SupabaseRestError, supabaseRest } from './supabaseRestServer'

export const LUXOR_INQUIRIES_METADATA_IDEMPOTENCY_UNIQUE_INDEX = 'luxor_inquiries_metadata_idempotency_key_uidx'
import { findRecentLuxorInquiryMatch } from './luxorInquiryDuplicateMatch'
import { compareLuxorScheduledTours, getLuxorInquiryPageRequest, loadLuxorPages } from './luxorTourMetrics'
import { recordLuxorWebsiteSmsConsent } from './luxorTextAutomationsServer'

export type LuxorTaskInquiryContext = Pick<LuxorInquiry, 'id' | 'full_name' | 'event_type' | 'target_date' | 'phone' | 'email' | 'status' | 'tour_attendance_status'>

/** Load the small set of inquiry fields needed to identify task owners in the calendar. */
export async function listTaskInquiryContexts(inquiryIds: string[]): Promise<LuxorTaskInquiryContext[]> {
  const ids = [...new Set(inquiryIds)].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  if (!ids.length) return []

  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100))
  const results = await Promise.all(chunks.map((chunk) =>
    supabaseRest<LuxorTaskInquiryContext[]>(`luxor_inquiries?select=id,full_name,event_type,target_date,phone,email,status,tour_attendance_status&id=in.(${chunk.join(',')})`),
  ))
  return results.flat()
}

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
  const flow = compactText(input.flow) || 'tour_request'
  const eventType = normalizeLuxorEventType(input.eventType)

  if (isLuxorEventTypeRequiredFlow(flow) && !eventType) {
    throw new Error('Please enter an event type.')
  }

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

  const submittedMetadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata
    : {}
  const consentProfile = getLuxorConsentFormProfile(
    input.source,
    input.flow,
    submittedMetadata.websiteLocale ?? submittedMetadata.tourLanguagePreference ?? submittedMetadata.language,
  )
  const customerCareSmsOptIn = Boolean(phone && consentProfile?.customerCareSmsDisclosure && input.smsOptIn === true)
  const marketingSmsOptIn = Boolean(phone && consentProfile?.marketingSmsDisclosure && input.smsMarketingOptIn === true)
  const marketingEmailOptIn = Boolean(email && consentProfile?.marketingEmailDisclosure && input.marketingOptIn === true)
  const emailInquiryOptIn = Boolean(email && input.emailInquiryOptIn === true)
  const smsScopes = [
    ...(customerCareSmsOptIn ? consentProfile?.customerCareScopes ?? [] : []),
    ...(marketingSmsOptIn ? ['marketing'] : []),
  ]
  const {
    smsConsent: _untrustedSmsConsent,
    marketingEmailConsent: _untrustedMarketingEmailConsent,
    consentPage: _untrustedConsentPage,
    disclosureVersion: _untrustedDisclosureVersion,
    ...safeMetadata
  } = submittedMetadata

  const metadata: Record<string, unknown> = {
    ...safeMetadata,
    ...(input.sessionId ? { publicSessionId: compactText(input.sessionId).slice(0, 120) } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(marketingEmailOptIn
      ? {
          marketingEmailConsent: {
            status: 'opted_in',
            source: consentProfile!.source,
            disclosureVersion: consentProfile!.marketingEmailDisclosureVersion,
            disclosure: consentProfile!.marketingEmailDisclosure,
            email,
            capturedAt: new Date().toISOString(),
          },
        }
      : {}),
    ...(emailInquiryOptIn
      ? {
          emailCommunicationConsent: {
            status: 'opted_in',
            source: consentProfile?.source || input.source || 'website_inquiry_form',
            disclosureVersion: LUXOR_INQUIRY_EMAIL_DISCLOSURE_VERSION,
            disclosure: LUXOR_INQUIRY_EMAIL_DISCLOSURE,
            email,
            capturedAt: new Date().toISOString(),
          },
        }
      : {}),
    ...(smsScopes.length && consentProfile
      ? {
          smsConsent: {
            status: 'opted_in',
            source: consentProfile.source,
            disclosureVersion: consentProfile.smsDisclosureVersion,
            disclosures: [
              ...(customerCareSmsOptIn && consentProfile.customerCareSmsDisclosure ? [consentProfile.customerCareSmsDisclosure] : []),
              ...(marketingSmsOptIn && consentProfile.marketingSmsDisclosure ? [consentProfile.marketingSmsDisclosure] : []),
            ],
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
    event_type: eventType || null,
    target_date: compactText(input.targetDate) || null,
    guest_count: parseGuestCount(input.guestCount),
    budget: compactText(input.budget) || null,
    preferred_tour_date: compactText(input.preferredTourDate) || null,
    preferred_tour_time: compactText(input.preferredTourTime) || compactText(input.metadata?.preferredTourWindow) || null,
    package_interest: compactText(input.packageInterest) || null,
    message: message || null,
    source: compactText(input.source) || 'website',
    flow,
    campaign_key: compactText(input.campaignKey) || null,
    rsvp_status: normalizeRsvpStatus(input.rsvpStatus),
    marketing_opt_in: marketingEmailOptIn,
    attendee_count: parseGuestCount(input.attendeeCount),
    page_path: compactText(input.pagePath) || null,
    referrer: compactText(input.referrer) || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    metadata,
  }
}

export async function findLuxorInquiryByIdempotencyKey(idempotencyKey: string) {
  const key = idempotencyKey.trim()
  if (key.length < 8) return null
  const [match] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&metadata->>idempotencyKey=eq.${encodeURIComponent(key)}&order=created_at.asc&limit=1`,
  )
  return match ?? null
}

function isLuxorInquiryIdempotencyUniqueViolation(error: unknown) {
  if (!(error instanceof SupabaseRestError)) return false
  if (error.code !== '23505' && error.status !== 409) return false
  const detail = error.message.toLowerCase()
  return detail.includes(LUXOR_INQUIRIES_METADATA_IDEMPOTENCY_UNIQUE_INDEX)
    || detail.includes('metadata->>idempotencykey')
    || detail.includes('metadata->>\'idempotencykey\'')
}

async function loadInquiryIdempotencyReplay(error: unknown, idempotencyKey: string) {
  if (!isLuxorInquiryIdempotencyUniqueViolation(error)) return null
  let existing = await findLuxorInquiryByIdempotencyKey(idempotencyKey)
  if (!existing) {
    await new Promise((resolve) => setTimeout(resolve, 30))
    existing = await findLuxorInquiryByIdempotencyKey(idempotencyKey)
  }
  return existing
}

export async function findRecentDuplicateLuxorInquiry(input: LuxorInquiryInput, minutes = 10) {
  const idempotencyKey = typeof input.metadata?.idempotencyKey === 'string' ? input.metadata.idempotencyKey.trim() : ''
  if (idempotencyKey.length >= 8) {
    const match = await findLuxorInquiryByIdempotencyKey(idempotencyKey)
    if (match) return match
  }

  const email = compactText(input.email).toLowerCase()
  const phone = compactText(input.phone)
  if (!email && !phone) return null

  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const filters = [
    email ? `email.eq.${encodeURIComponent(email)}` : '',
    phone ? `phone.eq.${encodeURIComponent(phone)}` : '',
  ].filter(Boolean)

  const existing = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&created_at=gte.${encodeURIComponent(since)}&or=(${filters.join(',')})&order=created_at.desc&limit=100`,
  )
  // Keep existing deduplication for other forms, while avoiding cross-flow
  // collisions when a brochure or booking is followed by a contact message.
  return findRecentLuxorInquiryMatch(input, existing)
}

function normalizeRsvpStatus(value: unknown) {
  return value === 'attending' || value === 'not_attending' || value === 'maybe' ? value : null
}

export async function createLuxorInquiry(input: LuxorInquiryInput, userAgent?: string, options?: { idempotencyKey?: string; replayed?: boolean }) {
  const row = normalizeInquiry(input, userAgent)
  const selectedTourSlotId =
    typeof row.metadata?.selectedTourSlotId === 'string' ? row.metadata.selectedTourSlotId : null

  const isNewsletter =
    row.flow === 'newsletter_signup' ||
    row.source === 'newsletter' ||
    row.metadata?.marketing_source === 'newsletter' ||
    row.metadata?.submitted_form === 'Newsletter Signup'
  const hasReservedTourSlot = Boolean(selectedTourSlotId)
  const status = row.preferred_tour_date || row.preferred_tour_time
    ? hasReservedTourSlot ? 'tour_confirmed' : 'tour_requested'
    : 'new'
  const pipelineStage: LuxorPipelineStage = isNewsletter && !hasReservedTourSlot
    ? 'newsletter'
    : status === 'tour_requested' || status === 'tour_confirmed' ? 'tour' : 'inquiry'
  const insertPayload = {
    ...row,
    metadata: row.metadata,
    internal_notification_requested: true,
    status,
    pipeline_stage: pipelineStage,
    tour_attendance_status: status === 'tour_requested' || status === 'tour_confirmed' ? 'pending' : null,
  }
  let created: LuxorInquiry | undefined
  if (selectedTourSlotId) {
    const idempotencyKey = options?.idempotencyKey || randomUUID()
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const previous = await supabaseRest<LuxorInquiry | null>('rpc/luxor_find_public_tour_request', {
      method: 'POST', body: JSON.stringify({ p_request_id: idempotencyKey, p_fingerprint: fingerprint }),
    })
    if (previous) {
      if (options) options.replayed = true
      return previous
    }
    const slot = await getLuxorTourSlot(selectedTourSlotId)
    if (!slot || slot.status !== 'available' || slot.booked_count >= slot.capacity) {
      // Another request with this key may have committed after the first lookup.
      const winner = await supabaseRest<LuxorInquiry | null>('rpc/luxor_find_public_tour_request', {
        method: 'POST', body: JSON.stringify({ p_request_id: idempotencyKey, p_fingerprint: fingerprint }),
      })
      if (winner) {
        if (options) options.replayed = true
        return winner
      }
    }
    assertTourSlotCanBeBooked(slot)
    const token = createPublicToken()
    const links = getTourResponseLinks(token)
    const contactPhone = await getActiveLuxorPhoneNumber().catch(() => null)
    const draft = { ...row, preferred_tour_date: slot!.slot_date,
      preferred_tour_time: formatTourSlotTime(slot!.start_time) } as LuxorInquiry
    const plan = await buildLuxorTourPlan({ inquiry: draft, date: slot!.slot_date,
      time: formatTourSlotTime(slot!.start_time), responseToken: token, responseUrl: links.rescheduleUrl,
      contactPhone, meetingType: 'Private Venue Tour', durationMinutes: 30 })
    for (const template of Object.values(plan.templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)
    const result = await supabaseRest<{ inquiry: LuxorInquiry; replayed: boolean }>('rpc/luxor_create_scheduled_tour_inquiry', {
      method: 'POST', body: JSON.stringify({ p_slot_id: selectedTourSlotId, p_payload: insertPayload,
        p_state: normalizedState({ ...plan.state, status: 'confirmed' }), p_tour: plan.tour, p_templates: plan.templates,
        p_visit_id: randomUUID(), p_request_id: randomUUID(), p_idempotency_key: idempotencyKey, p_fingerprint: fingerprint }),
    })
    created = result.inquiry
    if (result.replayed) {
      if (options) options.replayed = true
      return created
    }
  } else {
    const idempotencyKey = options?.idempotencyKey?.trim()
      || (typeof row.metadata?.idempotencyKey === 'string' ? row.metadata.idempotencyKey.trim() : '')
    try {
      ;[created] = await insertLuxorInquiryRow(insertPayload)
    } catch (error) {
      if (idempotencyKey.length >= 8) {
        const replay = await loadInquiryIdempotencyReplay(error, idempotencyKey)
        if (replay) {
          if (options) options.replayed = true
          return replay
        }
      }
      throw error
    }
  }

  const smsConsent = row.metadata?.smsConsent as { source?: string; scopes?: string[]; disclosureVersion?: string; disclosures?: string[] } | undefined
  if (created?.phone && smsConsent) {
    try {
      const consent = await recordLuxorWebsiteSmsConsent(created.phone, smsConsent.source || 'website_inquiry_form', {
        scopes: smsConsent.scopes,
        proof: {
          inquiry_id: created.id,
          page_path: created.page_path,
          disclosure_version: smsConsent.disclosureVersion,
          disclosure_texts: smsConsent.disclosures,
        },
      })
      if (consent?.status === 'opted_in' && smsConsent.scopes?.includes('customer_care')) {
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
      let copySettingsUnavailable = false
      let override = null
      try { override = (await (await import('./luxorReceiptEmailCopyServer')).readReceiptEmailCopy('tour_request_received')).setting.copy_override }
      catch (error) { copySettingsUnavailable = true; console.error('Tour request email settings unavailable; using the original receipt:', error) }
      const requestEmailHtml = buildTourRequestReceivedEmailHtml(created, token, override)
      const customSubject = override ? (await import('./luxorInquiryEmailCopy')).renderInquiryEmailCopy(override, { first_name: created.full_name.split(' ')[0] || created.full_name, event_type: created.event_type || 'Private event', guest_count: created.guest_count ? String(created.guest_count) : 'Open' }).subject : null
      const job = await createLuxorEmailJob({
        inquiryId: created.id,
        jobType: 'tour_confirmation',
        recipientEmail: created.email,
        subject: customSubject || 'Your Luxor tour request is received',
        body: requestEmailHtml,
        metadata: { source: 'tour_request_received', ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}) },
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
  } else if (created?.email && !autoScheduleTour) {
    try {
      const { buildNewsletterConfirmationEmailHtml, buildStandardInquiryEmailHtml, listQueuedLuxorEmailJobsByIds, processLuxorEmailJobs } = await import('./luxorEmailJobsServer')
      const newsletterSignup = created.flow === 'newsletter_signup'
      let copySettingsUnavailable = false
      let override = null
      if (newsletterSignup) {
        try { override = (await (await import('./luxorReceiptEmailCopyServer')).readReceiptEmailCopy('newsletter_confirmation')).setting.copy_override }
        catch (error) { copySettingsUnavailable = true; console.error('Newsletter email settings unavailable; using the original receipt:', error) }
      } else {
        try {
          override = (await (await import('./luxorInquiryEmailCopyServer')).readInquiryEmailCopySetting()).setting.copy_override
        } catch (error) {
          // A settings outage must not lose the customer's inquiry receipt.
          // Record the fallback on the queued job so it is distinguishable
          // from a deliberate restore to default.
          copySettingsUnavailable = true
          console.error('Inquiry email settings unavailable; using the original receipt:', error)
        }
      }
      const emailHtml = newsletterSignup ? buildNewsletterConfirmationEmailHtml(created, override) : buildStandardInquiryEmailHtml(created, override)
      const customSubject = override ? (await import('./luxorInquiryEmailCopy')).renderInquiryEmailCopy(override, { first_name: newsletterSignup && created.full_name === 'Newsletter subscriber' ? 'there' : created.full_name.split(' ')[0] || created.full_name, event_type: created.event_type || 'Private event', guest_count: created.guest_count ? String(created.guest_count) : 'Open' }).subject : null

      const job = await createLuxorEmailJob({
        inquiryId: created.id,
        jobType: 'marketing_campaign',
        recipientEmail: created.email,
        subject: customSubject || (newsletterSignup ? 'You’re on the Luxor list' : 'We have received your Luxor inquiry'),
        body: emailHtml,
        // This is a receipt for a newly submitted inquiry, not a promotional
        // campaign. A marketing opt-out must not hide that requested receipt;
        // hard-bounce/complaint blocks still remain enforced by the worker.
        metadata: { ignore_suppressions: true, source: newsletterSignup ? 'newsletter_confirmation' : 'inquiry_acknowledgment', ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}) },
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

  // Auto-scheduled tours use one combined branded calendar invitation. The
  // scheduling transaction owns that receipt so this insert path must not
  // send a second, generic inquiry acknowledgment first.

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
  const requested = Math.max(0, Math.floor(limit))
  const pageSize = 1000
  return loadLuxorPages((offset, count) => {
    const page = getLuxorInquiryPageRequest(offset, count)
    return supabaseRest<LuxorInquiry[]>(page.path, { headers: page.headers })
  }, pageSize, requested)
}

export async function listAllLuxorInquiries() {
  const pageSize = 1000
  return loadLuxorPages((offset, count) => {
    const page = getLuxorInquiryPageRequest(offset, count)
    return supabaseRest<LuxorInquiry[]>(page.path, { headers: page.headers })
  }, pageSize)
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

export async function listLuxorConfirmedTours() {
  const inquiries = await listAllLuxorInquiries()
  return inquiries
    .filter((inquiry) => Boolean(inquiry.preferred_tour_date) && inquiry.tour_attendance_status !== 'cancelled')
    .sort((a, b) => compareLuxorScheduledTours(a, b, 'asc'))
}

export async function updateLuxorInquiry(id: string, updates: Partial<Record<string, unknown>>) {
  const normalizedUpdates = { ...updates }
  if (normalizedUpdates.event_type !== undefined) {
    const eventType = normalizeLuxorEventType(normalizedUpdates.event_type)
    if (!eventType) throw new Error('Please enter an event type.')
    normalizedUpdates.event_type = eventType
  }

  const [updated] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...normalizedUpdates,
        updated_at: new Date().toISOString(),
      }),
    }
  )
  return updated ?? null
}

export async function updateLuxorInquiryIfTourAttendanceStatus(
  id: string,
  expectedStatus: LuxorInquiry['tour_attendance_status'] | null | undefined,
  updates: Partial<Record<string, unknown>>,
) {
  const statusFilter = expectedStatus == null
    ? 'tour_attendance_status=is.null'
    : `tour_attendance_status=eq.${encodeURIComponent(expectedStatus)}`
  const [updated] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}&${statusFilter}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    },
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
