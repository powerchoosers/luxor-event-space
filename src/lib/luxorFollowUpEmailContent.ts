const EMAIL_STEP_NUMBER = /^email_([1-5])$/

/**
 * Follow-up template names include an internal sequence label. Keep that
 * label in portal/task views, but remove it from matching customer-facing
 * email headings and titles.
 */
export function customerFacingFollowUpTitle(name: string, stepKey: string) {
  const stepNumber = stepKey.match(EMAIL_STEP_NUMBER)?.[1]
  if (!stepNumber) return name

  return name.replace(new RegExp(`^Email #${stepNumber}\\s*[—–-]\\s*`, 'i'), '')
}

/**
 * Older queued brochure follow-ups store rendered HTML snapshots. Clean only
 * their generated document title and h1 immediately before delivery, without
 * touching the rest of the message content.
 */
export function cleanBrochureFollowUpEmailSnapshot(html: string, stepKey: string) {
  const cleanNodeText = (_match: string, openingTag: string, text: string, closingTag: string) =>
    `${openingTag}${customerFacingFollowUpTitle(text, stepKey)}${closingTag}`

  return html
    .replace(/(<title\b[^>]*>)([\s\S]*?)(<\/title\s*>)/i, cleanNodeText)
    .replace(/(<h1\b[^>]*>)([\s\S]*?)(<\/h1\s*>)/i, cleanNodeText)
}

export function isBrochureFollowUpEmailSnapshot(job: {
  job_type: string
  automation_enrollment_id?: string | null
  automation_step_key?: string | null
  metadata?: Record<string, unknown> | null
}) {
  return job.job_type === 'marketing_campaign'
    && Boolean(job.automation_enrollment_id)
    && Boolean(job.automation_step_key?.match(EMAIL_STEP_NUMBER))
    && job.metadata?.automation_key === 'brochure_lead'
    && job.metadata?.follow_up_sequence === true
}
