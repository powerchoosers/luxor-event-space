import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { createLuxorInquiry, updateLuxorInquiry } from './luxorInquiriesServer'
import { createUniqueLuxorEmailJob } from './luxorEmailJobsServer'
import { addMarketingMember, isMarketingMember } from './luxorMarketingServer'
import { LUXOR_GRAND_OPENING } from './luxorGrandOpening'
import type { LuxorInquiry } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

export type GrandOpeningAttendee = {
  id: string
  created_at: string
  updated_at: string
  campaign_key: string
  inquiry_id: string | null
  invited_by_inquiry_id: string | null
  full_name: string
  email: string
  phone: string | null
  attendee_type: 'rsvp' | 'guest'
  checked_in_at: string
  checked_in_by: 'self' | 'staff'
  marketing_opt_in: boolean
  eligible: boolean
  winner_at: string | null
  prize_label: string | null
  disqualified_at: string | null
  disqualification_reason: string | null
  metadata: Record<string, unknown>
}

export type GrandOpeningRsvpCandidate = Pick<LuxorInquiry, 'id' | 'full_name' | 'phone' | 'email' | 'attendee_count' | 'marketing_opt_in'> & {
  checked_in: boolean
}

export type GrandOpeningContactMatch = {
  id: string
  email: string
  marketing_opt_in: boolean
}

const CAMPAIGN_FILTER = `or=(campaign_key.eq.${LUXOR_GRAND_OPENING.campaignKey},flow.eq.grand_opening_rsvp,source.eq.grand_opening_rsvp)`
const EVENT_START = new Date('2026-07-25T13:00:00-05:00')
const EVENT_END = new Date('2026-07-25T17:00:00-05:00')

export async function searchGrandOpeningRsvps(query: string, limit = 12) {
  const term = cleanName(query)
  if (term.length < 2) return []

  const inquiries = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=id,full_name,email,phone,attendee_count,marketing_opt_in&${CAMPAIGN_FILTER}&rsvp_status=eq.attending&full_name=ilike.${encodeURIComponent(`*${term}*`)}&order=full_name.asc&limit=${Math.min(Math.max(limit, 1), 20)}`,
  )
  const checkedIn = await listGrandOpeningAttendees()
  const checkedIds = new Set(checkedIn.map((attendee) => attendee.inquiry_id).filter(Boolean))

  return Promise.all(inquiries.map(async (inquiry) => ({
    ...inquiry,
    marketing_opt_in: inquiry.marketing_opt_in || Boolean(inquiry.email && await isMarketingMember(inquiry.email)),
    checked_in: checkedIds.has(inquiry.id),
  })))
}

export async function resolveGrandOpeningInvite(value: string) {
  const [inquiryId, signature] = value.split('.')
  if (!inquiryId || !signature || !isValidInviteSignature(inquiryId, signature)) return null

  const inquiries = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=id,full_name,email,phone,attendee_count,marketing_opt_in&${CAMPAIGN_FILTER}&rsvp_status=eq.attending&id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
  )
  if (!inquiries[0]) return null

  const existing = await findAttendeeByInquiryId(inquiryId)
  const inquiry = inquiries[0]
  const marketingOptIn = Boolean(inquiry.marketing_opt_in || (inquiry.email && await isMarketingMember(inquiry.email)))
  return {
    id: inquiry.id,
    full_name: inquiry.full_name,
    email: inquiry.email,
    attendee_count: inquiry.attendee_count,
    marketing_opt_in: marketingOptIn,
    checked_in: Boolean(existing),
  }
}

export async function resolveGrandOpeningContact(fullNameValue: string, phoneValue: string): Promise<GrandOpeningContactMatch | null> {
  const fullName = cleanName(fullNameValue)
  const phone = normalizePhone(phoneValue)
  if (fullName.split(' ').filter(Boolean).length < 2 || !phone) return null

  const inquiries = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=id,full_name,email,phone,marketing_opt_in&full_name=ilike.${encodeURIComponent(fullName)}&email=not.is.null&limit=10`,
  )
  const inquiry = inquiries.find((candidate) => sameName(candidate.full_name, fullName) && normalizePhone(candidate.phone) === phone)
  if (!inquiry?.email) return null

  return {
    id: inquiry.id,
    email: requireEmail(inquiry.email),
    marketing_opt_in: inquiry.marketing_opt_in || await isMarketingMember(inquiry.email),
  }
}

export async function checkInGrandOpeningRsvp(input: {
  inquiryId: string
  inviteToken?: string
  email: string
  phone?: string
  marketingOptIn?: boolean
  checkedInBy: 'self' | 'staff'
}) {
  if (input.checkedInBy === 'self') {
    const resolved = await resolveGrandOpeningInvite(input.inviteToken || '')
    if (!resolved || resolved.id !== input.inquiryId) throw new Error('This private check-in link is not valid.')
  }

  const inquiries = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&${CAMPAIGN_FILTER}&rsvp_status=eq.attending&id=eq.${encodeURIComponent(input.inquiryId)}&limit=1`,
  )
  const inquiry = inquiries[0]
  if (!inquiry) throw new Error('We could not find that Grand Opening RSVP.')

  const email = requireEmail(input.email)
  const phone = input.phone ? requirePhone(input.phone) : normalizePhone(inquiry.phone)
  const alreadyMarketing = Boolean(inquiry.email && await isMarketingMember(inquiry.email))
  const marketingOptIn = Boolean(input.marketingOptIn || inquiry.marketing_opt_in || alreadyMarketing)
  if (email !== inquiry.email?.toLowerCase() || phone !== normalizePhone(inquiry.phone) || marketingOptIn !== inquiry.marketing_opt_in) {
    await updateLuxorInquiry(inquiry.id, {
      email,
      phone,
      marketing_opt_in: marketingOptIn,
      metadata: {
        ...(inquiry.metadata || {}),
        raffleCheckIn: { contactUpdatedAt: new Date().toISOString(), contactPurpose: 'raffle_winner_contact' },
      },
    })
  }
  if (marketingOptIn) await addMarketingMember(email, inquiry.full_name, 'raffle_game')

  const existing = await findAttendeeByInquiryId(inquiry.id)
  if (existing) return existing

  const [created] = await supabaseRest<GrandOpeningAttendee[]>('luxor_grand_opening_attendees?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      campaign_key: LUXOR_GRAND_OPENING.campaignKey,
      inquiry_id: inquiry.id,
      full_name: inquiry.full_name,
      email,
      phone,
      attendee_type: 'rsvp',
      checked_in_by: input.checkedInBy,
      marketing_opt_in: marketingOptIn,
      metadata: { original_attendee_count: inquiry.attendee_count || inquiry.guest_count || 1 },
    }),
  })
  return created
}

export async function checkInGrandOpeningGuest(input: {
  fullName: string
  email: string
  phone: string
  invitedByInquiryId: string
  marketingOptIn?: boolean
  checkedInBy: 'self' | 'staff'
}) {
  const fullName = cleanName(input.fullName)
  if (fullName.split(' ').filter(Boolean).length < 2) throw new Error('Please enter the guest’s first and last name.')
  const email = requireEmail(input.email)
  const phone = requirePhone(input.phone)

  const hosts = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=id,full_name&${CAMPAIGN_FILTER}&rsvp_status=eq.attending&id=eq.${encodeURIComponent(input.invitedByInquiryId)}&limit=1`,
  )
  const host = hosts[0]
  if (!host) throw new Error('Please choose the person whose RSVP invited you.')

  const existingInquiry = await findExistingRaffleInquiry(fullName, email, phone)
  const alreadyMarketing = await isMarketingMember(email)
  const marketingOptIn = Boolean(input.marketingOptIn || alreadyMarketing || existingInquiry?.marketing_opt_in)
  const associationMetadata = {
    invitedByInquiryId: host.id,
    invitedByName: host.full_name,
    raffleContactPurpose: 'winner_contact',
    grandOpeningRsvpAssociation: true,
    raffleGameCheckedInAt: new Date().toISOString(),
    guestMarketingConsentCaptured: Boolean(input.marketingOptIn),
  }

  const inquiry = existingInquiry
    ? await updateLuxorInquiry(existingInquiry.id, {
        email,
        phone,
        campaign_key: LUXOR_GRAND_OPENING.campaignKey,
        rsvp_status: 'attending',
        marketing_opt_in: marketingOptIn,
        metadata: { ...(existingInquiry.metadata || {}), ...associationMetadata },
      })
    : await createLuxorInquiry({
        fullName,
        email,
        phone,
        source: 'raffle_game',
        flow: 'grand_opening_raffle_checkin',
        campaignKey: LUXOR_GRAND_OPENING.campaignKey,
        rsvpStatus: 'attending',
        attendeeCount: '1',
        marketingOptIn,
        pagePath: '/grand-opening-check-in',
        message: `Grand Opening guest invited by ${host.full_name}.`,
        metadata: associationMetadata,
      })

  if (!inquiry) throw new Error('We could not save this guest in the CRM.')
  if (marketingOptIn) await addMarketingMember(email, inquiry.full_name, 'raffle_game')

  const [created] = await supabaseRest<GrandOpeningAttendee[]>('luxor_grand_opening_attendees?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      campaign_key: LUXOR_GRAND_OPENING.campaignKey,
      inquiry_id: inquiry.id,
      invited_by_inquiry_id: host.id,
      full_name: inquiry.full_name,
      email,
      phone,
      attendee_type: 'guest',
      checked_in_by: input.checkedInBy,
      marketing_opt_in: marketingOptIn,
      metadata: { invited_by_name: host.full_name },
    }),
  })
  return created
}

export async function listGrandOpeningAttendees() {
  return supabaseRest<GrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?select=*&campaign_key=eq.${LUXOR_GRAND_OPENING.campaignKey}&order=checked_in_at.desc`,
  )
}

async function findAttendeeByInquiryId(inquiryId: string) {
  const attendees = await supabaseRest<GrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?select=*&campaign_key=eq.${LUXOR_GRAND_OPENING.campaignKey}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
  )
  return attendees[0] || null
}

export async function drawGrandOpeningWinner(prizeLabel?: string) {
  const attendees = await supabaseRest<GrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?select=*&campaign_key=eq.${LUXOR_GRAND_OPENING.campaignKey}&eligible=eq.true&winner_at=is.null&disqualified_at=is.null&order=checked_in_at.asc`,
  )
  if (!attendees.length) throw new Error('No checked-in guests remain in the raffle pool.')

  const winner = attendees[randomInt(attendees.length)]
  const [updated] = await supabaseRest<GrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?id=eq.${encodeURIComponent(winner.id)}&winner_at=is.null&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ winner_at: new Date().toISOString(), prize_label: cleanText(prizeLabel) || null, updated_at: new Date().toISOString() }),
    },
  )
  if (!updated) throw new Error('That guest was already drawn. Please draw again.')
  return updated
}

export async function skipGrandOpeningWinner(attendeeId: string, reason = 'Winner was not present when called') {
  const [updated] = await supabaseRest<GrandOpeningAttendee[]>(
    `luxor_grand_opening_attendees?id=eq.${encodeURIComponent(attendeeId)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        eligible: false,
        disqualified_at: new Date().toISOString(),
        disqualification_reason: cleanText(reason) || 'Winner was not present when called',
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!updated) throw new Error('Raffle guest not found.')
  return updated
}

export function createGrandOpeningInviteToken(inquiryId: string) {
  return `${inquiryId}.${inviteSignature(inquiryId)}`
}

export async function queueGrandOpeningCheckInLaunchEmails(now = new Date()) {
  if (now < EVENT_START || now > EVENT_END) return { queued: 0, jobIds: [] as string[], skipped: 'outside_event_window' as const }

  const inquiries = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&${CAMPAIGN_FILTER}&rsvp_status=eq.attending&email=not.is.null&order=created_at.asc`,
  )
  let queued = 0
  const jobIds: string[] = []
  const seenEmails = new Set<string>()

  for (const inquiry of inquiries) {
    const emailKey = inquiry.email!.trim().toLowerCase()
    if (seenEmails.has(emailKey)) continue
    seenEmails.add(emailKey)
    const inviteToken = createGrandOpeningInviteToken(inquiry.id)
    const checkInUrl = `https://www.luxoratlaspalmas.com/grand-opening-check-in?invite=${encodeURIComponent(inviteToken)}`
    const job = await createUniqueLuxorEmailJob({
      inquiryId: inquiry.id,
      jobType: 'grand_opening_check_in',
      recipientEmail: inquiry.email!,
      subject: 'You’re here — check in for the Luxor raffle',
      body: buildGrandOpeningCheckInEmailHtml(inquiry, checkInUrl),
      automationKey: `grand-opening-check-in:${inquiry.id}`,
      metadata: { campaign_key: LUXOR_GRAND_OPENING.campaignKey, check_in_url: checkInUrl },
    })
    if (job) {
      jobIds.push(job.id)
      if (job.status === 'queued') queued += 1
    }
  }

  return { queued, jobIds }
}

function buildGrandOpeningCheckInEmailHtml(inquiry: LuxorInquiry, checkInUrl: string) {
  const firstName = cleanName(inquiry.full_name).split(' ')[0] || 'Guest'
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head><body style="margin:0;background:#050505;padding:28px 12px;font-family:Arial,sans-serif;color:#f7efe3"><table role="presentation" style="width:100%;max-width:620px;margin:auto;background:#0a0807;border:1px solid #6d542a"><tr><td style="height:4px;background:#caa24c"></td></tr><tr><td style="padding:30px 42px;text-align:center;border-bottom:1px solid #2a2114"><div style="font-family:Georgia,serif;color:#caa24c;font-size:30px;letter-spacing:.18em">LUXOR</div><div style="margin-top:6px;font-size:8px;letter-spacing:.35em;color:#a98b54">AT LAS PALMAS EVENTS</div></td></tr><tr><td style="padding:46px 42px;text-align:center"><div style="color:#caa24c;font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase">Grand Opening raffle</div><h1 style="font-family:Georgia,serif;font-size:42px;line-height:1.05;margin:16px 0;color:#f7efe3">Welcome, ${escapeHtml(firstName)}.</h1><p style="font-size:15px;line-height:1.75;color:#d7c29a">Check in now to join tonight’s raffle. Only guests who are present and checked in can win.</p><p style="margin:30px 0"><a href="${escapeHtml(checkInUrl)}" style="display:inline-block;background:#caa24c;color:#17120c;text-decoration:none;padding:16px 26px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">Check in for the raffle</a></p><p style="font-size:12px;line-height:1.7;color:#9d8b6c">Bringing a guest? They can check in from the same page and connect themselves to your RSVP.</p></td></tr></table></body></html>`
}

function inviteSignature(inquiryId: string) {
  const secret = process.env.LUXOR_RAFFLE_LINK_SECRET || process.env.LUXOR_PORTAL_SESSION_SECRET
  if (!secret) throw new Error('Missing LUXOR_RAFFLE_LINK_SECRET or LUXOR_PORTAL_SESSION_SECRET.')
  return createHmac('sha256', secret).update(`grand-opening-raffle:${inquiryId}`).digest('base64url')
}

function isValidInviteSignature(inquiryId: string, provided: string) {
  try {
    const expected = Buffer.from(inviteSignature(inquiryId))
    const actual = Buffer.from(provided)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

function requirePhone(value: string) {
  const phone = normalizePhone(value)
  if (!phone) throw new Error('Please enter a valid mobile phone number with area code.')
  return phone
}

async function findExistingRaffleInquiry(fullName: string, email: string, phone: string) {
  const emailMatches = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=2`,
  )
  if (emailMatches.length) {
    const matchingEmail = emailMatches.find((candidate) =>
      sameName(candidate.full_name, fullName) || normalizePhone(candidate.phone) === phone,
    )
    if (!matchingEmail) throw new Error('That email is already connected to a different CRM contact. Please ask the check-in host for help.')
    return matchingEmail
  }

  const nameMatches = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&full_name=ilike.${encodeURIComponent(fullName)}&order=created_at.asc&limit=10`,
  )
  return nameMatches.find((candidate) => sameName(candidate.full_name, fullName) && normalizePhone(candidate.phone) === phone) || null
}

function requireEmail(value: string) {
  const email = cleanText(value).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
    throw new Error('Please enter a valid email address.')
  }
  return email
}

function sameName(left: string, right: string) {
  return cleanName(left).toLocaleLowerCase() === cleanName(right).toLocaleLowerCase()
}

function cleanName(value: unknown) {
  return cleanText(value).slice(0, 160)
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}
