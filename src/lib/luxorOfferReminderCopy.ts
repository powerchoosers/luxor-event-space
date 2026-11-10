import { renderFinalPaymentReminderCopy, validateFinalPaymentReminderCopy, type FinalPaymentReminderCopy } from './luxorFinalPaymentReminderCopy'

export type OfferReminderCopy = FinalPaymentReminderCopy
/** A starting point for custom copy; restoring uses the existing AI/fallback path. */
export const OFFER_REMINDER_EDIT_STARTER: OfferReminderCopy = {
  subject: 'Your Luxor proposal is ready to review',
  title: 'Your event proposal is ready',
  greeting: 'Hi {{first_name}},',
  body: 'Please review your proposal and reply if you have any questions. Luxor will send the Event Agreement next.',
}
export const validateOfferReminderCopy = validateFinalPaymentReminderCopy
export const renderOfferReminderCopy = renderFinalPaymentReminderCopy
