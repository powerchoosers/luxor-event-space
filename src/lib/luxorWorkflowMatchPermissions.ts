import type { MessageWorkflowMatch } from './luxorMessageWorkflowLookupServer'

/** Apply the destination's domain permissions before exposing a lookup result to chat or voice. */
export function filterWorkflowMatches(matches: MessageWorkflowMatch[], can: (permission: 'calendar' | 'calls' | 'finances' | 'planner') => boolean, isOwner = false) {
  return matches.filter((match) => {
    const href = match.href || ''
    if (/\/system-planner-(?:invitation|verification)$/.test(href) && (!isOwner || !can('planner'))) return false
    if (/\/system-agreement-owner(?:\?|$)/.test(href) && (!isOwner || !can('planner') || !can('finances'))) return false
    if (/\/system-(?:agreement-emails|agreement-client|agreement-package|offer-email|payment-request-email|layout-review-email|proposal-breakdown)(?:\?|$)/.test(href) && !can('planner')) return false
    if (/\/system-(?:offer-email|payment-request-email)(?:\?|$)/.test(href) && !can('finances')) return false
    if (/\/system-(?:final-payment-emails|installment-emails|invoice-reminders|manual-invoice-reminder|zelle-instructions|paid-invoice-email|payment-receipt|agreement-client|agreement-owner|agreement-package)(?:\?|$)|\/automations\/payment-reminders$/.test(href) && !can('finances')) return false
    if (/\/system-(?:tour-emails|tour-texts|tour-request-email|tour-no-show-email|event-emails|event-reminder|calendar-messages)(?:\?|$)|\/automations\/tour-notifications$/.test(href) && !can('calendar')) return false
    if (/\/system-phone-(?:missed_call|inbound_acknowledgment)$/.test(href) && !can('calls')) return false
    return true
  })
}
