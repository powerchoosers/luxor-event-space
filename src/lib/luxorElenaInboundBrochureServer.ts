import 'server-only'

import { supabaseRestStrict } from './supabaseRestServer'
import { queueBrochureDelivery } from './luxorBrochureDeliveryQueue'
import type { LuxorInquiry } from './luxorInquiryTypes'

type Call = { twilio_call_sid: string; inquiry_id: string | null; status: string; metadata: Record<string, unknown> }

export async function queueElenaInboundBrochureDelivery(input: { callSid: string; sessionId: string }) {
  const [row] = await supabaseRestStrict<Call[]>(
    `luxor_calls?select=twilio_call_sid,inquiry_id,status,metadata&twilio_call_sid=eq.${encodeURIComponent(input.callSid)}&limit=1`,
  )
  const capture = row?.metadata.inbound_capture as { confirmed?: boolean; matching_review_needed?: boolean; email?: string } | undefined
  if (!row || row.metadata.scope !== 'elena_live_inbound' || row.metadata.openai_session_id !== input.sessionId
    || row.metadata.accepted !== true || capture?.confirmed !== true || capture.matching_review_needed
    || !row.inquiry_id || !capture.email) {
    throw new Error('Save confirmed contact details with an email before queuing the package brochure.')
  }
  const [inquiry] = await supabaseRestStrict<LuxorInquiry[]>(`luxor_inquiries?select=*&id=eq.${encodeURIComponent(row.inquiry_id)}&limit=1`)
  if (!inquiry?.email) throw new Error('The lead email is missing. Save contact details first.')
  const existing = await supabaseRestStrict<Array<{ id: string }>>(
    `luxor_email_jobs?select=id&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&job_type=eq.booking_package&metadata->>flow_stage=eq.brochure_delivery&limit=1`,
  )
  if (existing.length) return { queued: true, duplicate: true, job_id: existing[0].id }
  const job = await queueBrochureDelivery({ ...inquiry, source: inquiry.source || 'inbound_phone' })
  await supabaseRestStrict(`luxor_calls?twilio_call_sid=eq.${encodeURIComponent(input.callSid)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      metadata: {
        ...row.metadata,
        brochure_queue_receipt: { job_id: job.id, queued_at: new Date().toISOString() },
      },
      updated_at: new Date().toISOString(),
    }),
  })
  return { queued: true, duplicate: false, job_id: job.id }
}