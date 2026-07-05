import 'server-only'

import { compactText, LuxorInquiry, LuxorInquiryInput, LuxorPipelineStage, LuxorInquiryStatus, parseGuestCount } from './luxorInquiryTypes'
import { buildTourEmail, createLuxorEmailJob, createPublicToken } from './luxorEmailJobsServer'
import { supabaseRest } from './supabaseRestServer'
import {
  applyTourSlotToInquiry,
  assertTourSlotCanBeBooked,
  getLuxorTourSlot,
  reserveLuxorTourSlot,
} from './luxorTourSlotsServer'

export function normalizeInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const fullName = compactText(input.fullName)
  const email = compactText(input.email).toLowerCase()
  const phone = compactText(input.phone)
  const message = typeof input.message === 'string' ? input.message.trim() : ''

  if (!fullName) {
    throw new Error('Please add your full name.')
  }

  if (!email && !phone) {
    throw new Error('Please add either an email or phone number so Luxor can follow up.')
  }

  return {
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    event_type: compactText(input.eventType) || null,
    target_date: compactText(input.targetDate) || null,
    guest_count: parseGuestCount(input.guestCount),
    preferred_tour_date: compactText(input.preferredTourDate) || null,
    preferred_tour_time: compactText(input.preferredTourTime) || null,
    package_interest: compactText(input.packageInterest) || null,
    message: message || null,
    source: compactText(input.source) || 'website',
    flow: compactText(input.flow) || 'tour_request',
    page_path: compactText(input.pagePath) || null,
    referrer: compactText(input.referrer) || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    metadata: input.metadata ?? {},
  }
}

export async function createLuxorInquiry(input: LuxorInquiryInput, userAgent?: string) {
  const row = normalizeInquiry(input, userAgent)
  const selectedTourSlotId =
    typeof row.metadata?.selectedTourSlotId === 'string' ? row.metadata.selectedTourSlotId : null

  const selectedTourSlot = selectedTourSlotId ? await getLuxorTourSlot(selectedTourSlotId) : null

  if (selectedTourSlotId) {
    assertTourSlotCanBeBooked(selectedTourSlot)
    applyTourSlotToInquiry(row, selectedTourSlot!)
  }

  const status = row.preferred_tour_date || row.preferred_tour_time ? 'tour_requested' : 'new'
  const pipelineStage: LuxorPipelineStage = status === 'tour_requested' ? 'tour' : 'inquiry'

  const [created] = await supabaseRest<LuxorInquiry[]>('luxor_inquiries?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...row,
      status,
      pipeline_stage: pipelineStage,
      tour_attendance_status: status === 'tour_requested' ? 'pending' : null,
    }),
  })

  if (created && selectedTourSlot) {
    await reserveLuxorTourSlot(selectedTourSlot)
  }

  if (created?.email && created.preferred_tour_date) {
    try {
      const token = created.tour_response_token || createPublicToken()
      await updateLuxorInquiry(created.id, { tour_response_token: token })

      const confirmation = buildTourEmail('tour_confirmation', created, token)
      await createLuxorEmailJob({
        inquiryId: created.id,
        jobType: 'tour_confirmation',
        recipientEmail: created.email,
        subject: confirmation.subject,
        body: confirmation.body,
      })

      const reminderAt = getTourReminderTime(created.preferred_tour_date)
      if (reminderAt) {
        const reminder = buildTourEmail('tour_reminder', created, token)
        await createLuxorEmailJob({
          inquiryId: created.id,
          jobType: 'tour_reminder',
          recipientEmail: created.email,
          subject: reminder.subject,
          body: reminder.body,
          scheduledFor: reminderAt,
        })
      }
    } catch (emailError) {
      console.error('Luxor tour email queue failed:', emailError)
    }
  }

  return created
}

export async function listLuxorInquiries(limit = 50) {
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

export async function listLuxorTourRequests(limit = 100) {
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
  if (status === 'proposal_sent') return 'proposal_sent'
  if (status === 'booked') return 'book_reserve'
  if (status === 'closed_lost') return 'closed_lost'
  return 'inquiry'
}

function getTourReminderTime(tourDate: string) {
  const date = new Date(`${tourDate}T10:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() - 1)
  return date.toISOString()
}
