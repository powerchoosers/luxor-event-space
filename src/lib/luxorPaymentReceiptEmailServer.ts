import 'server-only'

import crypto from 'node:crypto'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'
import { getLuxorBooking } from './luxorBookingsServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { getInvoice } from './luxorInvoicesServer'
import { supabaseRest } from './supabaseRestServer'
import { buildLuxorPaymentReceiptPdf } from './luxorPaymentReceiptPdf'
import { luxorMailAddress } from './luxorMailConfig'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character))

export type LuxorPaymentReceiptEmailContext = {
  payment: LuxorPayment
  booking: LuxorBooking | null
  inquiry: LuxorInquiry | null
  invoice: LuxorInvoice | null
  recipient: string
  eventName: string
  receiptNumber: string
  subject: string
  message: string
  html: string
  filename: string
  fingerprint: string
  pdf: Uint8Array
  pdfSha256: string
}

export async function getLuxorPaymentReceiptEmailContext(paymentId: string): Promise<LuxorPaymentReceiptEmailContext> {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw new Error('Payment record not found.')
  const [payment] = await supabaseRest<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(paymentId)}&limit=1`)
  if (!payment) throw new Error('Payment record not found.')
  if (payment.status !== 'paid') throw new Error('A receipt can only be created for a confirmed paid transaction.')

  const [booking, directInquiry, invoice] = await Promise.all([
    payment.booking_id ? getLuxorBooking(payment.booking_id) : Promise.resolve(null),
    payment.inquiry_id ? getLuxorInquiry(payment.inquiry_id) : Promise.resolve(null),
    payment.invoice_id ? getInvoice(payment.invoice_id) : Promise.resolve(null),
  ])
  const inquiry = directInquiry || (booking?.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null)
  const recipient = luxorMailAddress(inquiry?.email || booking?.email || '')
  if (!recipient) throw new Error('No client email is saved for this payment.')

  const eventName = invoice?.event_type || booking?.event_type || 'your event'
  const receiptNumber = payment.id.slice(0, 8).toUpperCase()
  const subject = `Payment Receipt – ${eventName === 'your event' ? `Receipt ${receiptNumber}` : eventName}`
  const firstName = (inquiry?.full_name || booking?.client_name || 'there').trim().split(/\s+/)[0] || 'there'
  const receivedAt = payment.paid_at || payment.created_at
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(payment.amount || 0))
  const receivedDate = new Date(receivedAt).toLocaleDateString('en-US', { dateStyle: 'long' })
  const message = [
    `Hi ${firstName},`,
    '',
    `Thank you for your payment! We’ve successfully received ${amount} for ${eventName}.`,
    '',
    'Your payment receipt is attached to this email for your records.',
    '',
    'Thank you for choosing Luxor at Las Palmas Events. We’re looking forward to helping make your event special.',
    '',
    'Best regards,',
    'Luxor at Las Palmas Events',
    '',
    `Receipt ${receiptNumber} · Received ${receivedDate} · ${payment.payment_method || 'Payment method not recorded'}`,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#fffdfa;color:#211b17;border:1px solid #ded6ca"><div style="padding:20px 24px;background:#101010;color:#d1ad61;font-family:Georgia,serif;letter-spacing:.12em">LUXOR AT LAS PALMAS EVENTS</div><div style="padding:28px 24px"><h1 style="margin:0 0 20px;color:#1b1713;font-family:Georgia,serif;font-size:24px">Payment received</h1><p>Hi ${escapeHtml(firstName)},</p><p>Thank you for your payment! We’ve successfully received <strong>${escapeHtml(amount)}</strong> for ${escapeHtml(eventName)}.</p><p>Your payment receipt is attached to this email for your records.</p><p>Thank you for choosing Luxor at Las Palmas Events. We’re looking forward to helping make your event special.</p><p style="margin-top:24px">Best regards,<br />Luxor at Las Palmas Events</p><p style="margin-top:24px;padding-top:14px;border-top:1px solid #e7dfd4;color:#756a5d;font-size:12px">Receipt ${receiptNumber} · Received ${escapeHtml(receivedDate)} · ${escapeHtml(payment.payment_method || 'Payment method not recorded')}</p></div></div>`
  const pdf = await buildLuxorPaymentReceiptPdf({ payment, booking, inquiry, invoice })
  const filename = `Luxor-Payment-Receipt-${receiptNumber}.pdf`
  const fingerprintSource = {
    payment: {
      id: payment.id, status: payment.status, amount: payment.amount, paid_at: payment.paid_at,
      created_at: payment.created_at, payment_method: payment.payment_method,
      processor_reference: payment.processor_reference, invoice_id: payment.invoice_id,
      booking_id: payment.booking_id, inquiry_id: payment.inquiry_id,
      payment_kind: payment.metadata?.payment_kind,
      installment_allocations: payment.metadata?.installment_allocations,
      refundable_security_deposit: payment.metadata?.refundable_security_deposit,
      initial_booking_payment: payment.metadata?.initial_booking_payment,
    },
    booking: booking && { id: booking.id, event_type: booking.event_type, event_date: booking.event_date, client_name: booking.client_name },
    inquiry: inquiry && { id: inquiry.id, full_name: inquiry.full_name, email: inquiry.email, event_type: inquiry.event_type },
    invoice: invoice && { id: invoice.id, invoice_kind: invoice.invoice_kind, description: invoice.description, event_type: invoice.event_type },
    recipient, subject, html, filename,
  }
  const pdfSha256 = crypto.createHash('sha256').update(pdf).digest('hex')
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintSource)).digest('hex')

  return { payment, booking, inquiry, invoice, recipient, eventName, receiptNumber, subject, message, html, filename, fingerprint, pdf, pdfSha256 }
}
