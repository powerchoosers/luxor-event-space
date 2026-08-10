import 'server-only'

import type { LuxorLeadEvent, LuxorPipelineStage, LuxorInquiryStatus } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

export type LuxorLeadEventCreateInput = {
  inquiry_id: string
  event_type: string
  target_date?: string | null
  guest_count?: number | null
  package_interest?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
  status?: LuxorInquiryStatus
  pipeline_stage?: LuxorPipelineStage
  is_primary?: boolean
}

export type LuxorLeadEventUpdateInput = Partial<Pick<LuxorLeadEvent,
  | 'event_type'
  | 'target_date'
  | 'guest_count'
  | 'package_interest'
  | 'status'
  | 'pipeline_stage'
  | 'notes'
  | 'metadata'
  | 'is_primary'
>>

export async function listLuxorLeadEventsByInquiry(inquiryId: string) {
  return supabaseRest<LuxorLeadEvent[]>(
    `luxor_lead_events?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=is_primary.desc,created_at.asc`,
  )
}

export async function getLuxorLeadEvent(id: string) {
  const [event] = await supabaseRest<LuxorLeadEvent[]>(
    `luxor_lead_events?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return event ?? null
}

export async function getLuxorLeadEventForInquiry(id: string, inquiryId: string) {
  const [event] = await supabaseRest<LuxorLeadEvent[]>(
    `luxor_lead_events?select=*&id=eq.${encodeURIComponent(id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
  )
  return event ?? null
}

export async function createLuxorLeadEvent(data: LuxorLeadEventCreateInput) {
  const [event] = await supabaseRest<LuxorLeadEvent[]>('luxor_lead_events?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: data.inquiry_id,
      event_type: data.event_type,
      target_date: data.target_date || null,
      guest_count: data.guest_count ?? null,
      package_interest: data.package_interest || null,
      notes: data.notes || null,
      metadata: data.metadata || {},
      status: data.status || 'new',
      pipeline_stage: data.pipeline_stage || 'inquiry',
      is_primary: data.is_primary ?? false,
    }),
  })

  return event
}

export async function updateLuxorLeadEvent(id: string, updates: LuxorLeadEventUpdateInput) {
  const [event] = await supabaseRest<LuxorLeadEvent[]>(
    `luxor_lead_events?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    },
  )

  return event ?? null
}

export async function getLuxorLeadEventPreference(portalEmail: string, inquiryId: string) {
  const [preference] = await supabaseRest<Array<{ lead_event_id: string }>>(
    `luxor_lead_event_preferences?select=lead_event_id&portal_email=eq.${encodeURIComponent(portalEmail.trim().toLowerCase())}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
  )
  return preference?.lead_event_id ?? null
}

export async function saveLuxorLeadEventPreference(portalEmail: string, inquiryId: string, leadEventId: string) {
  const [preference] = await supabaseRest<Array<{ lead_event_id: string }>>('luxor_lead_event_preferences?select=lead_event_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      portal_email: portalEmail.trim().toLowerCase(),
      inquiry_id: inquiryId,
      lead_event_id: leadEventId,
      updated_at: new Date().toISOString(),
    }),
  })
  return preference?.lead_event_id ?? leadEventId
}
