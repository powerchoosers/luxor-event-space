import { paidInvoiceCopyHtml, renderPaidInvoiceEmailCopy, type PaidInvoiceEmailCopy } from './luxorPaidInvoiceEmailCopy'

/** Keep generated agreement and payment facts intact when rendering optional copy. */
export function renderAgreementClientCopy(originalHtml: string, paymentSection: string, firstName: string, copy: PaidInvoiceEmailCopy | null) {
  if (!copy) return { html: originalHtml, subject: null }
  const rendered = renderPaidInvoiceEmailCopy(copy, firstName)
  const safe = paidInvoiceCopyHtml(rendered)
  const escapedName = firstName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const greeting = `<p>Hi ${escapedName},</p>`
  if (!originalHtml.includes(greeting) || !originalHtml.includes(paymentSection)) throw new Error('Agreement notice could not be customized safely.')
  return { html: originalHtml.replace(greeting, `<p>${safe.greeting}</p>`).replace(paymentSection, `${paymentSection}<p>${safe.closing}</p>`), subject: rendered.subject }
}
