import 'server-only'

import { randomUUID } from 'node:crypto'
import { supabaseRestStrict } from './supabaseRestServer'
import { sendLuxorResendEmail } from './luxorResendMailServer'
import type { LuxorEmailJob } from './luxorInquiryTypes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Call = { twilio_call_sid: string; inquiry_id: string | null; direction: string; status: string; to_number: string; updated_at: string; metadata: Record<string, unknown> }
type Capture = { confirmed?: boolean; matching_review_needed?: boolean; inquiry_id?: string; nonce?: string; email?: string; full_name?: string; phone?: string }
type Receipt = { job_id?: string; recipient?: string; subject?: string; body?: string }
type Pending = { nonce: string; recipient: string; subject: string; body: string; contact_nonce: string; inquiry_updated_at: string; expires_at: string; question: string }

async function readCall(callSid: string, sessionId: string, active = true) {
  if (!/^CA[0-9a-f]{32}$/i.test(callSid) || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/.test(sessionId)) throw new Error('Invalid call.')
  const [row] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,inquiry_id,direction,status,to_number,updated_at,metadata&twilio_call_sid=eq.${callSid}&limit=1`)
  if (!row || row.direction !== 'inbound' || row.to_number === '+18176630380'
    || (active && !['ringing','in-progress'].includes(row.status)) || row.metadata.scope !== 'elena_live_inbound'
    || row.metadata.ingress_mode !== 'programmable_sip' || row.metadata.rehearsal_only !== false
    || row.metadata.accepted !== true || row.metadata.sip_answered !== true || row.metadata.openai_session_id !== sessionId) throw new Error('This call is not authorized.')
  return row
}

export async function prepareElenaCallEmail(input: { callSid: string; sessionId: string; subject: string; body: string }) {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!subject || subject.length > 150 || /[\r\n\x00-\x1f]/.test(subject) || !body || body.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) throw new Error('Keep the email subject and message concise and free of control characters.')
  const row = await readCall(input.callSid, input.sessionId)
  const capture = row.metadata.inbound_capture as Capture | undefined
  if (!capture?.confirmed || capture.matching_review_needed || !row.inquiry_id || capture.inquiry_id !== row.inquiry_id
    || !capture.email || !capture.full_name || !capture.phone || !UUID.test(capture.nonce || '')) throw new Error('Save the caller-confirmed email and contact before preparing a message.')
  const [inquiry] = await supabaseRestStrict<Array<{ email: string | null; full_name: string; phone: string | null; is_test: boolean; archived_at: string | null; updated_at: string }>>(`luxor_inquiries?select=email,full_name,phone,is_test,archived_at,updated_at&id=eq.${row.inquiry_id}&limit=1`)
  const normalizeName = (value: string) => value.trim().replace(/\s+/g,' ').toLowerCase()
  const normalizePhone = (value: string) => value.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'')
  if (!inquiry || inquiry.is_test || inquiry.archived_at || inquiry.email?.trim().toLowerCase() !== capture.email.trim().toLowerCase()
    || normalizeName(inquiry.full_name) !== normalizeName(capture.full_name) || normalizePhone(inquiry.phone || '') !== normalizePhone(capture.phone)
    || !normalizePhone(inquiry.phone || '') || !Number.isFinite(Date.parse(inquiry.updated_at))) throw new Error('The caller details need Arianna’s review before sending.')
  const prior = row.metadata.email_pending as Pending | undefined
  if (prior && prior.recipient === capture.email && prior.subject === subject && prior.body === body && prior.contact_nonce === capture.nonce && prior.inquiry_updated_at === inquiry.updated_at && Date.parse(prior.expires_at) > Date.now()) return prior
  const pending: Pending = { nonce: randomUUID(), recipient: capture.email, subject, body, contact_nonce: capture.nonce!, inquiry_updated_at: inquiry.updated_at, expires_at: new Date(Date.now()+180000).toISOString(),
    question: `May I send this email to ${capture.email}? The subject is: ${subject}. The message says: ${body}` }
  const changed = await supabaseRestStrict<Call[]>(`luxor_calls?twilio_call_sid=eq.${input.callSid}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.elena_live_inbound&metadata->>openai_session_id=eq.${encodeURIComponent(input.sessionId)}&select=twilio_call_sid`, {
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({metadata:{...row.metadata,email_pending:pending},updated_at:new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString()}),
  })
  if (!changed.length) throw new Error('The call changed. Read back the email again.')
  return pending
}

export async function confirmElenaCallEmail(input: { callSid: string; sessionId: string; nonce: string }) {
  if (!UUID.test(input.nonce)) throw new Error('An approved email readback is required.')
  const result = await supabaseRestStrict<{ queued: boolean; duplicate: boolean; job_id: string }>('rpc/luxor_queue_elena_call_email', { method:'POST',body:JSON.stringify({p_call_sid:input.callSid,p_session_id:input.sessionId,p_nonce:input.nonce}) })
  if (result.queued && UUID.test(result.job_id)) {
    try {
      const row = await readCall(input.callSid,input.sessionId)
      const [job] = await supabaseRestStrict<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${result.job_id}&inquiry_id=eq.${row.inquiry_id}&job_type=eq.elena_call_email&status=eq.queued&limit=1`)
      if (job) { const { processLuxorEmailJobs } = await import('./luxorEmailJobsServer'); await processLuxorEmailJobs([job],{markSending:true}) }
    } catch { /* Durable worker handles any still-queued job. */ }
  }
  return { queued: result.queued, duplicate: result.duplicate }
}

/** Only a queue job matching the exact caller-approved snapshot may be delivered. */
export async function deliverElenaCallEmail(job: LuxorEmailJob) {
  const callSid = String(job.metadata?.elena_call_sid || ''), nonce = String(job.metadata?.elena_email_nonce || '')
  if (!/^CA[0-9a-f]{32}$/i.test(callSid) || !UUID.test(nonce) || job.metadata?.caller_approved !== true || job.job_type !== 'elena_call_email') throw new Error('Caller-approved email snapshot is invalid.')
  const [row] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,inquiry_id,direction,status,to_number,updated_at,metadata&twilio_call_sid=eq.${callSid}&limit=1`)
  const receipts = row?.metadata.email_receipts as Record<string, Receipt> | undefined
  const snapshot = receipts?.[nonce]
  if (!row || row.metadata.scope !== 'elena_live_inbound' || row.inquiry_id !== job.inquiry_id || !snapshot
    || snapshot.job_id !== job.id || snapshot.recipient !== job.recipient_email || snapshot.subject !== job.subject || snapshot.body !== job.body) throw new Error('The approved email does not match its saved call snapshot.')
  const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  await sendLuxorResendEmail({to:job.recipient_email,subject:job.subject,content:`<p>${escape(job.body).replace(/\n/g,'<br />')}</p>`,text:job.body,from:'booking@luxoratlaspalmas.com',idempotencyKey:`email-job/${job.id}`,metadata:{elenaCall:true}})
  return {status:'sent' as const}
}

export async function getElenaCallEmailStatus(input: { callSid: string; sessionId: string; nonce: string }) {
  const row = await readCall(input.callSid,input.sessionId)
  if (!UUID.test(input.nonce)) throw new Error('A sent email reference is required.')
  const receipt = (row.metadata.email_receipts as Record<string, Receipt> | undefined)?.[input.nonce]
  if (!receipt?.job_id || !UUID.test(receipt.job_id)) return {status:'not_requested',message:'No email was queued for that request.'}
  const [jobs,mails] = await Promise.all([
    supabaseRestStrict<Array<{status:string}>>(`luxor_email_jobs?select=status&id=eq.${receipt.job_id}&inquiry_id=eq.${row.inquiry_id}&job_type=eq.elena_call_email&limit=1`),
    supabaseRestStrict<Array<{status:string}>>(`luxor_mail_messages?select=status&direction=eq.outgoing&metadata->>emailJobId=eq.${receipt.job_id}&order=created_at.desc&limit=1`),
  ])
  if (!jobs[0]) return {status:'unavailable',message:'The email status could not be verified.'}
  if (['bounced','failed','suppressed','complained'].includes(mails[0]?.status || '')) return {status:'failed',message:'The email could not be confirmed as delivered. Arianna can follow up.'}
  if (['delivered','opened','clicked'].includes(mails[0]?.status || '')) return {status:'delivered',message:'The email provider reports the message was delivered.'}
  if (['failed','cancelled'].includes(jobs[0].status)) return {status:'failed',message:'The email could not be confirmed as delivered. Arianna can follow up.'}
  if (jobs[0].status==='sent' || ['sent','delivery_delayed'].includes(mails[0]?.status || '')) return {status:'accepted',message:'The email was accepted by the provider; delivery is not confirmed yet.'}
  return {status:'pending',message:'The email is queued or sending; delivery is not confirmed yet.'}
}
