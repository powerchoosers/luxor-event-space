import 'server-only'
import { supabaseRestStrict } from './supabaseRestServer'

type Job = { id?: string; job_type: string; custom_workflow_step_run_id: string | null; automation_enrollment_id?: string | null; automation_key?: string | null; signature_request_id?: string | null; tour_revision_id?: string | null; tour_notice?: string | null; calendar_method?: string | null; metadata?: Record<string, unknown> | null }
export type MessageWorkflowMatch = { name: string; href: string | null; note: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MESSAGE_SID = /^SM[0-9a-f]{32}$/i
const PROPOSAL_BREAKDOWN_MATCH: MessageWorkflowMatch = { name: 'Staff-requested proposal breakdown', href: '/portal/marketing/custom-workflows/system-proposal-breakdown', note: 'Recorded package comparison email; pricing tables stay in the saved snapshot.' }
const SYSTEM: Record<string, MessageWorkflowMatch> = {
  inquiry_confirmation: { name: 'Inquiry confirmation text', href: '/portal/marketing/custom-workflows/system-inquiry-confirmation', note: 'System-managed inquiry text.' },
  event_reminder: { name: 'Event reminder text', href: '/portal/marketing/custom-workflows/system-event-reminder', note: 'System-managed event reminder text.' },
  payment_confirmation: { name: 'Payment confirmation text', href: '/portal/marketing/custom-workflows/system-payment-confirmation', note: 'System-managed payment text.' },
}
function systemMatch(row: Job, channel: 'text' | 'email'): MessageWorkflowMatch | null {
  if (channel === 'email' && row.job_type === 'transactional_notice') {
    const notice = row.metadata?.transactionalNotice
    if (notice && typeof notice === 'object' && !Array.isArray(notice)) {
      const snapshot = notice as Record<string, unknown>
      if (snapshot.kind === 'paid_invoice' && typeof snapshot.key === 'string' && /^paid_invoice\/[a-zA-Z0-9_-]{1,200}$/.test(snapshot.key)) return { name: 'Paid-invoice confirmation email', href: '/portal/marketing/custom-workflows/system-paid-invoice-email', note: 'Recorded Stripe paid-invoice notice.' }
      if (snapshot.kind === 'payment_receipt' && typeof snapshot.key === 'string' && snapshot.key.startsWith('payment_receipt/') && UUID.test(snapshot.key.slice('payment_receipt/'.length))) return { name: 'Staff-requested payment receipt', href: '/portal/marketing/custom-workflows/system-payment-receipt', note: 'Recorded staff-reviewed payment receipt.' }
      if (snapshot.kind === 'agreement_client' && typeof snapshot.key === 'string' && snapshot.key.startsWith('agreement_client/') && UUID.test(snapshot.key.slice('agreement_client/'.length))) return { name: 'Executed agreement email', href: '/portal/marketing/custom-workflows/system-agreement-client', note: 'Recorded client copy of the executed agreement.' }
      if (snapshot.kind === 'agreement_owner' && typeof snapshot.key === 'string' && snapshot.key.startsWith('agreement_owner/') && UUID.test(snapshot.key.slice('agreement_owner/'.length))) return { name: 'Executed agreement owner audit', href: '/portal/marketing/custom-workflows/system-agreement-owner', note: 'Recorded internal owner copy with audit attachment.' }
    }
    return null
  }
  if (channel === 'email' && row.job_type === 'final_payment_request' && row.metadata?.payment_method === 'zelle' && typeof row.metadata.automation_key === 'string') {
    const parts = row.metadata.automation_key.split(':')
    if (parts.length === 3 && parts[0] === 'zelle-instructions' && UUID.test(parts[1]) && ['deposit', 'full'].includes(parts[2]) && row.metadata.payment_amount_kind === parts[2]) return { name: 'Zelle payment instructions', href: '/portal/marketing/custom-workflows/system-zelle-instructions', note: 'Recorded client-selected Zelle instructions.' }
    return null
  }
  if (channel === 'email' && row.job_type === 'layout_review' && row.metadata?.kind === 'planner_presentation_invitation' && typeof row.metadata.planner_presentation_id === 'string' && UUID.test(row.metadata.planner_presentation_id)) return { name: 'Planner presentation invitation', href: '/portal/marketing/custom-workflows/system-planner-invitation', note: 'Recorded private planner invitation; sent bodies may be removed for privacy.' }
  if (channel === 'email' && row.job_type === 'layout_review' && row.metadata?.kind === 'planner_presentation_verification' && typeof row.metadata.planner_presentation_id === 'string' && UUID.test(row.metadata.planner_presentation_id)) return { name: 'Planner verification code', href: '/portal/marketing/custom-workflows/system-planner-verification', note: 'Recorded verification code email; bodies are removed after send and codes are not shown in lookup results.' }
  if (channel === 'email' && row.job_type === 'layout_review' && typeof row.metadata?.layout_review_id === 'string' && UUID.test(row.metadata.layout_review_id)) return { name: 'Layout review invitation', href: '/portal/marketing/custom-workflows/system-layout-review-email', note: 'Recorded private layout review invitation.' }
  if (channel === 'email' && row.job_type === 'contract_signature' && row.metadata?.agreement_delivery === true && row.signature_request_id && UUID.test(row.signature_request_id)) {
    return { name: 'Event Agreement package', href: '/portal/marketing/custom-workflows/system-agreement-package', note: 'Recorded agreement package with signing link and PDF attachments.' }
  }
  if (channel === 'email' && row.job_type === 'calendar_invitation' && row.calendar_method === 'CANCEL') {
    return { name: 'Calendar cancellation', href: '/portal/marketing/custom-workflows/system-calendar-messages?step=cancellation', note: 'Recorded calendar cancellation with iCalendar attachment.' }
  }
  if (channel === 'email' && row.job_type === 'calendar_invitation' && row.calendar_method === 'REQUEST' && row.metadata?.delivery !== 'branded_confirmation') {
    return { name: 'Calendar update', href: '/portal/marketing/custom-workflows/system-calendar-messages?step=update', note: 'Recorded unbranded calendar update; branded tour invitations are separate.' }
  }
  if (channel === 'email' && row.metadata?.manual === true && row.job_type === 'unpaid_invoice_reminder') return { name: 'Staff-requested invoice reminder', href: '/portal/marketing/custom-workflows/system-manual-invoice-reminder?step=unpaid_invoice', note: 'Recorded staff-requested payment reminder.' }
  if (channel === 'email' && row.metadata?.manual === true && row.job_type === 'final_payment_reminder' && typeof row.metadata?.milestone !== 'string') return { name: 'Staff-requested final payment reminder', href: '/portal/marketing/custom-workflows/system-manual-invoice-reminder?step=final_payment', note: 'Recorded staff-requested final-balance reminder.' }
  if (channel === 'email' && row.job_type === 'tour_no_show_reschedule' && row.metadata?.manual === true) return { name: 'Tour no-show reschedule email', href: '/portal/marketing/custom-workflows/system-tour-no-show-email', note: 'Recorded staff-requested tour email.' }
  if (channel === 'email' && row.job_type === 'proposal_payment_reminder' && row.metadata?.payment_request_reminder === true && row.metadata?.offer_reminder !== true && typeof row.metadata?.invoice_id === 'string' && UUID.test(row.metadata.invoice_id)) return { name: 'Payment request reminder', href: '/portal/marketing/custom-workflows/system-payment-request-email', note: 'Recorded payment request reminder.' }
  if (channel === 'email' && ['proposal_view_reminder', 'proposal_payment_reminder'].includes(row.job_type) && row.metadata?.offer_reminder === true && typeof row.metadata?.invoice_id === 'string' && UUID.test(row.metadata.invoice_id)) return { name: 'Proposal offer reminder', href: '/portal/marketing/custom-workflows/system-offer-email', note: 'Recorded proposal offer reminder.' }
  if (channel === 'email' && ['contract_view_reminder', 'contract_signature_reminder'].includes(row.job_type) && row.signature_request_id && UUID.test(row.signature_request_id)) {
    const step = row.job_type === 'contract_view_reminder' ? 'view' : 'sign'
    return { name: step === 'view' ? 'Agreement review reminder' : 'Agreement signature reminder', href: `/portal/marketing/custom-workflows/system-agreement-emails?step=${step}`, note: 'Recorded agreement reminder.' }
  }
  if (channel === 'email' && ['event_details_reminder', 'event_day_reminder', 'post_event_follow_up'].includes(row.job_type)) {
    const step = row.job_type === 'event_details_reminder' ? 'details' : row.job_type === 'event_day_reminder' ? 'day' : 'thanks'
    return { name: step === 'details' ? 'Final event details email' : step === 'day' ? 'Event reminder email' : 'Post-event thank-you email', href: `/portal/marketing/custom-workflows/system-event-emails?step=${step}`, note: 'Recorded booking event email.' }
  }
  if (channel === 'email' && row.job_type === 'marketing_campaign' && row.metadata?.source === 'inquiry_acknowledgment') return { name: 'Inquiry acknowledgment email', href: '/portal/marketing/custom-workflows/system-inquiry-email', note: 'System-managed inquiry receipt.' }
  if (channel === 'email' && row.job_type === 'marketing_campaign' && row.metadata?.source === 'newsletter_confirmation') return { name: 'Newsletter confirmation email', href: '/portal/marketing/custom-workflows/system-newsletter-email', note: 'Recorded newsletter signup receipt.' }
  if (channel === 'email' && row.job_type === 'tour_confirmation' && !row.tour_revision_id && row.metadata?.source === 'tour_request_received') return { name: 'Tour request received email', href: '/portal/marketing/custom-workflows/system-tour-request-email', note: 'Recorded tour request receipt; this is not a scheduled tour confirmation.' }
  if (channel === 'email' && row.job_type === 'booking_package' && row.metadata?.flow_stage === 'brochure_delivery') return { name: 'Brochure delivery email', href: '/portal/marketing/custom-workflows/system-brochure', note: 'Recorded brochure delivery.' }
  if (channel === 'email' && (row.job_type === 'tour_confirmation' || row.job_type === 'tour_reminder')) {
    const validNotice = row.job_type === 'tour_confirmation' ? row.tour_notice === 'confirmation' : row.tour_notice === 'reminder_24' || row.tour_notice === 'reminder_2'
    if (!row.tour_revision_id || !UUID.test(row.tour_revision_id) || !validNotice) return null
    return { name: row.tour_notice === 'confirmation' ? 'Tour confirmation email' : row.tour_notice === 'reminder_24' ? 'Tour reminder email (24 hours)' : 'Tour reminder email (2 hours)', href: `/portal/marketing/custom-workflows/system-tour-emails?step=${row.tour_notice}`, note: 'Calendar-managed tour email.' }
  }
  if (channel === 'text' && (row.job_type === 'tour_confirmation' || row.job_type === 'tour_reminder')) return { name: row.job_type === 'tour_confirmation' ? 'Tour confirmation text' : 'Tour reminder text', href: `/portal/marketing/custom-workflows/system-tour-texts?step=${row.job_type === 'tour_confirmation' ? 'confirmation' : 'reminder'}`, note: 'System-managed tour text.' }
  if (channel === 'text' && row.job_type === 'invoice_due_reminder') {
    if (row.automation_key?.startsWith('invoice_due:')) return { name: 'Invoice due reminder text', href: '/portal/marketing/custom-workflows/system-invoice-reminders?step=due', note: 'Scheduled invoice reminder.' }
    if (row.automation_key?.startsWith('invoice_payment_request:')) return { name: 'Payment request follow-up text', href: '/portal/marketing/custom-workflows/system-invoice-reminders?step=payment-request', note: 'System-managed payment request follow-up.' }
    return null
  }
  if (channel === 'text' && row.job_type === 'invoice_overdue_reminder') {
    return row.automation_key?.startsWith('invoice_overdue:') ? { name: 'Overdue invoice reminder text', href: '/portal/marketing/custom-workflows/system-invoice-reminders?step=overdue', note: 'Scheduled invoice reminder.' } : null
  }
  if (channel === 'email' && ['final_payment_request', 'final_payment_reminder', 'installment_payment_reminder'].includes(row.job_type)) {
    const milestones: Record<string, string[]> = {
      final_payment_request: ['payment_request'],
      final_payment_reminder: ['14_days', '7_days', 'due_date'],
      installment_payment_reminder: ['installment_7_days_before', 'installment_1_day_overdue'],
    }
    if (typeof row.metadata?.milestone !== 'string' || !milestones[row.job_type].includes(row.metadata.milestone)) return null
    if (row.job_type === 'installment_payment_reminder') return { name: row.metadata.milestone === 'installment_7_days_before' ? 'Installment reminder (seven days before due)' : 'Installment reminder (one day overdue)', href: `/portal/marketing/custom-workflows/system-installment-emails?step=${row.metadata.milestone === 'installment_7_days_before' ? 'due' : 'overdue'}`, note: 'Scheduled installment payment reminder.' }
    return { name: 'Final payment reminder', href: `/portal/marketing/custom-workflows/system-final-payment-emails?step=${row.metadata.milestone}`, note: 'Scheduled final-balance reminder.' }
  }
  return channel === 'text' ? SYSTEM[row.job_type] || null : null
}
const DIRECT_TEXTS: Record<string, MessageWorkflowMatch> = {
  missed_call: { name: 'Missed-call reply', href: '/portal/marketing/custom-workflows/system-phone-missed_call', note: 'System-managed phone automation.' },
  inbound_acknowledgment: { name: 'Incoming-text acknowledgment', href: '/portal/marketing/custom-workflows/system-phone-inbound_acknowledgment', note: 'System-managed phone automation.' },
}

/** Search recorded job bodies, email subjects and direct texts. Unknown origins are never guessed. */
export async function findMessageWorkflows(phrase: string, channel: 'text' | 'email') {
  const query = phrase.trim()
  if (query.length < 12 || query.length > 200 || /[%_*\\\r\n]/.test(query)) throw new Error('Use a distinctive excerpt of 12 to 200 characters without wildcard characters.')
  const table = channel === 'text' ? 'luxor_text_jobs' : 'luxor_email_jobs'
  const fields = channel === 'text' ? 'id,job_type,custom_workflow_step_run_id,automation_key' : 'id,job_type,custom_workflow_step_run_id,automation_enrollment_id,signature_request_id,tour_revision_id,tour_notice,calendar_method,metadata'
  const [bodyRows, subjectRows, breakdownSubjectRows, breakdownBodyRows] = await Promise.all([
    supabaseRestStrict<Job[]>(`${table}?select=${fields}&body=ilike.*${encodeURIComponent(query)}*&order=created_at.desc&limit=51`),
    channel === 'email' ? supabaseRestStrict<Job[]>(`${table}?select=${fields}&subject=ilike.*${encodeURIComponent(query)}*&order=created_at.desc&limit=51`) : Promise.resolve([] as Job[]),
    channel === 'email' ? supabaseRestStrict<Array<{ id: string }>>(`luxor_proposal_breakdowns?select=id&subject=ilike.*${encodeURIComponent(query)}*&delivery_state=eq.sent&order=created_at.desc&limit=51`) : Promise.resolve([]),
    channel === 'email' ? supabaseRestStrict<Array<{ id: string }>>(`luxor_proposal_breakdowns?select=id&html=ilike.*${encodeURIComponent(query)}*&delivery_state=eq.sent&order=created_at.desc&limit=51`) : Promise.resolve([]),
  ])
  const breakdownRows = [...new Map([...breakdownSubjectRows, ...breakdownBodyRows].map((row) => [row.id, row])).values()]
  const seen = new Set<string>()
  const rows = [...bodyRows, ...subjectRows].filter((row) => {
    if (!row.id) return true
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
  let capped = bodyRows.length > 50 || subjectRows.length > 50 || breakdownSubjectRows.length > 50 || breakdownBodyRows.length > 50 || breakdownRows.length > 50 || rows.length > 50
  const candidates = rows.slice(0, 50)
  const matches: MessageWorkflowMatch[] = []
  let missingLinks = false
  const runIds = [...new Set(candidates.map((row) => row.custom_workflow_step_run_id).filter((id): id is string => Boolean(id && UUID.test(id))))]
  const enrollmentIds = [...new Set(candidates.map((row) => row.automation_enrollment_id).filter((id): id is string => Boolean(id && UUID.test(id))))]
  if (runIds.length) {
    const runs = await supabaseRestStrict<Array<{ enrollment_id: string }>>(`luxor_custom_workflow_step_runs?select=enrollment_id&id=in.(${runIds.join(',')})`)
    if (runs.length !== runIds.length || runs.some((run) => !UUID.test(run.enrollment_id))) missingLinks = true
    const ids = [...new Set(runs.map((run) => run.enrollment_id).filter((id) => UUID.test(id)))]
    const enrollments = ids.length ? await supabaseRestStrict<Array<{ workflow_id: string }>>(`luxor_custom_workflow_enrollments?select=workflow_id&id=in.(${ids.join(',')})`) : []
    if (enrollments.length !== ids.length || enrollments.some((item) => !UUID.test(item.workflow_id))) missingLinks = true
    const workflowIds = [...new Set(enrollments.map((item) => item.workflow_id).filter((id) => UUID.test(id)))]
    const workflows = workflowIds.length ? await supabaseRestStrict<Array<{ id: string; name: string }>>(`luxor_custom_workflows?select=id,name&id=in.(${workflowIds.join(',')})`) : []
    if (workflows.length !== workflowIds.length) missingLinks = true
    matches.push(...workflows.map((workflow) => ({ name: workflow.name, href: `/portal/marketing/custom-workflows/${workflow.id}`, note: 'Recorded custom workflow message.' })))
  }
  if (enrollmentIds.length) {
    const enrollments = await supabaseRestStrict<Array<{ automation_key: string }>>(`luxor_follow_up_enrollments?select=automation_key&id=in.(${enrollmentIds.join(',')})`)
    if (enrollments.length !== enrollmentIds.length || enrollments.some((item) => item.automation_key !== 'brochure_lead')) missingLinks = true
    if (enrollments.some((item) => item.automation_key === 'brochure_lead')) matches.push({ name: 'Brochure Lead Follow-Up', href: '/portal/marketing/custom-workflows/system-brochure', note: 'Recorded brochure follow-up email.' })
  }
  for (const row of candidates) {
    if (!row.custom_workflow_step_run_id && !row.automation_enrollment_id) {
      const match = systemMatch(row, channel)
      if (match) matches.push(match)
    }
  }
  if (channel === 'email' && breakdownRows.length) matches.push(PROPOSAL_BREAKDOWN_MATCH)
  let directCount = 0
  if (channel === 'text') {
    // These two automations send directly rather than creating a text job. Match
    // the actual outbound message to the claimed automation event by provider SID.
    const messages = await supabaseRestStrict<Array<{ twilio_message_sid: string }>>(`luxor_messages?select=twilio_message_sid&direction=eq.outbound&owner_email=eq.luxor-automation&body=ilike.*${encodeURIComponent(query)}*&order=created_at.desc&limit=51`)
    capped ||= messages.length > 50
    const selected = messages.slice(0, 50)
    directCount = selected.length
    const sids = [...new Set(selected.map((message) => message.twilio_message_sid).filter((sid) => MESSAGE_SID.test(sid)))]
    if (sids.length !== selected.length) missingLinks = true
    const events = sids.length ? await supabaseRestStrict<Array<{ twilio_message_sid: string; automation_type: string }>>(`luxor_text_automation_events?select=twilio_message_sid,automation_type&twilio_message_sid=in.(${sids.join(',')})`) : []
    const linked = new Set(events.map((event) => event.twilio_message_sid))
    if (sids.some((sid) => !linked.has(sid))) missingLinks = true
    for (const event of events) {
      if (DIRECT_TEXTS[event.automation_type]) matches.push(DIRECT_TEXTS[event.automation_type])
      else missingLinks = true
    }
  }
  const unique = [...new Map(matches.map((item) => [`${item.name}:${item.href}`, item])).values()]
  const unresolved = missingLinks || candidates.some((row) => (row.custom_workflow_step_run_id && !UUID.test(row.custom_workflow_step_run_id)) || (row.automation_enrollment_id && !UUID.test(row.automation_enrollment_id)) || (!row.custom_workflow_step_run_id && !row.automation_enrollment_id && !systemMatch(row, channel)))
    || (channel === 'email' && breakdownRows.some((row) => !row.id || !UUID.test(row.id)))
  return { matches: unique, searched: candidates.length + directCount + breakdownRows.length, capped, unresolved, channel }
}
