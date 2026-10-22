import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { buildBrochureDeliveryEmailHtml, buildLuxorFollowUpEmailHtml } from '@/lib/luxorEmailJobsServer'
import { getLuxorFollowUpSetup, isLuxorBrochureFollowUpSendingEnabled, updateLuxorFollowUpTemplate, type LuxorFollowUpTemplate } from '@/lib/luxorFollowUpsServer'
import { validateFollowUpContentUpdates, type FollowUpEmailContent } from '@/lib/luxorAutomationDetail'
import { getLuxorTourEmailTemplatePreviews } from '@/lib/luxorTourEmailServer'
import { getLuxorTourSmsTemplatePreviews } from '@/lib/luxorTextCampaignsServer'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { classifyAutomationStatus } from '@/lib/luxorAutomationsLibrary'
import { supabaseRestCount } from '@/lib/supabaseRestServer'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

async function safeCount(path: string) {
  try {
    return await supabaseRestCount(path)
  } catch {
    return null
  }
}

function contentOf(template: LuxorFollowUpTemplate): FollowUpEmailContent {
  return {
    name: template.name,
    subject: template.subject,
    body: template.body,
    cta_text: template.cta_text,
    cta_url: template.cta_url,
    secondary_cta_text: template.secondary_cta_text,
    secondary_cta_url: template.secondary_cta_url,
  }
}

function latestUpdatedAt(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp)[0]?.value ?? null
}

function syntheticInquiry() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    full_name: 'Sample guest',
    email: 'sample@example.invalid',
    phone: null,
    event_type: 'Sample event',
    guest_count: 80,
  } as unknown as LuxorInquiry
}

async function getBrochureDetail() {
  const { automation, templates } = await getLuxorFollowUpSetup()
  if (!automation) return null

  let sendsConfigured: boolean | null = null
  try {
    sendsConfigured = await isLuxorBrochureFollowUpSendingEnabled()
  } catch {
    sendsConfigured = null
  }
  const status = classifyAutomationStatus(automation, templates, sendsConfigured)
  const [activeEnrollments, sentEmails] = await Promise.all([
    safeCount('luxor_follow_up_enrollments?select=id,luxor_inquiries!inner(is_test)&automation_key=eq.brochure_lead&status=eq.active&luxor_inquiries.is_test=eq.false'),
    safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=eq.marketing_campaign&automation_enrollment_id=not.is.null&metadata->>automation_key=eq.brochure_lead&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
  ])

  return {
    kind: 'saved' as const,
    name: automation.name,
    status,
    trigger: 'A brochure request with an email address and marketing opt-in, from the brochure flow or homepage brochure source.',
    updatedAt: latestUpdatedAt([automation.updated_at, ...templates.map((template) => template.updated_at)]),
    automation,
    sendsConfigured,
    templates,
    activity: { activeEnrollments, sentEmails },
    brochureDelivery: {
      subject: 'Your Luxor at Las Palmas Venue Brochure',
      previewText: 'Your free Luxor at Las Palmas venue brochure is ready.',
      bodyHtml: buildBrochureDeliveryEmailHtml(syntheticInquiry()),
      note: 'This first email step reuses the existing brochure delivery. Its content is rendered by the application and the saved step copy is not used.',
    },
    enrollmentRules: [
      'At enrollment, the request must have an email address and marketing opt-in. Requests already booked, tour-confirmed, closed-lost, or carrying any follow-up disposition are skipped.',
      'The send gate also requires the saved workflow to be enabled, approved, timed in America/Chicago, and to have all nine configured steps active.',
      'Steps are anchored to the original brochure request time. Past-due steps are marked skipped; the sequence does not send a catch-up burst.',
      'Queued email HTML and subject are snapshots made when the lead enrolls. Copy edits affect future enrollments and isolated test-run copies only; they do not rewrite existing jobs or scheduled times.',
    ],
    exitRules: [
      'A response, manual pause/resume/stop, loss of marketing opt-in, a scheduled tour, a booking, a closed-lost status, or a stopping follow-up disposition can change or end an enrollment.',
      'Before a queued email is claimed, delivery rechecks active enrollment, workflow approval/timing and server gate, active step, marketing consent, email address, lifecycle status, disposition, and action state.',
    ],
  }
}

async function getTourDetail() {
  const [sentEmails, sentTexts] = await Promise.all([
    safeCount('luxor_email_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=in.(tour_confirmation,tour_reminder)&tour_revision_id=not.is.null&status=eq.sent&test_run_id=is.null&luxor_inquiries.is_test=eq.false'),
    safeCount('luxor_text_jobs?select=id,luxor_inquiries!inner(is_test)&job_type=in.(tour_confirmation,tour_reminder)&status=in.(sent,delivered)&luxor_inquiries.is_test=eq.false'),
  ])
  return {
    kind: 'system' as const,
    name: 'Tour confirmations & reminders',
    status: 'system-managed' as const,
    trigger: 'A tour is scheduled or rescheduled in the calendar system.',
    updatedAt: null,
    activity: { sentEmails, sentTexts },
    emails: getLuxorTourEmailTemplatePreviews(),
    texts: getLuxorTourSmsTemplatePreviews(),
    emailSteps: [
      { key: 'confirmation', name: 'Tour confirmation and calendar invitation', channel: 'Email + calendar', timing: 'When a confirmed tour schedule is saved.' },
      { key: 'reminder_24', name: '24-hour reminder', channel: 'Email', timing: '24 hours before the tour, when that time is still in the future.' },
      { key: 'reminder_2', name: '2-hour reminder', channel: 'Email', timing: '2 hours before the tour, when that time is still in the future.' },
    ],
    smsSteps: [
      { key: 'confirmation', name: 'Tour confirmation text', timing: 'When the inquiry has a phone number and automated SMS authorization allows the queue operation.' },
      { key: 'reminder', name: 'Tour reminder text', timing: '15:00 UTC on the calendar day before the tour, only if that time is still in the future.' },
    ],
    behavior: [
      'The confirmation email is rendered for the scheduled tour revision and saved with that revision. It uses the code fallback, or may use AI-tailored copy when the server provider is configured.',
      'Email reminders use the saved tour details and are queued only when their scheduled time is in the future. Delivery checks that the job still belongs to the current tour revision.',
      'Rescheduling replaces the current revision and cancels untouched queued email and text jobs for the prior schedule. Cancellation also prevents remaining eligible reminders.',
      'Text delivery continues through the existing consent and STOP checks. No global workflow activation, timing, or editing controls are available here.',
    ],
  }
}

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401, headers: NO_STORE_HEADERS })

  const id = request.nextUrl.searchParams.get('id')
  try {
    const detail = id === 'brochure_lead'
      ? await getBrochureDetail()
      : id === 'tour-notifications'
        ? await getTourDetail()
        : null
    if (!detail) return NextResponse.json({ error: 'This automation has no verified detail view.' }, { status: 404, headers: NO_STORE_HEADERS })
    return NextResponse.json(detail, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Automation details could not load. Try again.' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}

export async function POST(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401, headers: NO_STORE_HEADERS })

  let payload: { templateId?: unknown; updates?: unknown }
  try {
    payload = await request.json() as { templateId?: unknown; updates?: unknown }
  } catch {
    return NextResponse.json({ error: 'The preview request is not valid JSON.' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  if (typeof payload.templateId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.templateId)) {
    return NextResponse.json({ error: 'Select a saved email step to preview.' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  try {
    const { templates } = await getLuxorFollowUpSetup()
    const template = templates.find((item) => item.id === payload.templateId)
    if (!template || template.uses_existing_delivery || template.channel !== 'email') {
      return NextResponse.json({ error: 'This step does not have an editable saved email template.' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    const updates = validateFollowUpContentUpdates(contentOf(template), payload.updates)
    const preview = { ...template, ...updates }
    const bodyHtml = buildLuxorFollowUpEmailHtml(
      syntheticInquiry(),
      preview,
      'https://www.luxoratlaspalmas.com/unsubscribe/preview',
    )
    return NextResponse.json({
      subject: preview.subject || preview.name,
      previewText: preview.subject || preview.name,
      bodyHtml,
      note: 'Preview only. It uses a sample guest and a non-functional unsubscribe placeholder; no email is queued or sent.',
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The email preview could not be created.' }, { status: 400, headers: NO_STORE_HEADERS })
  }
}

export async function PATCH(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401, headers: NO_STORE_HEADERS })

  let payload: { templateId?: unknown; expectedUpdatedAt?: unknown; updates?: unknown }
  try {
    payload = await request.json() as { templateId?: unknown; expectedUpdatedAt?: unknown; updates?: unknown }
  } catch {
    return NextResponse.json({ error: 'The save request is not valid JSON.' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  if (typeof payload.templateId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.templateId)
    || typeof payload.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(payload.expectedUpdatedAt))) {
    return NextResponse.json({ error: 'Reload this email step before saving.' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  let validatedUpdates: Record<string, string | null>
  try {
    const { templates } = await getLuxorFollowUpSetup()
    const template = templates.find((item) => item.id === payload.templateId)
    if (!template || template.uses_existing_delivery || template.channel !== 'email') {
      return NextResponse.json({ error: 'This step does not have an editable saved email template.' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    validatedUpdates = validateFollowUpContentUpdates(contentOf(template), payload.updates)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Check the email fields and try again.' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  try {
    const template = await updateLuxorFollowUpTemplate(payload.templateId, validatedUpdates, payload.expectedUpdatedAt)
    return NextResponse.json({ template }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/changed after it was opened/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409, headers: NO_STORE_HEADERS })
    }
    return NextResponse.json({ error: 'The email could not be saved. Reload the step and try again.' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
