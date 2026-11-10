import { renderFinalPaymentReminderCopy, validateFinalPaymentReminderCopy, type FinalPaymentReminderCopy } from './luxorFinalPaymentReminderCopy'
export const AGREEMENT_REMINDER_KEYS = ['view', 'sign'] as const
export type AgreementReminderKey = typeof AGREEMENT_REMINDER_KEYS[number]
export type AgreementReminderCopy = FinalPaymentReminderCopy
export const AGREEMENT_REMINDER_DEFAULTS: Record<AgreementReminderKey, AgreementReminderCopy> = {
  view: { subject: 'Your Luxor agreement is ready to review', title: 'Your agreement is ready', greeting: 'Hi {{first_name}},', body: 'Your Luxor Event Space agreement and Guest Guide are ready in the secure signing portal.' },
  sign: { subject: 'Reminder: your Luxor agreement is awaiting signature', title: 'One step remains', greeting: 'Hi {{first_name}},', body: 'Your agreement has been opened but is not signed yet. Please review the final details and sign when you are ready.' },
}
export const validateAgreementReminderCopy = validateFinalPaymentReminderCopy
export const renderAgreementReminderCopy = renderFinalPaymentReminderCopy
