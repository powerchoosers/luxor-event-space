import { renderFinalPaymentReminderCopy, validateFinalPaymentReminderCopy, type FinalPaymentReminderCopy } from './luxorFinalPaymentReminderCopy'
export type PaymentRequestReminderCopy = FinalPaymentReminderCopy
export const PAYMENT_REQUEST_REMINDER_EDIT_STARTER: PaymentRequestReminderCopy = {
  subject: 'Your Luxor payment is ready', title: 'Your secure payment is ready', greeting: 'Hi {{first_name}},',
  body: 'This is a reminder that your payment is ready. Please review the details and reply if you have any questions.',
}
export const validatePaymentRequestReminderCopy = validateFinalPaymentReminderCopy
export const renderPaymentRequestReminderCopy = renderFinalPaymentReminderCopy
