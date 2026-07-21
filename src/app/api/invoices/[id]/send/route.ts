import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { buildLuxorPaymentRequestEmail } from '@/lib/luxorProposalEmailServer'
import { saveLuxorProposalPdf } from '@/lib/luxorDocumentsServer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const expectedSubtotal = Math.round(invoice.line_items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0), 0) * 100) / 100
    const expectedTotal = Math.round(expectedSubtotal * (1 + Math.max(0, Number(invoice.tax_rate) || 0)) * 100) / 100
    if (Math.abs(expectedSubtotal - Number(invoice.subtotal)) >= 0.005 || Math.abs(expectedTotal - Number(invoice.total)) >= 0.005) {
      return NextResponse.json({ error: 'The invoice totals no longer match its line items. Recreate the proposal before sending it.' }, { status: 409 })
    }
    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) return NextResponse.json({ error: 'Add the lead email address before sending.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { paymentAmount?: number; paymentLabel?: string }
    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
    if (balanceDue <= 0) return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 })
    const requestedAmount = Number(body.paymentAmount)
    const paymentAmount = Number.isFinite(requestedAmount) ? Math.round(requestedAmount * 100) / 100 : balanceDue
    if (paymentAmount < 0.5 || paymentAmount > balanceDue) {
      return NextResponse.json({ error: `Payment must be between $0.50 and $${balanceDue.toFixed(2)}.` }, { status: 400 })
    }
    const paymentLabel = String(body.paymentLabel || (paymentAmount === balanceDue ? 'Remaining balance' : 'Installment payment')).trim().slice(0, 80)
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = bookings.find((item) => item.invoice_id === invoice.id) || bookings[0] || null

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in Vercel before sending a payment link.' }, { status: 503 })
    }

    const stripe = new Stripe(secretKey)
    const origin = new URL(request.url).origin
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: inquiry.email,
      client_reference_id: invoice.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(paymentAmount * 100),
          product_data: { name: `${paymentLabel} - Luxor Event Space` },
        },
      }],
      metadata: {
        invoice_id: invoice.id,
        inquiry_id: invoice.inquiry_id || '',
        booking_id: booking?.id || '',
        payment_label: paymentLabel,
      },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment/cancelled`,
    })
    if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

    const pdf = await buildLuxorInvoicePdf(invoice, inquiry)
    await saveLuxorProposalPdf({ invoice, inquiryId: invoice.inquiry_id, pdf, createdBy: session.email })
    const email = buildLuxorPaymentRequestEmail({ invoice, inquiry, checkoutUrl: checkout.url, paymentAmount, paymentLabel, paidTotal, balanceDue })
    await sendLuxorZohoEmail({
      to: inquiry.email,
      subject: email.subject,
      content: email.html,
      attachments: [{ filename: `Luxor-Proposal-${invoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })

    const updated = await updateInvoice(invoice.id, { status: 'sent' })
    return NextResponse.json({ invoice: updated, checkoutUrl: checkout.url, paymentAmount, balanceDue })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send proposal.' }, { status: 500 })
  }
}
