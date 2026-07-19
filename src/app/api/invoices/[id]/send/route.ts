import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) return NextResponse.json({ error: 'Add the lead email address before sending.' }, { status: 400 })

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in Vercel before sending a payment link.' }, { status: 503 })
    }

    const stripe = new Stripe(secretKey)
    const origin = new URL(request.url).origin
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = invoice.line_items.map((item) => ({
      quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(item.unitPrice || 0) * 100),
        product_data: { name: item.description.slice(0, 127) },
      },
    })).filter((item) => Number(item.price_data?.unit_amount || 0) > 0)
    const taxAmount = Math.round(Math.max(0, Number(invoice.total) - Number(invoice.subtotal)) * 100)
    if (taxAmount > 0) {
      stripeLineItems.push({
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: taxAmount, product_data: { name: 'Sales tax' } },
      })
    }
    if (!stripeLineItems.length) return NextResponse.json({ error: 'Add at least one priced service before sending.' }, { status: 400 })
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: inquiry.email,
      client_reference_id: invoice.id,
      line_items: stripeLineItems,
      metadata: { invoice_id: invoice.id, inquiry_id: invoice.inquiry_id || '' },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment/cancelled`,
    })
    if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

    const pdf = await buildLuxorInvoicePdf(invoice, inquiry)
    await sendLuxorZohoEmail({
      to: inquiry.email,
      subject: `Your Luxor Event Space proposal - ${invoice.client_name}`,
      content: [
        `<p>Hi ${escapeHtml(invoice.client_name)},</p>`,
        '<p>Your Luxor Event Space proposal is attached.</p>',
        `<p><a href="${checkout.url}">Review and pay securely with Stripe</a></p>`,
        '<p>Please reply to this email if you would like any services or quantities adjusted.</p>',
        '<p>Luxor Event Space<br>1934 Pendleton Dr, Garland, TX 75041</p>',
      ].join(''),
      attachments: [{ filename: `Luxor-Proposal-${invoice.id.slice(0, 8)}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })

    const updated = await updateInvoice(invoice.id, { status: 'sent' })
    return NextResponse.json({ invoice: updated, checkoutUrl: checkout.url })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send proposal.' }, { status: 500 })
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}
