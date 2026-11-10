type ProgressKind = 'custom' | 'brochure' | 'system'
type ProgressPayload = { contacts: Array<Record<string, unknown>>; counts: Record<string, number>; pageSize: number; direct?: boolean }

/** Preserve the distinction between workflow enrollments and recorded message jobs. */
export function workflowProgressForChat(kind: ProgressKind, result: ProgressPayload) {
  const contacts = result.contacts.map((contact) => kind === 'brochure'
    ? { name: contact.name, email: contact.email, status: contact.status, nextAction: contact.nextAction }
    : kind === 'system'
      ? { name: contact.name, status: contact.status, deliveryStatus: contact.deliveryStatus, message: contact.stepName, scheduledFor: contact.scheduled_for, sentAt: contact.sent_at }
      : { name: contact.name, email: contact.email, status: contact.status, currentStep: contact.stepName, nextRunAt: contact.next_run_at })
  const note = kind === 'brochure' ? 'Earliest unresolved action is shown; other actions may also be scheduled.'
    : kind === 'system' ? (result.direct ? 'Counts are direct message attempts, not enrollments or unique contacts. Delivery status is shown only when recorded.' : 'Counts are message jobs linked to non-test inquiries, not enrollments or unique contacts. Sent means accepted for sending, not confirmed delivery. Unlinked jobs are excluded.')
      : 'Step names come from the version each enrollment entered.'
  return { counts: result.counts, pageSize: result.pageSize, contacts, note }
}
