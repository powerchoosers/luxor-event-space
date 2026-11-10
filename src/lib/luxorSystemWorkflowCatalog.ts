/** System message workflows represented by the shared builder. */
export const SYSTEM_WORKFLOWS = [
  ['system-inquiry-confirmation', 'Inquiry confirmation text', 'Customer-care SMS'],
  ['system-inquiry-email', 'Inquiry acknowledgment email', 'Inquiry receipt'],
  ['system-tour-request-email', 'Tour request received email', 'Tour request receipt'],
  ['system-newsletter-email', 'Newsletter confirmation email', 'Newsletter signup receipt'],
  ['system-layout-review-email', 'Layout review email', 'Staff-requested invitation'],
  ['system-planner-invitation', 'Planner presentation invitation', 'Owner-requested private presentation'],
  ['system-planner-verification', 'Planner verification code', 'Private presentation access'],
  ['system-tour-no-show-email', 'Tour no-show email', 'Staff-requested tour email'],
  ['system-offer-email', 'Proposal offer reminders', 'Offer emails'],
  ['system-payment-request-email', 'Payment request reminder', 'Payment email'],
  ['system-zelle-instructions', 'Zelle payment instructions', 'Client-selected payment method'],
  ['system-paid-invoice-email', 'Paid-invoice confirmation email', 'Stripe payment receipt'],
  ['system-payment-receipt', 'Staff-requested payment receipt', 'Reviewed payment receipt'],
  ['system-agreement-client', 'Executed agreement email', 'Signed client copy'],
  ['system-agreement-owner', 'Executed agreement owner audit', 'Internal owner copy'],
  ['system-agreement-emails', 'Agreement reminders', 'Agreement emails'],
  ['system-agreement-package', 'Event Agreement package', 'Signing invitation email'],
  ['system-event-emails', 'Event reminders and follow-up', 'Event emails'],
  ['system-manual-invoice-reminder', 'Staff-requested invoice reminder', 'Manual payment email'],
  ['system-proposal-breakdown', 'Staff-requested proposal breakdown', 'Package comparison email'],
  ['system-final-payment-emails', 'Final payment reminders', 'Scheduled final-balance emails'],
  ['system-installment-emails', 'Installment payment reminders', 'Scheduled payment emails'],
  ['system-payment-confirmation', 'Payment confirmation text', 'Payment SMS'],
  ['system-event-reminder', 'Event reminder text', 'Event SMS'],
  ['system-tour-texts', 'Tour confirmation and reminder texts', 'Tour SMS'],
  ['system-tour-emails', 'Tour confirmation and reminder emails', 'Tour email and calendar invitation'],
  ['system-calendar-messages', 'Calendar cancellation and updates', 'iCalendar delivery'],
  ['system-invoice-reminders', 'Invoice reminder texts', 'Before-due and overdue SMS'],
  ['system-phone-missed_call', 'Missed-call reply', 'Customer-care SMS'],
  ['system-phone-inbound_acknowledgment', 'Incoming-text acknowledgment', 'Customer-care SMS'],
] as const

/** Channel permission needed by the message-history endpoint. */
export function systemWorkflowChannelPermission(id: string): 'messages' | 'emails' {
  return [
    'system-inquiry-confirmation', 'system-payment-confirmation', 'system-event-reminder',
    'system-tour-texts', 'system-invoice-reminders', 'system-phone-missed_call',
    'system-phone-inbound_acknowledgment',
  ].includes(id) ? 'messages' : 'emails'
}
