import 'server-only'

import type { LuxorInquiry, LuxorTask } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { createLuxorFollowUpEmailJob } from './luxorEmailJobsServer'

export type LuxorFollowUpAutomation = {
  automation_key: string
  name: string
  enabled: boolean
  send_approved: boolean
  timing_configured: boolean
  timezone: string | null
  updated_at: string
}

export type LuxorFollowUpTemplate = {
  id: string
  automation_key: string
  step_key: string
  sort_order: number
  channel: 'email' | 'phone' | 'sms'
  delay_days: number
  name: string
  subject: string | null
  body: string | null
  cta_text: string | null
  cta_url: string | null
  secondary_cta_text: string | null
  secondary_cta_url: string | null
  active: boolean
  uses_existing_delivery: boolean
  updated_at: string
}

export type LuxorFollowUpEnrollment = {
  id: string
  inquiry_id: string
  automation_key: string
  status: 'active' | 'paused' | 'completed' | 'stopped'
  started_at: string
  response_received_at: string | null
  ended_reason: string | null
  nurture_eligible_at: string | null
  marketing_consent_at_enrollment: boolean
  unsubscribe_token: string
}

export type LuxorFollowUpAction = {
  id: string
  enrollment_id: string
  template_id: string | null
  step_key: string
  channel: 'email' | 'phone' | 'sms'
  scheduled_at: string
  status: string
  email_job_id: string | null
  task_id: string | null
  outcome: string | null
  completed_at: string | null
}

export async function getLuxorFollowUpSetup() {
  const [automations, templates] = await Promise.all([
    supabaseRest<LuxorFollowUpAutomation[]>('luxor_follow_up_automations?select=*&automation_key=eq.brochure_lead&limit=1'),
    supabaseRest<LuxorFollowUpTemplate[]>('luxor_follow_up_templates?select=*&automation_key=eq.brochure_lead&order=sort_order.asc'),
  ])
  return { automation: automations[0] ?? null, templates }
}

export async function isLuxorBrochureFollowUpSendingEnabled() {
  // The release environment variable is a server-only hard gate. Neither
  // template activation nor ordinary portal edits can override it.
  if (process.env.LUXOR_FOLLOW_UP_SENDS_ENABLED !== 'true') return false
  const { automation, templates } = await getLuxorFollowUpSetup()
  return Boolean(
    automation?.enabled && automation.send_approved && automation.timing_configured &&
    automation.timezone === 'America/Chicago' && templates.length === 9 &&
    templates.every((template) => template.active),
  )
}

const EDITABLE_TEMPLATE_FIELDS = new Set([
  'name', 'subject', 'body', 'cta_text', 'cta_url', 'secondary_cta_text', 'secondary_cta_url', 'delay_days', 'active',
])

export async function updateLuxorFollowUpTemplate(id: string, input: Record<string, unknown>) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid follow-up template id.')
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!EDITABLE_TEMPLATE_FIELDS.has(key)) continue
    if (key === 'delay_days') {
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 365) throw new Error('Timing must be a whole number of days from 0 to 365.')
      updates[key] = value
    } else if (key === 'active') {
      updates[key] = Boolean(value)
    } else if (value === null || typeof value === 'string') {
      const text = typeof value === 'string' ? value.trim() : null
      if (key.endsWith('_url') && text && !text.startsWith('/') && !/^https:\/\/www\.luxoratlaspalmas\.com(?:\/|$)/i.test(text)) {
        throw new Error('CTA links must use a Luxor page or the canonical Luxor website.')
      }
      if (text && text.length > (key === 'body' ? 12000 : 500)) throw new Error(`${key} is too long.`)
      updates[key] = text
    }
  }
  if (!Object.keys(updates).length) throw new Error('There are no editable template fields to save.')
  updates.updated_at = new Date().toISOString()
  const [template] = await supabaseRest<LuxorFollowUpTemplate[]>(
    `luxor_follow_up_templates?select=*&id=eq.${encodeURIComponent(id)}&automation_key=eq.brochure_lead`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(updates) },
  )
  if (!template) throw new Error('Follow-up template not found.')
  return template
}

function addElapsedDays(startedAt: string, delayDays: number) {
  return new Date(new Date(startedAt).getTime() + delayDays * 24 * 60 * 60 * 1000).toISOString()
}

export function scheduleBrochureFollowUpOffsets(startedAt: string, steps: Array<{ step_key: string; delay_days: number }>) {
  return steps.map((step) => ({ step_key: step.step_key, scheduled_at: addElapsedDays(startedAt, step.delay_days) }))
}

export async function enrollLuxorBrochureLead(inquiry: LuxorInquiry, existingBrochureJobId?: string | null) {
  if (!await isLuxorBrochureFollowUpSendingEnabled()) return null
  if (inquiry.flow !== 'brochure_lead' && inquiry.source !== 'homepage_brochure') return null
  if (!inquiry.marketing_opt_in || !inquiry.email) return null
  if (inquiry.status === 'booked' || inquiry.status === 'tour_confirmed' || inquiry.status === 'closed_lost') return null
  if (inquiry.follow_up_disposition) return null

  const { automation, templates } = await getLuxorFollowUpSetup()
  if (!automation || templates.length !== 9) return null
  let [enrollment] = await supabaseRest<LuxorFollowUpEnrollment[]>(
    'luxor_follow_up_enrollments?on_conflict=inquiry_id,automation_key&select=*',
    {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        inquiry_id: inquiry.id,
        automation_key: 'brochure_lead',
        status: 'active',
        started_at: new Date().toISOString(),
        marketing_consent_at_enrollment: true,
      }),
    },
  )
  if (!enrollment) {
    ;[enrollment] = await supabaseRest<LuxorFollowUpEnrollment[]>(
      `luxor_follow_up_enrollments?select=*&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&automation_key=eq.brochure_lead&limit=1`,
    )
  }
  if (!enrollment) return null

  const steps = scheduleBrochureFollowUpOffsets(enrollment.started_at, templates)
  const stepTimes = new Map(steps.map((step) => [step.step_key, step.scheduled_at]))
  let brochureJobId = existingBrochureJobId || null
  if (!brochureJobId) {
    const [job] = await supabaseRest<Array<{ id: string }>>(
      `luxor_email_jobs?select=id&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&job_type=eq.booking_package&metadata->>flow_stage=eq.brochure_delivery&order=created_at.asc&limit=1`,
    )
    brochureJobId = job?.id ?? null
  }

  for (const template of templates) {
    const scheduledAt = stepTimes.get(template.step_key)!
    if (template.step_key === 'email_1') {
      await supabaseRest('luxor_follow_up_actions?on_conflict=enrollment_id,step_key', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ enrollment_id: enrollment.id, template_id: template.id, step_key: template.step_key, channel: template.channel, scheduled_at: scheduledAt, status: 'existing_delivery', email_job_id: brochureJobId }),
      })
      continue
    }

    if (template.channel === 'email' && template.active) {
      let [job] = await createLuxorFollowUpEmailJob(inquiry, enrollment, template, scheduledAt)
      if (!job) {
        ;[job] = await supabaseRest<Array<{ id: string }>>(`luxor_email_jobs?select=id&automation_enrollment_id=eq.${encodeURIComponent(enrollment.id)}&automation_step_key=eq.${encodeURIComponent(template.step_key)}&limit=1`)
      }
      await supabaseRest('luxor_follow_up_actions?on_conflict=enrollment_id,step_key', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ enrollment_id: enrollment.id, template_id: template.id, step_key: template.step_key, channel: 'email', scheduled_at: scheduledAt, status: 'email_queued', email_job_id: job?.id ?? null }),
      })
    } else if (template.channel === 'phone' && template.active) {
      if (!inquiry.phone) {
        await supabaseRest('luxor_follow_up_actions?on_conflict=enrollment_id,step_key', {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ enrollment_id: enrollment.id, template_id: template.id, step_key: template.step_key, channel: 'phone', scheduled_at: scheduledAt, status: 'skipped', outcome: 'No phone number on the lead record.' }),
        })
        continue
      }
      const [task] = await supabaseRest<LuxorTask[]>(
        'luxor_tasks?on_conflict=automation_enrollment_id,automation_step_key&select=*',
        {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify({ inquiry_id: inquiry.id, title: template.name, description: template.body, due_at: scheduledAt, due_date: scheduledAt.slice(0, 10), priority: 'medium', status: 'pending', automation_enrollment_id: enrollment.id, automation_step_key: template.step_key }),
        },
      )
      await supabaseRest('luxor_follow_up_actions?on_conflict=enrollment_id,step_key', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ enrollment_id: enrollment.id, template_id: template.id, step_key: template.step_key, channel: 'phone', scheduled_at: scheduledAt, status: 'task_created', task_id: task?.id ?? null }),
      })
    }
  }
  return enrollment
}

export async function recordLuxorFollowUpResponse(inquiryId: string) {
  const result = await supabaseRest<{ recorded: boolean; status?: string }>('rpc/luxor_record_brochure_follow_up_response', {
    method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiryId }),
  })
  return result
}

export async function controlLuxorBrochureFollowUp(inquiryId: string, action: 'pause' | 'resume' | 'stop') {
  const result = await supabaseRest<{ status: string; finalized: boolean }>('rpc/luxor_control_brochure_follow_up', {
    method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiryId, p_action: action }),
  })
  return result
}

export async function setLuxorFollowUpDisposition(inquiryId: string, disposition: 'no_response' | 'not_interested' | 'lost_another_venue' | 'event_canceled' | null, reason?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId)) throw new Error('Invalid lead id.')
  await supabaseRest(`luxor_inquiries?id=eq.${encodeURIComponent(inquiryId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      follow_up_disposition: disposition,
      follow_up_disposition_reason: reason?.trim() || null,
      follow_up_disposition_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  })
}

export async function stopLuxorBrochureFollowUp(inquiryId: string, reason: string) {
  const allowedReasons = new Set(['tour_scheduled', 'booked', 'not_interested', 'lost_another_venue', 'event_canceled', 'unsubscribed', 'manual_stop'])
  if (!allowedReasons.has(reason)) throw new Error('Unsupported follow-up stop reason.')
  const enrollments = await supabaseRest<LuxorFollowUpEnrollment[]>(
    `luxor_follow_up_enrollments?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&status=in.(active,paused)`,
  )
  if (!enrollments.length) return
  const ids = enrollments.map((item) => item.id)
  await supabaseRest(`luxor_follow_up_enrollments?inquiry_id=eq.${encodeURIComponent(inquiryId)}&automation_key=eq.brochure_lead&status=in.(active,paused)`, {
    method: 'PATCH', body: JSON.stringify({ status: 'stopped', ended_reason: reason, updated_at: new Date().toISOString() }),
  })
  for (const id of ids) {
    await supabaseRest(`luxor_follow_up_actions?enrollment_id=eq.${encodeURIComponent(id)}&status=in.(scheduled,email_queued,task_created,processing)`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }) })
    await supabaseRest(`luxor_email_jobs?automation_enrollment_id=eq.${encodeURIComponent(id)}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', last_error: `Brochure follow-up stopped: ${reason}`, updated_at: new Date().toISOString() }) })
    await supabaseRest(`luxor_tasks?automation_enrollment_id=eq.${encodeURIComponent(id)}&status=eq.pending`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
  }
}
