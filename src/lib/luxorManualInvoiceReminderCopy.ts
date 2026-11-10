import { FINAL_PAYMENT_REMINDER_DEFAULT, type FinalPaymentReminderCopy } from './luxorFinalPaymentReminderCopy'

export const MANUAL_INVOICE_REMINDER_KEYS = ['unpaid_invoice', 'final_payment'] as const
export type ManualInvoiceReminderKey = typeof MANUAL_INVOICE_REMINDER_KEYS[number]

export const MANUAL_INVOICE_REMINDER_DEFAULTS: Record<ManualInvoiceReminderKey, FinalPaymentReminderCopy> = {
  unpaid_invoice: {
    subject: 'Payment reminder for your Luxor event',
    title: 'Reminder: payment pending',
    greeting: 'Hi {{first_name}},',
    body: 'We are reaching out to provide a quick update regarding your invoice for your upcoming event. Please review the payment details below and let us know if you have any questions.',
  },
  final_payment: {
    ...FINAL_PAYMENT_REMINDER_DEFAULT,
    subject: 'Final payment reminder for your Luxor event',
  },
}
